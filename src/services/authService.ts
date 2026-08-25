import { auth, db, functions } from "../lib/firebase";
import { collection, doc, getDocs, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { isValidStudentEmail, STUDENT_EMAIL_ERROR } from "../utils/emailValidation";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
}

export const authService = {
  signInWithGoogle: async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      // Only @sun.ac.ug student emails (number starting 220-260) may use the app.
      if (!isValidStudentEmail(result.user.email)) {
        await signOut(auth);
        return { user: null, error: STUDENT_EMAIL_ERROR };
      }
      return { user: result.user, error: null };
    } catch (error: any) {
      return { user: null, error: error.message };
    }
  },

  signOut: async () => {
    try {
      await signOut(auth);
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  getUserProfile: async (uid: string): Promise<{ data: UserProfile | null; error: string | null }> => {
    try {
      const userDoc = await getDoc(doc(db, "users", uid));
      if (!userDoc.exists()) {
        return { data: null, error: "Profile not found" };
      }
      const data = userDoc.data();
      return {
        data: {
          id: uid,
          email: data.email,
          fullName: data.fullName,
          roleId: data.role || "VOTER" // Fallback to VOTER if not explicitly set in doc yet
        },
        error: null
      };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  onAuthStateChanged: (callback: (user: FirebaseUser | null) => void) => {
    return onAuthStateChanged(auth, callback);
  },

  getAllProfiles: async (): Promise<{ data: UserProfile[] | null; error: string | null }> => {
    try {
      const snapshot = await getDocs(collection(db, "users"));
      const profiles = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          email: data.email,
          fullName: data.fullName,
          roleId: data.role || "VOTER"
        } as UserProfile;
      });
      return { data: profiles, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  updateUserRole: async (targetUid: string, targetRole: string) => {
    try {
      const setUserRoleFn = httpsCallable(functions, "setUserRole");
      await setUserRoleFn({ targetUid, targetRole });
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  }
};
