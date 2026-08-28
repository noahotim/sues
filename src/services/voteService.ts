import { db } from "../lib/firebase";
import { collection, query, where, getDocs, onSnapshot, doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
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
  /**
   * Record a COMPLETE ballot - every position in an election - in a single
   * confirmation. votesByPosition maps each positionId to the chosen candidate.
   *
   * Steps per VOTED position (atomic once-only):
   *   1. claim vote_receipts/{email}__{election}__{position}   (deterministic id)
   *   2. create votes/{nonce} (anonymous ballot)
   * Positions the voter already completed are skipped and not re-counted.
   *
   * Unopposed positions may be ABSTAINED instead of voted: abstainedPositionIds
   * marks them as "resolved" on the roster (so the ballot counts as submitted
   * and the position is not left silently hanging) but records NO anonymous
   * vote - the voter declines to affirm. Those abstainers therefore count as
   * not-affirming in the 51% confidence test.
   * Only when EVERY position is resolved (voted or abstained) is the voter
   * marked fully voted (hasVoted) / participating.
   */
  submitBallot: async (
    electionId: string,
    votesByPosition: Record<string, string>,
    abstainedPositionIds: string[] = []
  ) => {
    try {
      const user = getAuth().currentUser;
      if (!user || !user.email) return { error: "You must be signed in to vote." };
      const email = user.email.toLowerCase();

      const positionIds = Object.keys(votesByPosition).filter((p) => votesByPosition[p]);
      if (positionIds.length === 0 && abstainedPositionIds.length === 0) {
        return { error: "Select a candidate or decline each position before submitting." };
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
        // Firestore returns these as Timestamp instances (or strings after the
        // production backfill). Normalize both to an epoch millis for a strict
        // wall-clock comparison against the client clock.
        const toEpoch = (v: any): number | null => {
          if (!v) return null;
          if (typeof v.toDate === "function") return v.toDate().getTime();
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d.getTime();
        };
        const startMs = toEpoch(el.startTime);
        const endMs = toEpoch(el.endTime);
        if (startMs != null && startMs > now)
          return { error: "Voting for this election has not opened yet." };
        if (endMs != null && endMs < now)
          return { error: "Voting for this election has closed." };
      }
      if (!regSnap?.exists() && !rosterSnap?.exists()) {
        return { error: "You are not registered as an eligible voter for this election." };
      }

      // Total positions in this election determines "ballot complete".
      const posSnap = await getDocs(
        query(collection(db, "positions"), where("electionId", "==", electionId))
      );
      const totalPositions = posSnap.docs.length;

      // Abstention is only ever allowed on UNOPPOSED positions (exactly one
      // candidate) - a voter may withhold their vote of confidence there. If
      // they try to abstain on a contested position, force a real selection.
      if (abstainedPositionIds.length > 0) {
        const [posIdSet, candSnap] = [
          new Set(posSnap.docs.map((d) => d.id)),
          await getDocs(
            query(collection(db, "candidates"), where("electionId", "==", electionId))
          ),
        ];
        const countsByPos: Record<string, number> = {};
        candSnap.docs.forEach((d) => {
          const pid = d.data().positionId;
          countsByPos[pid] = (countsByPos[pid] || 0) + 1;
        });
        const invalid = abstainedPositionIds.filter(
          (pid) => !posIdSet.has(pid) || (countsByPos[pid] || 0) !== 1
        );
        if (invalid.length > 0) {
          return { error: "You may only decline confidence on unopposed positions." };
        }
      }

      let recorded = 0;
      let already = 0;
      let failed: string | null = null;
      const recordedPositions: string[] = [];

      for (const positionId of positionIds) {
        const candidateId = votesByPosition[positionId];
        const receiptRef = doc(db, "vote_receipts", `${email}__${electionId}__${positionId}`);

        // 1. Claim the ballot (atomic once-only lock).
        const nonce = makeNonce();
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
            already++; // already voted this position earlier
            continue;
          }
          failed = `One or more votes could not be recorded. Contact the election administrator.`;
          break;
        }

        // 2. Record the anonymous ballot.
        try {
          await setDoc(doc(db, "votes", nonce), {
            electionId,
            positionId,
            candidateId,
            createdAt: serverTimestamp(),
          });
        } catch {
          failed = "Ballot accepted but recording failed. Contact the election administrator.";
          break;
        }

        // 3. Anonymous audit trail (never identifies the voter).
        auditService.log("CAST_VOTE", "vote", candidateId, { electionId, positionId });
        recorded++;
        recordedPositions.push(positionId);
      }

      // 4. Turnout bookkeeping (never blocks the vote). The voter counts as
      // fully "voted" only once EVERY position in this election is cast.
      try {
        const rosterRef = doc(db, "voter_roster", `voter_${electionId}_${email}`);
        const rosterSnap = await getDoc(rosterRef);
        const prevVoted: string[] = Array.isArray(rosterSnap.data()?.votedPositions)
          ? rosterSnap.data()!.votedPositions
          : [];
        const resolvedNow = Array.from(
          new Set([...prevVoted, ...recordedPositions, ...abstainedPositionIds])
        );
        const allVoted = totalPositions > 0 && resolvedNow.length >= totalPositions;

        const patch: Record<string, unknown> = {
          // votedPositions now means "positions the voter RESOLVED" - voted or
          // abstained - so an abstained unopposed position is not left dangling
          // and the voter still counts as having participated.
          votedPositions: resolvedNow,
          // Only write hasVoted when every position in the ballot is resolved.
          ...(allVoted ? { hasVoted: true } : {}),
        };
        await setDoc(rosterRef, patch, { merge: true });
      } catch {
        /* dashboard flag only */
      }

      if (failed) return { error: failed };
      if (recorded === 0 && already > 0) {
        return { error: "You have already voted in this election." };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || "Failed to submit vote" };
    }
  },

  /** Single-position convenience wrapper for the full-ballot submit. */
  submitVote: async (electionId: string, positionId: string, candidateId: string) => {
    return voteService.submitBallot(electionId, { [positionId]: candidateId });
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
