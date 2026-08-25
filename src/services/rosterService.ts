import { db } from "../lib/firebase";
import { collection, doc, getDocs, setDoc, deleteDoc, query, where, onSnapshot } from "firebase/firestore";

export interface VoterRosterEntry {
  id: string;
  electionId: string;
  voterEmail: string;
  voterName: string;
  hasVoted: boolean;
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

  addVoter: async (data: Omit<VoterRosterEntry, "id" | "hasVoted">) => {
    try {
      const newDocRef = doc(collection(db, "voter_roster"));
      const fullData = { ...data, hasVoted: false };
      await setDoc(newDocRef, fullData);
      return { data: { id: newDocRef.id, ...fullData }, error: null };
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

  bulkUploadRoster: async (electionId: string, voters: { email: string; name: string }[]) => {
    // In Firestore, we should ideally use a batch
    try {
      // NOTE: This could be optimized using writeBatch
      for (const voter of voters) {
        const newDocRef = doc(collection(db, "voter_roster"));
        await setDoc(newDocRef, {
          electionId,
          voterEmail: voter.email,
          voterName: voter.name,
          hasVoted: false
        });
      }
      return { data: { success: true }, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }
};
