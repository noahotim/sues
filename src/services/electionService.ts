import { db } from "../lib/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, orderBy, where, onSnapshot } from "firebase/firestore";

export interface Election {
  id: string;
  title: string;
  description: string;
  status: "draft" | "active" | "closed" | "published";
  startTime: string | null;
  endTime: string | null;
  resultsPublished: boolean;
}

export interface Position {
  id: string;
  electionId: string;
  title: string;
  description: string;
  maxVotes: number;
  displayOrder: number;
}

export const electionService = {
  subscribeToElections: (callback: (data: Election[]) => void) => {
    const q = query(collection(db, "elections"), orderBy("title"));
    return onSnapshot(q, (snapshot) => {
      const elections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Election));
      callback(elections);
    });
  },

  getElections: async () => {
    try {
      const q = query(collection(db, "elections"), orderBy("title"));
      const snapshot = await getDocs(q);
      const elections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Election));
      return { data: elections, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  getPositions: async (electionId: string) => {
    try {
      const q = query(collection(db, "positions"), where("electionId", "==", electionId));
      const snapshot = await getDocs(q);
      const positions = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Position))
        .sort((a, b) => a.displayOrder - b.displayOrder);
      return { data: positions, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  createElection: async (data: Omit<Election, "id">) => {
    try {
      const newDocRef = doc(collection(db, "elections"));
      await setDoc(newDocRef, data);
      return { data: { id: newDocRef.id, ...data }, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  updateElection: async (id: string, data: Partial<Election>) => {
    try {
      await updateDoc(doc(db, "elections", id), data);
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  
  deleteElection: async (id: string) => {
    try {
      await deleteDoc(doc(db, "elections", id));
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  createPosition: async (data: Omit<Position, "id">) => {
    try {
      const newDocRef = doc(collection(db, "positions"));
      await setDoc(newDocRef, data);
      return { data: { id: newDocRef.id, ...data }, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  updatePosition: async (id: string, data: Partial<Position>) => {
    try {
      await updateDoc(doc(db, "positions", id), data);
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  deletePosition: async (id: string) => {
    try {
      await deleteDoc(doc(db, "positions", id));
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  }
};
