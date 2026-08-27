import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, UserPlus, Search, Trash2, Pencil } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  authService,
  type RegisterEntry,
} from "../services";
import { ROLES } from "../lib/constants";
import {
  Card,
  Badge,
  Button,
  Input,
  Select,
  Modal,
  ConfirmDialog,
  LoadingState,
  ErrorState,
  EmptyState,
} from "../components/ui";

export default function UsersPage() {
  const { profile: currentUser } = useAuth();
  const [register, setRegister] = useState<RegisterEntry[]>([]);
  const roles = ROLES;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-person modal state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("VOTER");
  const [formError, setFormError] = useState("");

  // Edit-name modal state
  const [editing, setEditing] = useState<RegisterEntry | null>(null);
  const [editName, setEditName] = useState("");

  // Delete confirmation state
  const [toDelete, setToDelete] = useState<RegisterEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: r } = await authService.getDirectory();
      if (r) setRegister(r);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(false);
    let cleanup: (() => void) | null = null;
    // Realtime subscription: the directory updates live as voters are added,
    // removed, or roles/names change - no manual refresh needed.
    authService.subscribeToDirectory(
      (fn) => {
        cleanup = fn;
      },
      (data) => {
        setRegister(data);
        setLoading(false);
        setError(false);
      }
    );
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  function getRoleLabel(roleId: string): string {
    return roles.find((r) => r.id === roleId)?.label ?? roleId;
  }

  function getRoleBadgeVariant(roleId: string): "neutral" | "primary" | "success" | "warning" {
    if (roleId === "ROLE_CHAIRPERSON") return "primary";
    if (roleId === "ROLE_SECRETARY") return "success";
    if (roleId === "ROLE_ASSISTANT") return "warning";
    return "neutral";
  }

  function isSelf(email: string): boolean {
    return currentUser?.email?.toLowerCase() === email.trim().toLowerCase();
  }

  async function handleRoleChange(email: string, newRoleId: string) {
    setUpdating(email);
    try {
      await authService.updateRegisterRole(email, newRoleId);
      // Update local state optimistically
      setRegister((prev) =>
        prev.map((e) => (e.email === email ? { ...e, roleId: newRoleId } : e))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setUpdating(null);
    }
  }

  function openAdd() {
    setNewName("");
    setNewEmail("");
    setNewRole("VOTER");
    setFormError("");
    setShowAdd(true);
  }

  async function handleAdd() {
    setFormError("");
    setBusy(true);
    try {
      const { data, error: addErr } = await authService.addPerson(newEmail, newName, newRole);
      if (addErr) {
        setFormError(addErr);
        return;
      }
      if (data) {
        setRegister((prev) => [...prev, data]);
        setShowAdd(false);
      }
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await authService.deletePerson(toDelete.email);
      setRegister((prev) => prev.filter((e) => e.email !== toDelete.email));
      setToDelete(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete person");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(entry: RegisterEntry) {
    setEditName(entry.fullName);
    setEditing(entry);
  }

  async function handleSaveName() {
    if (!editing) return;
    setFormError("");
    setBusy(true);
    try {
      const { error: nameErr } = await authService.updateRegisterName(editing.email, editName);
      if (nameErr) {
        setFormError(nameErr);
        return;
      }
      setRegister((prev) =>
        prev.map((e) => (e.email === editing.email ? { ...e, fullName: editName.trim() } : e))
      );
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  const filtered = search
    ? register.filter(
        (e) =>
          e.email.toLowerCase().includes(search.toLowerCase()) ||
          (e.fullName || "").toLowerCase().includes(search.toLowerCase())
      )
    : register;

  if (loading) return <LoadingState message="Loading registered users..." />;
  if (error) return <ErrorState message="We could not load the registered users." onRetry={load} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="mb-8 border-b-2 border-primary-900 pb-4 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">SUES Administration</h2>
          <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">User Management</h1>
          <p className="text-sm text-slate-600 mt-2">
            Manage every registered person: add, remove, and assign their roles. Adding someone
            provisions their account; removing someone revokes their access.
          </p>
        </div>
        <Button onClick={openAdd}>
          <UserPlus size={16} /> Add Person
        </Button>
      </div>

      {/* Search */}
      {register.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-sm border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-900 focus:border-primary-900 transition-all"
          />
        </div>
      )}

      {register.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<ShieldCheck size={48} />}
            title="No registered persons yet"
            message="Use the 'Add Person' button to provision your first voter or staff member."
            action={
              <Button onClick={openAdd}>
                <UserPlus size={16} /> Add Person
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-slate-500 text-center py-4">No registered persons match your search.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-sm shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr className="text-left text-slate-500">
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Current Role</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Change Role</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.email} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {e.fullName || (
                        <span className="text-slate-400 italic">Name not set</span>
                      )}
                      {isSelf(e.email) && (
                        <span className="ml-2 text-xs text-primary-600 font-normal">(You)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={getRoleBadgeVariant(e.roleId)}>
                        {getRoleLabel(e.roleId)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={e.roleId}
                        onChange={(ev) => handleRoleChange(e.email, ev.target.value)}
                        disabled={updating === e.email || isSelf(e.email)}
                        className="text-xs px-2.5 py-1.5 rounded-sm border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary-900 focus:border-primary-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(e)}
                        title="Edit name"
                        className="inline-flex items-center justify-center p-2 rounded-sm text-slate-400 hover:text-primary-700 hover:bg-primary-50 transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setToDelete(e)}
                        disabled={isSelf(e.email)}
                        title={isSelf(e.email) ? "You cannot remove yourself" : "Remove person"}
                        className="inline-flex items-center justify-center p-2 rounded-sm text-slate-400 hover:text-error-700 hover:bg-error-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Role definitions reference */}
      <Card className="p-5 rounded-sm shadow-none">
        <h2 className="text-sm font-bold tracking-widest text-primary-900 uppercase mb-3">Role Definitions</h2>
        <div className="space-y-2">
          {roles.map((r) => (
            <div key={r.id} className="flex items-start gap-3 py-2">
              <Badge variant={getRoleBadgeVariant(r.id)}>{r.label}</Badge>
              <p className="text-sm text-slate-500 flex-1">{r.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Add Person Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Person">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Provision a new person by name, email, and role. They will be able to sign in
            with their Google account using this email.
          </p>
          <Input
            label="Full Name"
            value={newName}
            onChange={setNewName}
            placeholder="e.g. Apio Samson"
            required
          />
          <Input
            label="Email"
            type="email"
            value={newEmail}
            onChange={setNewEmail}
            placeholder="e.g. apio.samson@sun.ac.ug"
            required
          />
          <Select
            label="Role"
            value={newRole}
            onChange={setNewRole}
            options={roles.map((r) => ({ value: r.id, label: r.label }))}
          />
          {formError && <p className="text-sm text-error-600">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={busy}>
              {busy ? "Adding..." : "Add Person"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Name Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Person's Name">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Set or correct the name for <span className="font-medium text-slate-700">{editing?.email}</span>.
          </p>
          <Input
            label="Full Name"
            value={editName}
            onChange={setEditName}
            placeholder="e.g. Apio Samson"
            required
          />
          {formError && <p className="text-sm text-error-600">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveName} disabled={busy}>
              {busy ? "Saving..." : "Save Name"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Remove person"
        message={`Remove ${toDelete?.fullName || toDelete?.email} from the system? This revokes their access to voting and the admin tools.`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
