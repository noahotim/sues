import { auth, db, functions } from "../lib/firebase";
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, query, where, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, getAuth, User as FirebaseUser } from "firebase/auth";
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

// Maintenance (kill-switch) lock. When enabled, EVERY sign-in is denied —
// including existing staff and voters — until it is turned back off.
export interface MaintenanceMode {
  enabled: boolean;
  message: string;
}

// Default lock message shown on the login screen. "CONTACT NOAH" is kept
// identical here and on the Login page so the block is unmistakable.
export const MAINTENANCE_DEFAULT_MESSAGE =
  "Access to this system is temporarily locked.\nCONTACT NOAH to be authorised.";

export const MAINTENANCE_DOC = "maintenance";
export const MAINTENANCE_COLLECTION = "system_config";

// Sentinel that marks an error as a maintenance lockout so the login page can
// render the full-screen lockout rather than a plain inline error.
export const MAINTENANCE_ERR_MARKER = "__SUES_LOCKOUT__";

// Hard allowlist of the ONLY accounts that are never locked out by the
// maintenance kill-switch. Everyone else — including anyone else signed in as a
// chairperson — is denied and force-signed-out while the lock is ON.
export const MAINTENANCE_EXEMPT_EMAILS = new Set([
  "2001600073@sun.ac.ug",
  "otim.no25@gmail.com",
]);

/** Case-insensitive check: is this email exempt from the maintenance lock? */
export function isMaintenanceExempt(email: string | null | undefined): boolean {
  if (!email) return false;
  return MAINTENANCE_EXEMPT_EMAILS.has(email.trim().toLowerCase());
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
      // NOTE: no maintenance pre-check here. The email isn't known until Google
      // OAuth returns, so a pre-check would wrongly block the exempt admins.
      // The real enforcement happens in finalizeSignIn, which lets the exempt
      // emails through and denies everyone else.
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
      if (finalized.error) {
        await signOut(auth).catch(() => {});
        return { user: null, error: finalized.error };
      }
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
        if (finalized.error) {
          await signOut(auth).catch(() => {});
          return { user: null, error: finalized.error };
        }
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

  /**
   * Read the current maintenance (kill-switch) flag. Publicly readable, so it
   * works before sign-in. Returns null if the doc is missing (system open).
   */
  getMaintenanceMode: async (): Promise<MaintenanceMode | null> => {
    try {
      const snap = await getDoc(doc(db, MAINTENANCE_COLLECTION, MAINTENANCE_DOC));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        enabled: data.enabled === true,
        message: typeof data.message === "string" ? data.message : MAINTENANCE_DEFAULT_MESSAGE,
      };
    } catch {
      return null; // treat a read failure as "not locked" to avoid false lockouts
    }
  },

  /** Realtime subscription to the maintenance flag (used by the login screen). */
  subscribeToMaintenance: (callback: (mode: MaintenanceMode) => void): (() => void) => {
    return onSnapshot(doc(db, MAINTENANCE_COLLECTION, MAINTENANCE_DOC), (snap) => {
      if (!snap.exists()) {
        callback({ enabled: false, message: MAINTENANCE_DEFAULT_MESSAGE });
        return;
      }
      const data = snap.data();
      callback({
        enabled: data.enabled === true,
        message: typeof data.message === "string" ? data.message : MAINTENANCE_DEFAULT_MESSAGE,
      });
    });
  },

  /**
   * Set the maintenance kill-switch (chairperson only). Logs the change.
   */
  setMaintenanceMode: async (enabled: boolean, message?: string) => {
    try {
      const ref = doc(db, MAINTENANCE_COLLECTION, MAINTENANCE_DOC);
      const next = {
        enabled,
        message: enabled && message?.trim() ? message.trim() : MAINTENANCE_DEFAULT_MESSAGE,
        updatedAt: serverTimestamp(),
        updatedBy: getAuth().currentUser?.email || "",
      };
      await setDoc(ref, next, { merge: true });
      auditService.log("MAINTENANCE_MODE", "system", MAINTENANCE_DOC, { enabled });
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  /** Eligibility gate + profile bootstrap shared by both sign-in methods. */
  finalizeSignIn: async (fbUser: FirebaseUser): Promise<{ ok: boolean; error: string | null }> => {
    try {
      const email = fbUser.email;
      if (!email) {
        await signOut(auth);
        return { ok: false, error: "The sign-in provider did not return an email address." };
      }

      // Maintenance kill-switch: lock out everyone EXCEPT the exempt admin
      // emails. The exempt accounts are the only ones that can keep working
      // (and keep using the toggle) while the switch is ON. Log the blocked
      // attempt while the user is still signed in (audit rules require
      // actorEmail), then the client signs out instead of bootstrapping.
      const exempt = isMaintenanceExempt(email);
      const maint = await authService.getMaintenanceMode();
      if (maint?.enabled && !exempt) {
        try {
          await auditService.log("SIGN_IN_BLOCKED", "auth", email.toLowerCase(), {
            maintenance: true,
            message: maint.message || MAINTENANCE_DEFAULT_MESSAGE,
          });
        } catch {
          /* best-effort */
        }
        return {
          ok: false,
          error: MAINTENANCE_ERR_MARKER + (maint.message || MAINTENANCE_DEFAULT_MESSAGE),
        };
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

      if (!exempt && !isStaff && !onRoster) {
        await signOut(auth);
        return {
          ok: false,
          error: "Your email is not authorized to access this voting system. Contact the election administrator.",
        };
      }

      // Ensure a profile doc exists. Roles come from the register entry (no
      // Cloud Functions required): seeded staff emails get their admin role,
      // exempt admins are forced to Chairperson, everyone else defaults to VOTER.
      const profileRef = doc(db, "users", fbUser.uid);
      const profileSnap = await getDoc(profileRef).catch(() => null);
      if (profileSnap && !profileSnap.exists()) {
        let role = exempt ? "ROLE_CHAIRPERSON" : "VOTER";
        if (onRegister.exists() && typeof onRegister.data()?.role === "string") {
          role = onRegister.data()!.role as string;
        }
        if (exempt) role = "ROLE_CHAIRPERSON";
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
   * Realtime composite directory for User Management. Subscribes to the
   * register, election rosters, and user profiles simultaneously, so the
   * chairperson sees adds/removes/role/name changes without refreshing. Callers
   * must pass in an unsubscribe function setter to clean up on unmount.
   */
  subscribeToDirectory: (
    setUnsub: (fn: () => void) => void,
    callback: (data: RegisterEntry[]) => void
  ) => {
    const nameByEmail = new Map<string, string>();
    const roleByEmail = new Map<string, string>();

    const rebuild = () => {
      const entries = Array.from(roleByEmail.keys()).map((email): RegisterEntry => ({
        id: email,
        email,
        fullName: nameByEmail.get(email) || "",
        roleId: roleByEmail.get(email) || "VOTER",
      }));
      // deterministic, case-insensitive ordering by email
      entries.sort((a, b) => a.email.localeCompare(b.email));
      callback(entries);
    };

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      for (const d of snap.docs) {
        const data = d.data();
        if (data.email) {
          const em = data.email.toLowerCase().trim();
          roleByEmail.set(em, data.role || "VOTER");
          const n = (data.fullName as string) || "";
          const cur = nameByEmail.get(em) || "";
          if (n.length > cur.length) nameByEmail.set(em, n);
        }
      }
      rebuild();
    });

    const unsubRoster = onSnapshot(collection(db, "voter_roster"), (snap) => {
      for (const d of snap.docs) {
        const data = d.data();
        if (data.voterEmail) {
          const em = data.voterEmail.toLowerCase().trim();
          const n = (data.voterName as string) || "";
          const cur = nameByEmail.get(em) || "";
          if (n.length > cur.length) nameByEmail.set(em, n);
          if (!roleByEmail.has(em)) roleByEmail.set(em, "VOTER");
        }
      }
      rebuild();
    });

    const unsubRegister = onSnapshot(collection(db, "eligible_emails"), (snap) => {
      const emails = new Set<string>();
      for (const d of snap.docs) {
        const data = d.data();
        const em = (data.email || d.id).toLowerCase().trim();
        em && emails.add(em);
        if (em) {
          if (data.fullName) nameByEmail.set(em, data.fullName);
          roleByEmail.set(em, data.role || "VOTER");
        }
      }
      // remove entries that were deleted from the register
      for (const em of Array.from(roleByEmail.keys())) {
        if (!emails.has(em)) {
          roleByEmail.delete(em);
        }
      }
      rebuild();
    });

    setUnsub(() => {
      unsubUsers();
      unsubRoster();
      unsubRegister();
    });
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
