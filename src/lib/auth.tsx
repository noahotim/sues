import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import {
  loadProfile,
  loadRoleDefinitions,
  loadRolePermissions,
  type Profile,
  type RoleDefinition,
} from "./services";

interface AuthContextValue {
  session: { user: { id: string; email: string } } | null;
  profile: Profile | null;
  role: RoleDefinition | null;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<RoleDefinition | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadUserData(userId: string) {
    try {
      const userProfile = await loadProfile(userId);
      setProfile(userProfile);

      if (userProfile) {
        const roles = await loadRoleDefinitions();
        const userRole = roles.find((r) => r.id === userProfile.role_id) ?? null;
        setRole(userRole);

        const userPermissions = await loadRolePermissions(userProfile.role_id);
        setPermissions(userPermissions);
      } else {
        setRole(null);
        setPermissions([]);
      }
    } catch {
      setProfile(null);
      setRole(null);
      setPermissions([]);
    }
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      setSession({ user: { id: data.session.user.id, email: data.session.user.email ?? "" } });
      await loadUserData(data.session.user.id);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setSession({ user: { id: data.session.user.id, email: data.session.user.email ?? "" } });
        (async () => {
          await loadUserData(data.session.user.id);
          setLoading(false);
        })();
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) {
          setSession({ user: { id: session.user.id, email: session.user.email ?? "" } });
          await loadUserData(session.user.id);
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
      authListener.subscription.unsubscribe();
    };
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
