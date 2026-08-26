import { auth, db, functions } from "../lib/firebase";
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, serverTimestamp, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
}

// Guards against double-redirects (a second click would overwrite the pending
// state and break the return trip) and memoizes result processing so the
// redirect is consumed exactly once no matter how many components ask.
const REDIRECT_FLAG = "sues_auth_redirect_pending";
let redirectResultPromise: Promise<{ user: FirebaseUser | null; error: string | null }> | null = null;

function markRedirectPending() {
  try { sessionStorage.setItem(REDIRECT_FLAG, "1"); } catch { /* private mode */ }
}
function clearRedirectPending() {
  try { sessionStorage.removeItem(REDIRECT_FLAG); } catch { /* private mode */ }
}

export const authService = {
  signInWithGoogle: async (): Promise<{ user: FirebaseUser | null; error: string | null; redirecting?: boolean }> => {
    try {
      const provider = new GoogleAuthProvider();

      // Prefer popup; some browsers block it, in which case fall back to a
      // full-page redirect (works everywhere, immune to popup blockers).
      let result;
      try {
        result = await signInWithPopup(auth, provider);
      } catch (popupErr: any) {
        const code = String(popupErr?.code || "");
        if (
          code === "auth/popup-blocked" ||
          code === "auth/popup-request-pending" ||
          code === "auth/cancelled-popup-request" ||
          code === "auth/operation-not-supported-in-this-environment"
        ) {
          clearRedirectPending();          // start the trip with clean state
          markRedirectPending();
          await signInWithRedirect(auth, provider);
          return { user: null, error: null, redirecting: true };
        }
        return { user: null, error: popupErr?.message || "Authentication failed" };
      }

      const finalized = await authService.finalizeSignIn(result.user);
      if (finalized.error) return { user: null, error: finalized.error };
      return { user: result.user, error: null };
    } catch (error: any) {
      return { user: null, error: error.message };
    }
  },

  /**
   * Handles the return trip from `signInWithRedirect`. Memoized so multiple
   * callers (login page, auth provider) share a single getRedirectResult().
   */
  resolveRedirectSignIn: (): Promise<{ user: FirebaseUser | null; error: string | null }> => {
    if (redirectResultPromise) return redirectResultPromise;
    redirectResultPromise = (async () => {
      try {
        const result = await getRedirectResult(auth);
        clearRedirectPending();
        if (!result || !result.user) return { user: null, error: null };
        const finalized = await authService.finalizeSignIn(result.user);
        if (finalized.error) return { user: null, error: finalized.error };
        return { user: result.user, error: null };
      } catch (error: any) {
        clearRedirectPending();
        const code = String(error?.code || "");
        // Stale or partitioned-away redirect state: silently return to a
        // clean login screen instead of showing a confusing internal error.
        if (code === "auth/no-auth-event" || code === "auth/missing-initial-state") {
          return { user: null, error: null };
        }
        return { user: null, error: error.message };
      }
    })();
    return redirectResultPromise;
  },

  /** Eligibility gate + profile bootstrap shared by both sign-in methods. */
  finalizeSignIn: async (fbUser: FirebaseUser): Promise<{ ok: boolean; error: string | null }> => {
    try {
      const email = fbUser.email;
      if (!email) {
        await signOut(auth);
        return { ok: false, error: "The sign-in provider did not return an email address." };
      }

      // Eligibility gate: staff (register entry with an admin role) OR voters
      // present on an actual election roster may use the system. A plain VOTER
      // register entry with no roster row anywhere is NOT sufficient - it only
      // grants system-wide eligibility once they've been uploaded to a roster.
      const onRegister = await getDoc(doc(db, "eligible_emails", email));
      const regRole =
        onRegister.exists() && typeof onRegister.data()?.role === "string"
          ? (onRegister.data()!.role as string)
          : "";
      const isStaff = regRole !== "" && regRole !== "VOTER";

      let onRoster = false;
      if (!isStaff) {
        const ros = await getDocs(
          query(collection(db, "voter_roster"), where("voterEmail", "==", email.toLowerCase()))
        );
        onRoster = !ros.empty;
      }

      if (!isStaff && !onRoster) {
        await signOut(auth);
        return {
          ok: false,
          error: "Your email is not authorized to access this voting system. Contact the election administrator.",
        };
      }

      // Ensure a profile doc exists. Roles come from the register entry (no
      // Cloud Functions required): seeded staff emails get their admin role,
      // everyone else defaults to VOTER.
      const profileRef = doc(db, "users", fbUser.uid);
      const profileSnap = await getDoc(profileRef).catch(() => null);
      if (profileSnap && !profileSnap.exists()) {
        let role = "VOTER";
        if (onRegister.exists() && typeof onRegister.data()?.role === "string") {
          role = onRegister.data()!.role as string;
        }
        await setDoc(profileRef, {
          email,
          fullName: fbUser.displayName || "Unknown User",
          role,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      return { ok: true, error: null };
    } catch (error: any) {
      return { ok: false, error: error.message };
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
