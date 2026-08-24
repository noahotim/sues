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
      // Get the ID token result to extract the custom claim
      const idTokenResult = await firebaseUser.getIdTokenResult(true);
      const userRoleStr = (idTokenResult.claims.role as string) || "VOTER";

      const userRole = ROLES.find((r) => r.id === userRoleStr) ?? ROLES.find(r => r.id === "VOTER")!;
      setRole(userRole);

      const userPermissions = ROLE_PERMISSIONS[userRoleStr] || [];
      setPermissions(userPermissions);

      // Load additional profile data from Firestore
      const { data: userProfile } = await authService.getUserProfile(firebaseUser.uid);
      if (userProfile) {
        setProfile(userProfile);
      } else {
        // Fallback if document is not created yet
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
    const unsubscribe = authService.onAuthStateChanged((firebaseUser) => {
      (async () => {
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

    return () => unsubscribe();
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
