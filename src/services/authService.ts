import { auth, db, functions } from "../lib/firebase";
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auditService } from "./auditService";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
}

// A register entry (eligible_emails) is the master directory the chairperson
// manages. Each entry has a name, email, and assigned role. It is what grants
// (or revokes) a person's access to the system.
export interface RegisterEntry {
  id: string; // the email, lowercased
  email: string;
  fullName: string;
  roleId: string;
  addedAt?: any;
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
      // Always show the Google account chooser, so a user can pick a DIFFERENT
      // account (e.g. when a device has several Google accounts signed in).
      provider.setCustomParameters({ prompt: "select_account" });

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
      auditService.log("USER_ROLE_UPDATED", "user", targetUid, { targetRole });
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  // ----- User-management (register) directory -----

  /** Read the full register (eligible_emails). Admins can read all entries. */
  getRegister: async (): Promise<{ data: RegisterEntry[] | null; error: string | null }> => {
    try {
      const snapshot = await getDocs(collection(db, "eligible_emails"));
      const entries = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          email: data.email || d.id,
          fullName: (data.fullName as string) || "",
          roleId: (data.role as string) || "VOTER",
          addedAt: data.addedAt,
        } as RegisterEntry;
      });
      return { data: entries, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  /**
   * Composite directory for User Management: every registered person joined
   * with their best-known name and role, resolved across the register,
   * election rosters, and signed-in profiles. This ensures the chairperson
   * always sees the name behind each email.
   */
  getDirectory: async (): Promise<{ data: RegisterEntry[] | null; error: string | null }> => {
    try {
      const [regSnap, rosterSnap, userSnap] = await Promise.all([
        getDocs(collection(db, "eligible_emails")),
        getDocs(collection(db, "voter_roster")),
        getDocs(collection(db, "users")),
      ]);

      // nameByEmail / roleByEmail: best available value from any source
      const nameByEmail = new Map<string, string>();
      const roleByEmail = new Map<string, string>();

      const putName = (email: string, name: string) => {
        const em = email.toLowerCase().trim();
        if (!em || !name) return;
        const existing = nameByEmail.get(em) || "";
        // prefer the longest / most complete name
        if (name.length > existing.length) nameByEmail.set(em, name);
      };

      for (const d of rosterSnap.docs) {
        const data = d.data();
        if (data.voterEmail) putName(data.voterEmail, data.voterName || "");
      }
      for (const d of userSnap.docs) {
        const data = d.data();
        if (data.email) {
          putName(data.email, data.fullName || "");
          if (data.role) roleByEmail.set(data.email.toLowerCase().trim(), data.role);
        }
      }

      const entries = regSnap.docs.map((d): RegisterEntry => {
        const data = d.data();
        const email = (data.email || d.id).toLowerCase().trim();
        return {
          id: d.id,
          email,
          fullName: data.fullName || nameByEmail.get(email) || "",
          roleId: data.role || roleByEmail.get(email) || "VOTER",
          addedAt: data.addedAt,
        };
      });

      return { data: entries, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  /**
   * Add a person to the register with an assigned role. Creating an
   * eligible_emails entry provisions the person: staff (non-VOTER) can sign in
   * immediately; VOTERs gain system-wide eligibility (plus a roster row once
   * they are uploaded to an election). Duplicate emails are refused.
   */
  addPerson: async (email: string, fullName: string, role: string) => {
    try {
      const em = email.trim().toLowerCase();
      if (!em.includes("@")) return { data: null, error: "A valid email address is required." };
      if (!fullName.trim()) return { data: null, error: "A name is required." };
      const ref = doc(db, "eligible_emails", em);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        return { data: null, error: "That email is already registered. You can edit its role instead." };
      }
      await setDoc(ref, {
        email: em,
        fullName: fullName.trim(),
        role,
        addedAt: serverTimestamp(),
      });
      auditService.log("VOTER_ADDED", "voter", em, { role, source: "user_management" });
      return { data: { id: em, email: em, fullName: fullName.trim(), roleId: role } as RegisterEntry, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  /**
   * Update a person's role from the register. This also syncs the signed-in
   * user's profile (users/{uid}.role) so the change takes effect immediately
   * for a person who has already logged in.
   */
  updateRegisterRole: async (email: string, role: string) => {
    try {
      const em = email.trim().toLowerCase();
      await updateDoc(doc(db, "eligible_emails", em), {
        role,
        updatedAt: serverTimestamp(),
      });
      // Sync the signed-in profile, if one exists for this email.
      const users = await getDocs(query(collection(db, "users"), where("email", "==", em)));
      for (const u of users.docs) {
        try {
          await updateDoc(u.ref, { role, updatedAt: serverTimestamp() });
        } catch { /* profile may be unmanaged; register entry is authoritative */ }
      }
      auditService.log("USER_ROLE_UPDATED", "user", em, { role, source: "register" });
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  /**
   * Set (or correct) a person's display name on the register, so the
   * User Management page shows who owns each email.
   */
  updateRegisterName: async (email: string, fullName: string) => {
    try {
      const em = email.trim().toLowerCase();
      if (!fullName.trim()) return { error: "A name is required." };
      await updateDoc(doc(db, "eligible_emails", em), {
        fullName: fullName.trim(),
        updatedAt: serverTimestamp(),
      });
      // Sync the signed-in profile name too, if one exists.
      const users = await getDocs(query(collection(db, "users"), where("email", "==", em)));
      for (const u of users.docs) {
        try {
          await updateDoc(u.ref, { fullName: fullName.trim() });
        } catch { /* register entry is authoritative */ }
      }
      auditService.log("USER_ROLE_UPDATED", "user", em, { source: "name" });
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  /**
   * Remove a person from the register, revoking their access to the system.
   * Their eligible_emails entry drives sign-in eligibility, so deleting it
   * revokes access. The signed-in users profile (if any) is deleted too.
   */
  deletePerson: async (email: string) => {
    try {
      const em = email.trim().toLowerCase();
      await deleteDoc(doc(db, "eligible_emails", em));
      // Clean up the signed-in profile if present.
      const users = await getDocs(query(collection(db, "users"), where("email", "==", em)));
      for (const u of users.docs) {
        try {
          await deleteDoc(u.ref);
        } catch { /* deletion may be restricted; access already revoked via register */ }
      }
      auditService.log("VOTER_REMOVED", "voter", em, { source: "user_management" });
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  }
};
