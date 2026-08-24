import { db, storage } from "../lib/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

export interface Candidate {
  id: string;
  electionId: string;
  positionId: string;
  name: string;
  bio: string;
  photoUrl: string;
  displayOrder: number;
}

export const candidateService = {
  getCandidates: async (electionId: string) => {
    try {
      const q = query(
        collection(db, "candidates"),
        where("electionId", "==", electionId)
      );
      const snapshot = await getDocs(q);
      const candidates = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Candidate))
        .sort((a, b) => a.displayOrder - b.displayOrder);
      return { data: candidates, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  createCandidate: async (data: Omit<Candidate, "id">) => {
    try {
      const newDocRef = doc(collection(db, "candidates"));
      await setDoc(newDocRef, data);
      return { data: { id: newDocRef.id, ...data }, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  updateCandidate: async (id: string, data: Partial<Candidate>) => {
    try {
      await updateDoc(doc(db, "candidates", id), data);
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  deleteCandidate: async (id: string) => {
    try {
      await deleteDoc(doc(db, "candidates", id));
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  uploadCandidatePhoto: async (file: File) => {
    try {
      const fileExtension = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExtension}`;
      const storageRef = ref(storage, `candidates/${fileName}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      return { data: { path: url }, error: null }; // Returning URL directly for photoUrl
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  deleteCandidatePhoto: async (url: string) => {
    try {
      if (url.includes("firebase")) {
        const storageRef = ref(storage, url);
        await deleteObject(storageRef);
      }
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  }
};
