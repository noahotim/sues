import { db } from "../lib/firebase";
import { collection, doc, getDocs, setDoc, deleteDoc, query, where, onSnapshot, writeBatch } from "firebase/firestore";

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

  bulkUploadRoster: async (electionId: string, voters: { email: string; name: string }[]) => {
    // Batched writes: one commit per 400 rows (Firestore batch limit is 500).
    try {
      const batches: ReturnType<typeof writeBatch>[] = [];
      let current = writeBatch(db);
      let ops = 0;
      for (const voter of voters) {
        current.set(doc(collection(db, "voter_roster")), {
          electionId,
          voterEmail: voter.email.toLowerCase(),
          voterName: voter.name,
          hasVoted: false,
        });
        ops += 1;
        if (ops === 400) {
          batches.push(current);
          current = writeBatch(db);
          ops = 0;
        }
      }
      if (ops > 0) batches.push(current);
      await Promise.all(batches.map((b) => b.commit()));
      return { data: { success: true }, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }
};
