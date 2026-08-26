import { db } from "../lib/firebase";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";

export interface VoterRosterEntry {
  id: string;
  electionId: string;
  voterEmail: string;
  voterName: string;
  hasVoted: boolean;
  votedPositions: string[];
}

export const rosterService = {
  subscribeToRoster: (electionId: string, callback: (data: VoterRosterEntry[]) => void) => {
    const q = query(collection(db, "voter_roster"), where("electionId", "==", electionId));
    return onSnapshot(q, (snapshot) => {
      const roster = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoterRosterEntry));
      callback(roster);
    });
  },

  getRoster: async (electionId: string) => {
    try {
      const q = query(collection(db, "voter_roster"), where("electionId", "==", electionId));
      const snapshot = await getDocs(q);
      const roster = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoterRosterEntry));
      return { data: roster, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  addVoter: async (data: Omit<VoterRosterEntry, "id" | "hasVoted" | "votedPositions">) => {
    try {
      const voterEmail = data.voterEmail.trim().toLowerCase();
      if (!voterEmail.includes("@")) {
        return { data: null, error: "A valid email address is required." };
      }
      // Deterministic id => the same email can never appear twice per election.
      const id = `voter_${data.electionId}_${voterEmail}`;
      const ref = doc(db, "voter_roster", id);
      const existing = await getDoc(ref);
      const fullData = {
        electionId: data.electionId,
        voterEmail,
        voterName: data.voterName.trim(),
        // Preserve existing voting state so re-adding never resets it.
        hasVoted: existing.exists() ? Boolean(existing.data()?.hasVoted) : false,
        votedPositions: existing.exists() ? (existing.data()?.votedPositions || []) : [],
      };
      await setDoc(ref, fullData);
      // Also add to the system-wide register so this voter is eligible in
      // every active election (rules let election managers maintain it).
      await setDoc(
        doc(db, "eligible_emails", voterEmail),
        { email: voterEmail, role: "VOTER", addedAt: serverTimestamp() },
        { merge: true }
      );
      return { data: { id, ...fullData }, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  removeVoter: async (id: string) => {
    try {
      await deleteDoc(doc(db, "voter_roster", id));
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  // Voters are only allowed to read their OWN roster row (rules enforce this),
  // so eligibility must be checked with an email-scoped query. Loading the
  // whole roster (getRoster) is permission-denied for a plain Voter.
  isOnRoster: async (electionId: string, voterEmail: string) => {
    try {
      const q = query(
        collection(db, "voter_roster"),
        where("electionId", "==", electionId),
        where("voterEmail", "==", voterEmail.toLowerCase()),
      );
      const snapshot = await getDocs(q);
      return { data: !snapshot.empty, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // A voter reads ONLY their own roster row (rules enforce this), so this uses
  // an email-scoped compound query. Returns the row so the client can tell
  // which positions the voter already cast a ballot for.
  getMyRosterEntry: async (electionId: string, voterEmail: string) => {
    try {
      const q = query(
        collection(db, "voter_roster"),
        where("electionId", "==", electionId),
        where("voterEmail", "==", voterEmail.toLowerCase()),
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return { data: null, error: null };
      const doc = snapshot.docs[0];
      const data = doc.data();
      return {
        data: {
          id: doc.id,
          electionId,
          voterEmail: data.voterEmail,
          voterName: data.voterName || "",
          hasVoted: Boolean(data.hasVoted),
          votedPositions: Array.isArray(data.votedPositions) ? data.votedPositions : [],
        } as VoterRosterEntry,
        error: null,
      };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // The uploaded register is system-wide: check the eligible_emails doc.
  isOnRegister: async (email: string) => {
    try {
      const snap = await getDoc(doc(db, "eligible_emails", email.toLowerCase()));
      return { data: snap.exists(), error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  // Register members get a per-election roster row on first visit so turnout
  // tracking works; rules permit this only for genuine register entries.
  ensureRosterRow: async (electionId: string, email: string, name = "") => {
    try {
      const em = email.toLowerCase();
      await setDoc(doc(db, "voter_roster", `voter_${electionId}_${em}`), {
        electionId,
        voterEmail: em,
        voterName: name,
        hasVoted: false,
        votedPositions: [],
      });
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  bulkUploadRoster: async (electionId: string, voters: { email: string; name: string }[]) => {
    try {
      let inserted = 0;
      let skipped = 0;
      const seen = new Set<string>();
      for (const voter of voters) {
        const email = (voter.email || "").trim().toLowerCase();
        if (!email.includes("@")) { skipped++; continue; }
        const id = `voter_${electionId}_${email}`;
        if (seen.has(id)) { skipped++; continue; } // duplicate inside this file
        seen.add(id);
        const ref = doc(db, "voter_roster", id);
        const existing = await getDoc(ref);
        const fullData = {
          electionId,
          voterEmail: email,
          voterName: (voter.name || "").trim(),
          hasVoted: existing.exists() ? Boolean(existing.data()?.hasVoted) : false,
          votedPositions: existing.exists() ? (existing.data()?.votedPositions || []) : [],
        };
        await setDoc(ref, fullData);
        // Add to the system-wide register too (eligible in every election).
        await setDoc(
          doc(db, "eligible_emails", email),
          { email, role: "VOTER", addedAt: serverTimestamp() },
          { merge: true }
        );
        inserted++;
      }
      return { data: { success: true, inserted, skipped }, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }
};
