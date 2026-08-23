import { useEffect, useState, useCallback } from "react";
import { Plus, Users, Trash2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  electionService,
  candidateService,
  type Election,
  type Position,
  type Candidate,
} from "../services";
import {
  Card,
  Button,
  Badge,
  Modal,
  Input,
  Textarea,
  Select,
  LoadingState,
  ErrorState,
  EmptyState,
  ConfirmDialog,
} from "../components/ui";

export default function CandidatesPage() {
  const { permissions } = useAuth();
  const canManage = permissions.includes("MANAGE_CANDIDATES");
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Candidate | null>(null);

  // Add form state
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [positionId, setPositionId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await electionService.getElections();
      if (data) {
        setElections(data);
        if (data.length > 0 && !selectedElectionId) {
          setSelectedElectionId(data[0].id);
        }
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
      setPositions([]);
      setCandidates([]);
      return;
    }
    (async () => {
      try {
        const [posRes, candRes] = await Promise.all([
          electionService.getPositions(selectedElectionId),
          candidateService.getCandidates(selectedElectionId),
        ]);
        if (posRes.data) setPositions(posRes.data);
        if (candRes.data) setCandidates(candRes.data);
      } catch {
        setPositions([]);
        setCandidates([]);
      }
    })();
  }, [selectedElectionId]);

  async function handleAdd() {
    setSubmitting(true);
    try {
      await candidateService.createCandidate({
        election_id: selectedElectionId,
        position_id: positionId,
        name,
        bio,
        photo_url: photoUrl,
        display_order: candidates.length,
      });
      setShowAdd(false);
      setName("");
      setBio("");
      setPhotoUrl("");
      setPositionId("");
      const candRes = await candidateService.getCandidates(selectedElectionId);
      if (candRes.data) setCandidates(candRes.data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add candidate");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await candidateService.deleteCandidate(deleteTarget.id);
      const candRes = await candidateService.getCandidates(selectedElectionId);
      if (candRes.data) setCandidates(candRes.data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete candidate");
    }
  }

  if (loading) return <LoadingState message="Loading candidates..." />;
  if (error) return <ErrorState message="We could not load the candidates." onRetry={load} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-8 border-b-2 border-primary-900 pb-4">
        <div>
          <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">SUES Administration</h2>
          <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">Candidates</h1>
          <p className="text-sm text-slate-600 mt-2">Manage candidates for each election and position.</p>
        </div>
        {canManage && elections.length > 0 && (
          <Button onClick={() => setShowAdd(true)} disabled={!selectedElectionId || positions.length === 0}>
            <Plus size={18} />
            Add Candidate
          </Button>
        )}
      </div>

      {/* Election selector */}
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
            icon={<Users size={48} />}
            title="No elections available"
            message="Create an election first before adding candidates."
          />
        </Card>
      ) : !selectedElectionId ? (
        <Card className="p-6">
          <EmptyState
            icon={<Users size={48} />}
            title="Select an election"
            message="Choose an election above to view and manage its candidates."
          />
        </Card>
      ) : positions.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Users size={48} />}
            title="No positions configured"
            message="This election has no positions yet. Configure positions in the Elections page first."
          />
        </Card>
      ) : candidates.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Users size={48} />}
            title="No candidates yet"
            message="Add candidates for the positions in this election."
            action={
              canManage && (
                <Button onClick={() => setShowAdd(true)}>
                  <Plus size={18} />
                  Add Candidate
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {positions.map((position) => {
            const positionCandidates = candidates.filter((c) => c.position_id === position.id);
            if (positionCandidates.length === 0) return null;
            return (
              <Card key={position.id} className="p-5 rounded-sm shadow-none border border-slate-200">
                <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-3">
                  <h3 className="text-lg font-bold text-primary-900">{position.title}</h3>
                  <Badge variant="neutral">
                    {positionCandidates.length} candidate{positionCandidates.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {positionCandidates.map((cand) => (
                    <div
                      key={cand.id}
                      className="flex items-start gap-4 p-4 rounded-sm border-2 border-slate-100 hover:border-primary-300 transition-colors bg-white"
                    >
                      {cand.photo_url ? (
                        <img
                          src={cand.photo_url}
                          alt={cand.name}
                          className="w-14 h-14 rounded-sm object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-sm bg-slate-100 flex items-center justify-center flex-shrink-0 border border-slate-200">
                          <span className="text-slate-500 font-bold text-lg">
                            {cand.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 text-base">{cand.name}</p>
                        {cand.bio && (
                          <p className="text-sm text-slate-600 mt-1 line-clamp-2 leading-relaxed">{cand.bio}</p>
                        )}
                      </div>
                      {canManage && (
                        <button
                          onClick={() => setDeleteTarget(cand)}
                          className="text-slate-300 hover:text-error-600 transition-colors flex-shrink-0"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Candidate Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Candidate">
        <div className="space-y-4">
          <Select
            label="Position"
            value={positionId}
            onChange={setPositionId}
            options={positions.map((p) => ({ value: p.id, label: p.title }))}
            placeholder="Select a position..."
            required
          />
          <Input
            label="Candidate Name"
            value={name}
            onChange={setName}
            placeholder="Full name"
            required
          />
          <Textarea
            label="Bio"
            value={bio}
            onChange={setBio}
            placeholder="Brief biography or statement..."
            rows={3}
          />
          <Input
            label="Photo URL"
            value={photoUrl}
            onChange={setPhotoUrl}
            placeholder="https://..."
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting || !name || !positionId}>
              {submitting ? "Adding..." : "Add Candidate"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Candidate"
        message={`Are you sure you want to remove "${deleteTarget?.name}" from this election?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
