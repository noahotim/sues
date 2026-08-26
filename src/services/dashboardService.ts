import { db } from "../lib/firebase";
import { collection, getDocs, getCountFromServer, query, where } from "firebase/firestore";

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
      const votersVotedCount = await getCountFromServer(
        query(collection(db, "voter_roster"), where("hasVoted", "==", true))
      );

      const totalEligibleVoters = votersCount.data().count;
      // "Votes cast" = distinct voters who cast a ballot. A single ballot contains
      // one selection per position, so counting raw vote records would overstate
      // turnout (e.g. 5 voters x 2 positions = 10 records -> false 200%).
      const totalVotesCast = votersVotedCount.data().count;
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
