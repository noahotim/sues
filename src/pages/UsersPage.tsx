import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, Search } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  loadAllProfiles,
  loadRoleDefinitions,
  updateUserRole,
  type Profile,
  type RoleDefinition,
} from "../lib/services";
import {
  Card,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from "../components/ui";

export default function UsersPage() {
  const { profile: currentUser } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [p, r] = await Promise.all([loadAllProfiles(), loadRoleDefinitions()]);
      setProfiles(p);
      setRoles(r);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRoleChange(userId: string, newRoleId: string) {
    setUpdating(userId);
    try {
      await updateUserRole(userId, newRoleId);
      const p = await loadAllProfiles();
      setProfiles(p);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setUpdating(null);
    }
  }

  const filteredProfiles = search
    ? profiles.filter(
        (p) =>
          p.email.toLowerCase().includes(search.toLowerCase()) ||
          p.full_name.toLowerCase().includes(search.toLowerCase())
      )
    : profiles;

  function getRoleLabel(roleId: string): string {
    return roles.find((r) => r.id === roleId)?.label ?? roleId;
  }

  function getRoleBadgeVariant(roleId: string): "neutral" | "primary" | "success" | "warning" {
    if (roleId === "ROLE_CHAIRPERSON") return "primary";
    if (roleId === "ROLE_SECRETARY") return "success";
    if (roleId === "ROLE_ASSISTANT") return "warning";
    return "neutral";
  }

  if (loading) return <LoadingState message="Loading users..." />;
  if (error) return <ErrorState message="We could not load the users." onRetry={load} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
        <p className="text-sm text-slate-500 mt-1">
          View all users and assign administrative roles.
        </p>
      </div>

      {/* Search */}
      {profiles.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
          />
        </div>
      )}

      {profiles.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<ShieldCheck size={48} />}
            title="No users found"
            message="Users will appear here once they sign up for an account."
          />
        </Card>
      ) : filteredProfiles.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-slate-500 text-center py-4">No users match your search.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-600">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Current Role</th>
                  <th className="px-4 py-3 font-medium">Change Role</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {p.full_name || "—"}
                      {p.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-primary-600 font-normal">(You)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={getRoleBadgeVariant(p.role_id)}>
                        {getRoleLabel(p.role_id)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={p.role_id}
                        onChange={(e) => handleRoleChange(p.id, e.target.value)}
                        disabled={updating === p.id || p.id === currentUser?.id}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Role definitions reference */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Role Definitions</h2>
        <div className="space-y-2">
          {roles.map((r) => (
            <div key={r.id} className="flex items-start gap-3 py-2">
              <Badge variant={getRoleBadgeVariant(r.id)}>{r.label}</Badge>
              <p className="text-sm text-slate-500 flex-1">{r.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
