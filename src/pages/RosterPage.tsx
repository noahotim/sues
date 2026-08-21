import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Upload, Trash2, Search, ClipboardCheck, CheckCircle2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  loadElections,
  loadVoterRoster,
  addVoterToRoster,
  bulkAddVoters,
  deleteVoterFromRoster,
  type Election,
  type VoterRosterEntry,
} from "../lib/services";
import {
  Card,
  Button,
  Badge,
  Modal,
  Input,
  Select,
  LoadingState,
  ErrorState,
  EmptyState,
  ConfirmDialog,
} from "../components/ui";

export default function RosterPage() {
  const { permissions } = useAuth();
  const canManage = permissions.includes("MANAGE_ROSTER");
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [roster, setRoster] = useState<VoterRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VoterRosterEntry | null>(null);
  const [search, setSearch] = useState("");

  // Add form state
  const [voterEmail, setVoterEmail] = useState("");
  const [voterName, setVoterName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Import state
  const [csvText, setCsvText] = useState("");
  const [importResult, setImportResult] = useState<{ inserted: number; errors: string[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await loadElections();
      setElections(data);
      if (data.length > 0 && !selectedElectionId) {
        setSelectedElectionId(data[0].id);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedElectionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedElectionId) {
      setRoster([]);
      return;
    }
    (async () => {
      try {
        const data = await loadVoterRoster(selectedElectionId);
        setRoster(data);
      } catch {
        setRoster([]);
      }
    })();
  }, [selectedElectionId]);

  async function handleAdd() {
    setSubmitting(true);
    try {
      await addVoterToRoster({
        election_id: selectedElectionId,
        voter_email: voterEmail,
        voter_name: voterName,
      });
      setShowAdd(false);
      setVoterEmail("");
      setVoterName("");
      const data = await loadVoterRoster(selectedElectionId);
      setRoster(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add voter");
    } finally {
      setSubmitting(false);
    }
  }

  function parseCsv(text: string): { voter_email: string; voter_name: string }[] {
    const lines = text.trim().split("\n");
    if (lines.length === 0) return [];
    const result: { voter_email: string; voter_name: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length >= 1 && parts[0].includes("@")) {
        result.push({
          voter_email: parts[0],
          voter_name: parts.length >= 2 ? parts[1] : "",
        });
      }
    }
    return result;
  }

  async function handleImport() {
    setSubmitting(true);
    setImportResult(null);
    try {
      const voters = parseCsv(csvText);
      if (voters.length === 0) {
        setImportResult({ inserted: 0, errors: ["No valid entries found. Use format: email,name (one per line)"] });
        setSubmitting(false);
        return;
      }
      const result = await bulkAddVoters(selectedElectionId, voters);
      setImportResult(result);
      const data = await loadVoterRoster(selectedElectionId);
      setRoster(data);
    } catch (err) {
      setImportResult({ inserted: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteVoterFromRoster(deleteTarget.id);
      const data = await loadVoterRoster(selectedElectionId);
      setRoster(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete voter");
    }
  }

  const filteredRoster = useMemo(() => {
    if (!search) return roster;
    const q = search.toLowerCase();
    return roster.filter(
      (r) =>
        r.voter_email.toLowerCase().includes(q) ||
        r.voter_name.toLowerCase().includes(q)
    );
  }, [roster, search]);

  const votedCount = roster.filter((r) => r.has_voted).length;

  if (loading) return <LoadingState message="Loading voter roster..." />;
  if (error) return <ErrorState message="We could not load the voter roster." onRetry={load} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Voter Roster</h1>
          <p className="text-sm text-slate-500 mt-1">Manage eligible voters for each election.</p>
        </div>
        {canManage && elections.length > 0 && selectedElectionId && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowImport(true)}>
              <Upload size={18} />
              Import CSV
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <Plus size={18} />
              Add Voter
            </Button>
          </div>
        )}
      </div>

      {elections.length > 0 && (
        <Select
          label="Select Election"
          value={selectedElectionId}
          onChange={setSelectedElectionId}
          options={elections.map((e) => ({ value: e.id, label: e.title }))}
          placeholder="Choose an election..."
        />
      )}

      {elections.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<ClipboardCheck size={48} />}
            title="No elections available"
            message="Create an election first before managing the voter roster."
          />
        </Card>
      ) : !selectedElectionId ? (
        <Card className="p-6">
          <EmptyState
            icon={<ClipboardCheck size={48} />}
            title="Select an election"
            message="Choose an election above to view and manage its voter roster."
          />
        </Card>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-2xl font-bold text-slate-900">{roster.length}</p>
              <p className="text-xs text-slate-500 mt-1">Total Eligible</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-success-600">{votedCount}</p>
              <p className="text-xs text-slate-500 mt-1">Voted</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-primary-600">{roster.length - votedCount}</p>
              <p className="text-xs text-slate-500 mt-1">Not Voted</p>
            </Card>
          </div>

          {/* Search */}
          {roster.length > 0 && (
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

          {/* Roster table */}
          {roster.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={<ClipboardCheck size={48} />}
                title="No voters on the roster"
                message="Add voters individually or import a CSV file to populate the roster."
                action={
                  canManage && (
                    <Button onClick={() => setShowAdd(true)}>
                      <Plus size={18} />
                      Add Voter
                    </Button>
                  )
                }
              />
            </Card>
          ) : filteredRoster.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-slate-500 text-center py-4">No voters match your search.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-slate-600">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoster.map((entry) => (
                      <tr key={entry.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {entry.voter_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{entry.voter_email}</td>
                        <td className="px-4 py-3">
                          {entry.has_voted ? (
                            <Badge variant="success">
                              <CheckCircle2 size={12} className="mr-1" />
                              Voted
                            </Badge>
                          ) : (
                            <Badge variant="neutral">Not Voted</Badge>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setDeleteTarget(entry)}
                              className="text-slate-300 hover:text-error-600 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Add Voter Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Voter to Roster">
        <div className="space-y-4">
          <Input
            label="Voter Email"
            type="email"
            value={voterEmail}
            onChange={setVoterEmail}
            placeholder="voter@example.com"
            required
          />
          <Input
            label="Voter Name"
            value={voterName}
            onChange={setVoterName}
            placeholder="Full name"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting || !voterEmail}>
              {submitting ? "Adding..." : "Add Voter"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import CSV Modal */}
      <Modal open={showImport} onClose={() => { setShowImport(false); setImportResult(null); setCsvText(""); }} title="Import Voter Roster (CSV)" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-600 mb-2">
              Paste CSV data below. Format: <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">email,name</code> — one voter per line.
            </p>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"voter1@example.com,John Doe\nvoter2@example.com,Jane Smith"}
              rows={8}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all font-mono text-sm resize-none"
            />
          </div>

          {importResult && (
            <div className={`rounded-lg p-3 text-sm ${importResult.errors.length > 0 ? "bg-warning-50 border border-warning-200" : "bg-success-50 border border-success-200"}`}>
              <p className="font-medium text-slate-700">
                Inserted {importResult.inserted} voter{importResult.inserted !== 1 ? "s" : ""}.
              </p>
              {importResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-slate-600">{importResult.errors.length} error(s):</p>
                  <ul className="text-xs text-slate-500 mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => { setShowImport(false); setImportResult(null); setCsvText(""); }}>
              Close
            </Button>
            <Button onClick={handleImport} disabled={submitting || !csvText.trim()}>
              {submitting ? "Importing..." : "Import Voters"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Voter"
        message={`Remove ${deleteTarget?.voter_email} from the roster?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
