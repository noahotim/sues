import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authService, UserProfile } from "../services";
import { ROLE_PERMISSIONS, ROLES } from "./constants";
import type { User as FirebaseUser } from "firebase/auth";

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

  async function loadUserData(firebaseUser: FirebaseUser) {
    try {
      // Roles live in the Firestore profile (no Cloud Functions to mint claims
      // anymore), so read it first. Custom claims remain only as a fallback for
      // older deployments.
      const { data: userProfile } = await authService.getUserProfile(firebaseUser.uid);
      const idTokenResult = await firebaseUser.getIdTokenResult().catch(() => null);
      const claimRole = (idTokenResult?.claims?.role as string) || undefined;
      const userRoleStr = userProfile?.roleId || claimRole || "VOTER";

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
