import { auth, db, functions } from "../lib/firebase";
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, serverTimestamp, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";

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
      const email = result.user.email;
      if (!email) {
        await signOut(auth);
        return { user: null, error: "The sign-in provider did not return an email address." };
      }

      // Eligibility gate: only emails on the allowed register (eligible_emails)
      // or on a voter roster may use the system. Everyone else is signed back out.
      const onRegister = await getDoc(doc(db, "eligible_emails", email));
      let onRoster = false;
      if (!onRegister.exists()) {
        const ros = await getDocs(
          query(collection(db, "voter_roster"), where("voterEmail", "==", email.toLowerCase()))
        );
        onRoster = !ros.empty;
      }
      if (!onRegister.exists() && !onRoster) {
        await signOut(auth);
        return {
          user: null,
          error: "Your email is not authorized to access this voting system. Contact the election administrator.",
        };
      }

      // Ensure a profile doc exists. Roles come from the register entry (no
      // Cloud Functions required): seeded staff emails get their admin role,
      // everyone else defaults to VOTER.
      const profileRef = doc(db, "users", result.user.uid);
      const profileSnap = await getDoc(profileRef).catch(() => null);
      if (profileSnap && !profileSnap.exists()) {
        let role = "VOTER";
        if (onRegister.exists() && typeof onRegister.data()?.role === "string") {
          role = onRegister.data()!.role as string;
        }
        await setDoc(profileRef, {
          email,
          fullName: result.user.displayName || "Unknown User",
          role,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
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
      // Preferred path: Cloud Function (when deployed). Fallback: direct doc
      // update, which security rules permit for the Chairperson.
      try {
        const setUserRoleFn = httpsCallable(functions, "setUserRole");
        await setUserRoleFn({ targetUid, targetRole });
      } catch {
        await updateDoc(doc(db, "users", targetUid), {
          role: targetRole,
          updatedAt: serverTimestamp(),
        });
      }
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  }
};
