import { db } from "../lib/firebase";
import { collection, doc, getDocs, setDoc, deleteDoc, query, where, onSnapshot } from "firebase/firestore";

export interface VoterRosterEntry {
  id: string;
  election_id: string;
  voter_email: string;
  voter_name: string;
  has_voted: boolean;
}

export const rosterService = {
  subscribeToRoster: (electionId: string, callback: (data: VoterRosterEntry[]) => void) => {
    const q = query(collection(db, "voter_roster"), where("election_id", "==", electionId));
    return onSnapshot(q, (snapshot) => {
      const roster = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoterRosterEntry));
      callback(roster);
    });
  },

  getRoster: async (electionId: string) => {
    try {
      const q = query(collection(db, "voter_roster"), where("election_id", "==", electionId));
      const snapshot = await getDocs(q);
      const roster = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoterRosterEntry));
      return { data: roster, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  addVoter: async (data: Omit<VoterRosterEntry, "id" | "has_voted">) => {
    try {
      const newDocRef = doc(collection(db, "voter_roster"));
      const fullData = { ...data, has_voted: false };
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
    // In Firestore, we should ideally use a batch
    try {
      // NOTE: This could be optimized using writeBatch
      for (const voter of voters) {
        const newDocRef = doc(collection(db, "voter_roster"));
        await setDoc(newDocRef, {
          election_id: electionId,
          voter_email: voter.email,
          voter_name: voter.name,
          has_voted: false
        });
      }
      return { data: { success: true }, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }
};
