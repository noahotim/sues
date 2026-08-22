import { db, functions } from "../lib/firebase";
import { collection, doc, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

export interface Vote {
  id: string;
  election_id: string;
  position_id: string;
  candidate_id: string;
  // NO voter_id to maintain anonymity
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
      const votes = snapshot.docs.map(doc => ({ 
        id: doc.id,
        election_id: doc.data().electionId, // Map Firestore camelCase if necessary, or just use snake_case in Cloud Functions. Cloud Functions used camelCase `electionId`.
        position_id: doc.data().positionId,
        candidate_id: doc.data().candidateId
      } as Vote));
      callback(votes);
    });
  },

  getVotes: async (electionId: string) => {
    try {
      const q = query(collection(db, "votes"), where("electionId", "==", electionId));
      const snapshot = await getDocs(q);
      const votes = snapshot.docs.map(doc => ({ 
        id: doc.id,
        election_id: doc.data().electionId,
        position_id: doc.data().positionId,
        candidate_id: doc.data().candidateId
      } as Vote));
      return { data: votes, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  hasUserVotedForPosition: async (electionId: string, positionId: string, userId: string): Promise<boolean> => {
    try {
      const userRef = doc(db, "users", userId);
      const receiptsRef = collection(userRef, "receipts");
      const q = query(receiptsRef, where("electionId", "==", electionId), where("positionId", "==", positionId));
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error("Error checking vote receipt:", error);
      return false;
    }
  }
};
