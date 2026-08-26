import { db } from "../lib/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, orderBy, where, onSnapshot, Timestamp } from "firebase/firestore";

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

/** Times are stored as Firestore Timestamps (rules compare them to request.time). */
function toTs(v: string | null | undefined): Timestamp | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

function tsToIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === "string") return v;
  return null;
}

function normalizeElection(id: string, data: Record<string, any>): Election {
  return {
    id,
    title: data.title ?? "",
    description: data.description ?? "",
    status: data.status ?? "draft",
    startTime: tsToIso(data.startTime),
    endTime: tsToIso(data.endTime),
    resultsPublished: Boolean(data.resultsPublished),
  };
}

export const electionService = {
  subscribeToElections: (callback: (data: Election[]) => void) => {
    const q = query(collection(db, "elections"), orderBy("title"));
    return onSnapshot(q, (snapshot) => {
      const elections = snapshot.docs.map(doc => normalizeElection(doc.id, doc.data()));
      callback(elections);
    });
  },

  getElections: async () => {
    try {
      const q = query(collection(db, "elections"), orderBy("title"));
      const snapshot = await getDocs(q);
      const elections = snapshot.docs.map(doc => normalizeElection(doc.id, doc.data()));
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
      await setDoc(newDocRef, { ...data, startTime: toTs(data.startTime), endTime: toTs(data.endTime) });
      return { data: { id: newDocRef.id, ...data }, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  updateElection: async (id: string, data: Partial<Election>) => {
    try {
      await updateDoc(doc(db, "elections", id), {
        ...data,
        startTime: toTs(data.startTime),
        endTime: toTs(data.endTime),
      });
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
