import { useEffect, useState, useCallback } from "react";
import { Plus, Vote, Settings, Trash2, Calendar } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  loadElections,
  createElection,
  updateElection,
  deleteElection,
  loadPositions,
  createPosition,
  deletePosition,
  type Election,
  type Position,
} from "../lib/services";
import { ELECTION_STATUS } from "../lib/supabase";
import {
  Card,
  Button,
  Badge,
  Modal,
  Input,
  Textarea,
  LoadingState,
  ErrorState,
  EmptyState,
  ConfirmDialog,
} from "../components/ui";

export default function ElectionsPage() {
  const { permissions } = useAuth();
  const canManage = permissions.includes("MANAGE_ELECTIONS");
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [configuringElection, setConfiguringElection] = useState<Election | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Election | null>(null);

  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await loadElections();
      setElections(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setSubmitting(true);
    try {
      await createElection({
        title,
        description,
        start_time: startTime ? new Date(startTime).toISOString() : null,
        end_time: endTime ? new Date(endTime).toISOString() : null,
      });
      setShowCreate(false);
      setTitle("");
      setDescription("");
      setStartTime("");
      setEndTime("");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create election");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(election: Election, newStatus: string) {
    try {
      await updateElection(election.id, { status: newStatus });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update election");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteElection(deleteTarget.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete election");
    }
  }

  function statusBadge(status: string): React.ReactNode {
    const map: Record<string, { variant: "neutral" | "success" | "warning" | "primary"; label: string }> = {
      draft: { variant: "neutral", label: "Draft" },
      active: { variant: "success", label: "Active" },
      closed: { variant: "warning", label: "Closed" },
      published: { variant: "primary", label: "Published" },
    };
    const cfg = map[status] ?? { variant: "neutral" as const, label: status };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  }

  if (loading) return <LoadingState message="Loading elections..." />;
  if (error) return <ErrorState message="We could not load the elections." onRetry={load} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Elections</h1>
          <p className="text-sm text-slate-500 mt-1">Create and manage election configurations.</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={18} />
            New Election
          </Button>
        )}
      </div>

      {elections.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Vote size={48} />}
            title="No elections have been created yet"
            message="Create your first election to get started with positions, candidates, and voting."
            action={
              canManage && (
                <Button onClick={() => setShowCreate(true)}>
                  <Plus size={18} />
                  Create Election
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {elections.map((election) => (
            <Card key={election.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">{election.title}</h3>
                  {election.description && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{election.description}</p>
                  )}
                </div>
                {statusBadge(election.status)}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                {election.start_time && (
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    {new Date(election.start_time).toLocaleDateString()}
                  </span>
                )}
                {election.end_time && (
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    {new Date(election.end_time).toLocaleDateString()}
                  </span>
                )}
              </div>

              {canManage && (
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={election.status}
                    onChange={(e) => handleStatusChange(election, e.target.value)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={ELECTION_STATUS.DRAFT}>Draft</option>
                    <option value={ELECTION_STATUS.ACTIVE}>Active</option>
                    <option value={ELECTION_STATUS.CLOSED}>Closed</option>
                    <option value={ELECTION_STATUS.PUBLISHED}>Published</option>
                  </select>
                  <Button size="sm" variant="secondary" onClick={() => setConfiguringElection(election)}>
                    <Settings size={14} />
                    Positions
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(election)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create Election Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Election">
        <div className="space-y-4">
          <Input
            label="Election Title"
            value={title}
            onChange={setTitle}
            placeholder="e.g., 2026 Student Council Election"
            required
          />
          <Textarea
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="Describe this election..."
            rows={3}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Voting Start"
              type="datetime-local"
              value={startTime}
              onChange={setStartTime}
            />
            <Input
              label="Voting End"
              type="datetime-local"
              value={endTime}
              onChange={setEndTime}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !title}>
              {submitting ? "Creating..." : "Create Election"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Configure Positions Modal */}
      {configuringElection && (
        <PositionsModal
          election={configuringElection}
          onClose={() => setConfiguringElection(null)}
          onSaved={load}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Election"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This will also delete all positions, candidates, and votes associated with it. This action cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function PositionsModal({
  election,
  onClose,
  onSaved,
}: {
  election: Election;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxVotes, setMaxVotes] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  async function loadPos() {
    setLoading(true);
    try {
      const data = await loadPositions(election.id);
      setPositions(data);
    } catch {
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPos();
  }, [election.id]);

  async function handleAdd() {
    setSubmitting(true);
    try {
      await createPosition({
        election_id: election.id,
        title,
        description,
        max_votes: parseInt(maxVotes) || 1,
        display_order: positions.length,
      });
      setTitle("");
      setDescription("");
      setMaxVotes("1");
      await loadPos();
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add position");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeletePos(id: string) {
    try {
      await deletePosition(id);
      await loadPos();
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete position");
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={`Positions: ${election.title}`} maxWidth="max-w-2xl">
      <div className="space-y-6">
        {/* Existing positions */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Configured Positions</h3>
          {loading ? (
            <LoadingState message="Loading positions..." />
          ) : positions.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center bg-slate-50 rounded-lg">
              No positions configured yet. Add positions below.
            </p>
          ) : (
            <div className="space-y-2">
              {positions.map((pos, idx) => (
                <div
                  key={pos.id}
                  className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3"
                >
                  <div>
                    <span className="text-sm font-medium text-slate-900">
                      {idx + 1}. {pos.title}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">
                      (max {pos.max_votes} vote{pos.max_votes > 1 ? "s" : ""})
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeletePos(pos.id)}
                    className="text-slate-400 hover:text-error-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add new position */}
        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Add New Position</h3>
          <div className="space-y-3">
            <Input
              label="Position Title"
              value={title}
              onChange={setTitle}
              placeholder="e.g., President, Secretary, Treasurer"
              required
            />
            <Textarea
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="Describe this position..."
              rows={2}
            />
            <Input
              label="Max Votes per Voter"
              type="number"
              value={maxVotes}
              onChange={setMaxVotes}
              placeholder="1"
            />
            <Button onClick={handleAdd} disabled={submitting || !title} size="sm">
              <Plus size={16} />
              Add Position
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
