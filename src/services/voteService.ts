import { db, functions } from "../lib/firebase";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

export interface Vote {
  id: string;
  electionId: string;
  positionId: string;
  candidateId: string;
  // NO voterId to maintain anonymity
}

export const voteService = {
  submitVote: async (electionId: string, positionId: string, candidateId: string) => {
    try {
      const castVoteFunction = httpsCallable(functions, "castVote");
      await castVoteFunction({ electionId, positionId, candidateId });
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
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
