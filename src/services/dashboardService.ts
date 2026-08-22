import { db } from "../lib/firebase";
import { collection, getDocs, getCountFromServer } from "firebase/firestore";

export interface DashboardMetrics {
  totalElections: number;
  activeElections: number;
  totalCandidates: number;
  totalEligibleVoters: number;
  totalVotesCast: number;
  turnoutPercentage: number;
}

export const dashboardService = {
  loadDashboardMetrics: async (): Promise<DashboardMetrics> => {
    try {
      const electionsSnap = await getDocs(collection(db, "elections"));
      const totalElections = electionsSnap.size;
      const activeElections = electionsSnap.docs.filter(d => d.data().status === "active").length;

      const candidatesCount = await getCountFromServer(collection(db, "candidates"));
      const votersCount = await getCountFromServer(collection(db, "voter_roster"));
      const votesCount = await getCountFromServer(collection(db, "votes"));

      const totalEligibleVoters = votersCount.data().count;
      const totalVotesCast = votesCount.data().count;
      const turnoutPercentage = totalEligibleVoters > 0 
        ? Math.round((totalVotesCast / totalEligibleVoters) * 100) 
        : 0;

      return {
        totalElections,
        activeElections,
        totalCandidates: candidatesCount.data().count,
        totalEligibleVoters,
        totalVotesCast,
        turnoutPercentage
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
};
