import { db } from "../lib/firebase";
import { collection, query, where, getDocs, onSnapshot, doc, setDoc, serverTimestamp, arrayUnion, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { auditService } from "./auditService";

export interface Vote {
  id: string;
  electionId: string;
  positionId: string;
  candidateId: string;
  // NO voter identity inside the record - ballots stay secret.
}

/** Unpredictable nonce used as the anonymous ballot document id. */
function makeNonce(): string {
  const bytes = new Uint8Array(20);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export const voteService = {
  /**
   * Functionless voting that stays once-and-only-once per voter per position:
   *
   *  1. Ballot claim  - create `vote_receipts/{email}__{election}__{position}`.
   *     The deterministic id means a second attempt - even milliseconds later -
   *     collides with an existing document and Firestore rejects it atomically.
   *     Security rules additionally verify roster membership and that the
   *     election is active and within its voting window.
   *  2. Anonymous vote - create `votes/{nonce}` where nonce is an unguessable
   *     random string stored in the receipt. Rules tie the two together, so the
   *     public tally never contains voter identity, yet only legitimate
   *     receipts can mint exactly one ballot each.
   *  3. Turnout flag   - best-effort update of the voter's own roster row for
   *     dashboards (cosmetic; integrity lives in steps 1-2).
   */
  submitVote: async (electionId: string, positionId: string, candidateId: string) => {
    try {
      const user = getAuth().currentUser;
      if (!user || !user.email) return { error: "You must be signed in to vote." };
      const email = user.email.toLowerCase();

      const receiptRef = doc(db, "vote_receipts", `${email}__${electionId}__${positionId}`);

      // Friendly early check (rules still enforce it atomically).
      const existing = await getDoc(receiptRef).catch(() => null);
      if (existing && existing.exists()) {
        return { error: "You have already voted for this position." };
      }

      // Pre-flight checks in parallel so voters get precise feedback instead of
      // a generic permission error. The atomic rules remain the final authority.
      const [elSnap, regSnap, rosterSnap] = await Promise.all([
        getDoc(doc(db, "elections", electionId)).catch(() => null),
        getDoc(doc(db, "eligible_emails", email)).catch(() => null),
        getDoc(doc(db, "voter_roster", `voter_${electionId}_${email}`)).catch(() => null),
      ]);
      if (elSnap && elSnap.exists()) {
        const el = elSnap.data();
        if (el.status !== "active") return { error: "This election is not currently open for voting." };
        const now = Date.now();
        if (el.startTime && new Date(el.startTime).getTime() > now)
          return { error: "Voting for this election has not opened yet." };
        if (el.endTime && new Date(el.endTime).getTime() < now)
          return { error: "Voting for this election has closed." };
      }
      if (!regSnap?.exists() && !rosterSnap?.exists()) {
        return { error: "You are not registered as an eligible voter for this election." };
      }

      const nonce = makeNonce();

      // 1. Claim the ballot (atomic once-only lock).
      try {
        await setDoc(receiptRef, {
          voterEmail: email,
          electionId,
          positionId,
          nonce,
          createdAt: serverTimestamp(),
        });
      } catch (err: any) {
        if (String(err?.code) === "already-exists") {
          return { error: "You have already voted for this position." };
        }
        return {
          error:
            "Your vote could not be recorded. Please confirm you are on this election's voter roster and that voting is open.",
        };
      }

      // 2. Record the anonymous ballot.
      try {
        await setDoc(doc(db, "votes", nonce), {
          electionId,
          positionId,
          candidateId,
          createdAt: serverTimestamp(),
        });
      } catch (err: any) {
        // Receipt exists without a ballot: surface clearly instead of losing it.
        return { error: "Ballot accepted but recording failed. Contact the election administrator." };
      }

      // 3. Anonymous audit trail (never identifies the voter).
      auditService.log("CAST_VOTE", "vote", candidateId, { electionId, positionId });

      // 4. Turnout bookkeeping (never blocks the vote).
      try {
        await setDoc(
          doc(db, "voter_roster", `voter_${electionId}_${email}`),
          { hasVoted: true, votedPositions: arrayUnion(positionId) },
          { merge: true }
        );
      } catch {
        /* dashboard flag only */
      }

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || "Failed to submit vote" };
    }
  },

  subscribeToVotes: (electionId: string, callback: (data: Vote[]) => void) => {
    const q = query(collection(db, "votes"), where("electionId", "==", electionId));
    return onSnapshot(q, (snapshot) => {
      const votes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vote));
      callback(votes);
    });
  },

  getVotes: async (electionId: string) => {
    try {
      const q = query(collection(db, "votes"), where("electionId", "==", electionId));
      const snapshot = await getDocs(q);
      const votes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vote));
      return { data: votes, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }
};
