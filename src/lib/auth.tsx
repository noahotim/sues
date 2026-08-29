import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authService, UserProfile, isAdminForMaintenance, getRegisterRole } from "../services";
import { ROLE_PERMISSIONS, ROLES } from "./constants";
import type { User as FirebaseUser } from "firebase/auth";
import { getAuth, signOut } from "firebase/auth";

interface AuthContextValue {
  session: { user: { id: string; email: string } } | null;
  profile: UserProfile | null;
  role: { id: string; label: string; description: string; is_admin: boolean } | null;
  permissions: string[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  role: null,
  permissions: [],
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthContextValue["session"]>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AuthContextValue["role"]>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const maintenanceWasEnabled = useRef(false);
  const alertShownForLock = useRef(false);

  async function loadUserData(firebaseUser: FirebaseUser) {
    try {
      // Roles live in the Firestore profile (no Cloud Functions to mint claims
      // anymore), so read it first. Custom claims remain only as a fallback for
      // older deployments.
      const { data: userProfile } = await authService.getUserProfile(firebaseUser.uid);
      const idTokenResult = await firebaseUser.getIdTokenResult().catch(() => null);
      const claimRole = (idTokenResult?.claims?.role as string) || undefined;
      // The register (eligible_emails) is the authoritative role source - it is
      // where roles are assigned in User Management. Prefer it over the possibly
      // stale profile/claim so role changes always take effect on the dashboard.
      const registerRole = await getRegisterRole(firebaseUser.email);
      const userRoleStr = registerRole || userProfile?.roleId || claimRole || "VOTER";

      const userRole = ROLES.find((r) => r.id === userRoleStr) ?? ROLES.find(r => r.id === "VOTER")!;
      setRole(userRole);

      const userPermissions = ROLE_PERMISSIONS[userRoleStr] || [];
      setPermissions(userPermissions);

      if (userProfile) {
        setProfile(userProfile);
      } else {
        // Fallback if the document is not created yet
        setProfile({
          id: firebaseUser.uid,
          email: firebaseUser.email || "",
          fullName: firebaseUser.displayName || "",
          roleId: userRoleStr
        });
      }
    } catch {
      setProfile(null);
      setRole(null);
      setPermissions([]);
    }
  }

  async function refresh() {
    authService.onAuthStateChanged(() => {}); // Get current logic
    // We can just rely on the existing session object since Firebase Auth SDK handles tokens
    if (session?.user) {
       // To truly refresh claims, we could do auth.currentUser?.getIdToken(true) but we'll let auth state handle it.
       // Actually, we can force a token refresh if we have the firebase user.
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      // Complete any in-flight redirect sign-in FIRST - before subscribing to
      // auth state. This is the canonical ordering for redirect flows and
      // prevents the "missing initial state" / uncompleted-sign-in behaviour.
      await authService.resolveRedirectSignIn();

      const unsubscribe = authService.onAuthStateChanged((firebaseUser) => {
        (async () => {
          if (!active) return;
          if (firebaseUser) {
            setSession({ user: { id: firebaseUser.uid, email: firebaseUser.email ?? "" } });
            await loadUserData(firebaseUser);
          } else {
            setSession(null);
            setProfile(null);
            setRole(null);
            setPermissions([]);
          }
          setLoading(false);
        })();
      });
      return () => {
        active = false;
        unsubscribe();
      };
    })();
  }, []);

  // Maintenance kill-switch: the moment it flips ON, force every signed-in user
  // out and tell them with a popup. This catches users already logged in (they
  // never re-run the sign-in gate), on every route. Users holding the
  // Administrator role (or the owner safety-net email) skip sign-out and remain
  // logged in.
  useEffect(() => {
    maintenanceWasEnabled.current = false;
const unsub = authService.subscribeToMaintenance(async (mode) => {
        const nowEnabled = mode.enabled;
        if (nowEnabled && !maintenanceWasEnabled.current && session) {
          // Check if the current user is an Administrator; if so, skip sign-out
          // and stay silent.
          const exempt = await isAdminForMaintenance(session.user.email);
          if (!exempt) {
            if (!alertShownForLock.current) {
              alertShownForLock.current = true;
              alert(
                "Access to this system is temporarily locked.\n\nYou have been signed out.\nCONTACT NOAH to be authorised."
              );
            }
            try {
              await signOut(getAuth());
            } catch {
              /* already signed out */
            }
          }
        }
      if (!nowEnabled) {
        // Lock lifted: allow the next lock to alert/sign out again.
        maintenanceWasEnabled.current = false;
        alertShownForLock.current = false;
      } else {
        maintenanceWasEnabled.current = true;
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return (
    <AuthContext.Provider
      value={{ session, profile, role, permissions, loading, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function usePermission(permission: string): boolean {
  const { permissions } = useAuth();
  return permissions.includes(permission);
}
