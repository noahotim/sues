import { db } from "../lib/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from "firebase/firestore";

export interface Election {
  id: string;
  title: string;
  description: string;
  status: "draft" | "active" | "closed" | "published";
  start_time: string | null;
  end_time: string | null;
  results_published: boolean;
}

export interface Position {
  id: string;
  election_id: string;
  title: string;
  description: string;
  max_votes: number;
  display_order: number;
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
      const q = query(collection(db, "positions")); // Actually, better to query by election_id
      const snapshot = await getDocs(q);
      const positions = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Position))
        .filter(p => p.election_id === electionId)
        .sort((a, b) => a.display_order - b.display_order);
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
