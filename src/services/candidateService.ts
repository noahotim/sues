import { db } from "../lib/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where, onSnapshot } from "firebase/firestore";

export interface Candidate {
  id: string;
  electionId: string;
  positionId: string;
  name: string;
  bio: string;
  photoUrl: string;
  displayOrder: number;
}

/** Downscale + JPEG-encode an image entirely in the browser (no Storage needed). */
async function compressToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (JPG, PNG, etc.).");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file is not a valid image."));
    image.src = dataUrl;
  });
  const maxDim = 400;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.85);
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

  subscribeToCandidates: (electionId: string, callback: (data: Candidate[]) => void) => {
    const q = query(collection(db, "candidates"), where("electionId", "==", electionId));
    return onSnapshot(q, (snapshot) => {
      const candidates = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Candidate))
        .sort((a, b) => a.displayOrder - b.displayOrder);
      callback(candidates);
    });
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
      const url = await compressToDataUrl(file);
      return { data: { path: url }, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  deleteCandidatePhoto: async () => {
    // Photos are self-contained data URLs embedded in the candidate doc, so
    // there is nothing external to delete. (Legacy storage URLs are ignored.)
    return { error: null };
  }
};
