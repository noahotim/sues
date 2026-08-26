import { useEffect, useState, useCallback, type ChangeEvent } from "react";
import { Plus, Users, Trash2, Pencil, Image as ImageIcon } from "lucide-react";
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

  // Add/Edit form state
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [positionId, setPositionId] = useState("");
  const [newPositionTitle, setNewPositionTitle] = useState("");
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setName("");
    setBio("");
    setPhotoUrl("");
    setPhotoFile(null);
    setPhotoPreview("");
    setPositionId("");
    setNewPositionTitle("");
    setEditing(null);
  }

  function openEdit(cand: Candidate) {
    setEditing(cand);
    setName(cand.name);
    setBio(cand.bio);
    setPhotoUrl(cand.photoUrl || "");
    setPhotoFile(null);
    setPhotoPreview("");
    setPositionId(cand.positionId);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      // If the user chose "+ Create new position", make it first.
      let posId = positionId;
      if (posId === "__new") {
        const title = newPositionTitle.trim();
        if (!title) throw new Error("Enter a name for the new position.");
        const np = await electionService.createPosition({
          electionId: selectedElectionId,
          title,
          description: "",
          maxVotes: 1,
          displayOrder: positions.length,
        });
        if (np.error) throw new Error(np.error);
        posId = np.data?.id || "";
        if (np.data) setPositions((prev) => [...prev, np.data as Position]);
        setPositionId(posId);
      }

      let finalPhotoUrl = photoUrl;
      if (photoFile) {
        const up = await candidateService.uploadCandidatePhoto(photoFile);
        if (up.error) throw new Error(up.error);
        finalPhotoUrl = up.data?.path || "";
        // Remove the previous photo if we replaced it (no-op for data URLs)
        if (editing?.photoUrl && editing.photoUrl !== finalPhotoUrl) {
          await candidateService.deleteCandidatePhoto();
        }
      }
      if (editing) {
        await candidateService.updateCandidate(editing.id, {
          name,
          bio,
          positionId: posId,
          photoUrl: finalPhotoUrl,
        });
      } else {
        await candidateService.createCandidate({
          electionId: selectedElectionId,
          positionId: posId,
          name,
          bio,
          photoUrl: finalPhotoUrl,
          displayOrder: candidates.length,
        });
      }
      setShowAdd(false);
      resetForm();
      const candRes = await candidateService.getCandidates(selectedElectionId);
      if (candRes.data) setCandidates(candRes.data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save candidate");
    } finally {
      setSubmitting(false);
    }
  }

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

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.photoUrl) {
        await candidateService.deleteCandidatePhoto();
      }
      await candidateService.deleteCandidate(deleteTarget.id);
      setDeleteTarget(null);
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
          <Button onClick={() => { resetForm(); setShowAdd(true); }} disabled={!selectedElectionId}>
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
      ) : positions.length === 0 || candidates.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Users size={48} />}
            title="No candidates yet"
            message={
              positions.length === 0
                ? "This election has no positions yet. Use \"Add Candidate\" and create a position right there."
                : "Add candidates for the positions in this election."
            }
            action={
              canManage && (
                <Button onClick={() => { resetForm(); setShowAdd(true); }}>
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
            const positionCandidates = candidates.filter((c) => c.positionId === position.id);
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
                      {cand.photoUrl ? (
                        <img
                          src={cand.photoUrl}
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
                         <div className="flex items-center gap-1 flex-shrink-0">
                           <button
                             onClick={() => openEdit(cand)}
                             className="text-slate-300 hover:text-primary-900 transition-colors"
                             title="Edit candidate"
                           >
                             <Pencil size={16} />
                           </button>
                           <button
                             onClick={() => setDeleteTarget(cand)}
                             className="text-slate-300 hover:text-error-600 transition-colors"
                             title="Delete candidate"
                           >
                             <Trash2 size={16} />
                           </button>
                         </div>
                       )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Candidate Modal */}
      <Modal
        open={showAdd || !!editing}
        onClose={() => { setShowAdd(false); resetForm(); }}
        title={editing ? "Edit Candidate" : "Add Candidate"}
      >
        <div className="space-y-4">
          <Select
            label="Position"
            value={positionId}
            onChange={setPositionId}
            options={[
              ...positions.map((p) => ({ value: p.id, label: p.title })),
              { value: "__new", label: "+ Create new position" },
            ]}
            placeholder={positions.length === 0 ? "Create a new position..." : "Select a position..."}
            required
          />
          {positionId === "__new" && (
            <Input
              label="New Position Title"
              value={newPositionTitle}
              onChange={setNewPositionTitle}
              placeholder="e.g. Treasurer"
              required
            />
          )}
          {positions.length === 0 && (
            <p className="text-xs text-slate-400">
              This election has no positions yet — pick "+ Create new position" to add one.
            </p>
          )}
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

          {/* Photo upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Photo
            </label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-sm border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {photoPreview || photoUrl ? (
                  <img
                    src={photoPreview || photoUrl}
                    alt="preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon size={28} className="text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-sm file:border-0 file:bg-primary-900 file:text-white file:cursor-pointer hover:file:bg-primary-800"
                />
                <p className="text-xs text-slate-400 mt-2">
                  Upload an image (JPG/PNG, max 5MB). Or paste a URL below.
                </p>
              </div>
            </div>
          </div>
          <Input
            label="Photo URL (optional)"
            value={photoUrl}
            onChange={setPhotoUrl}
            placeholder="https://..."
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => { setShowAdd(false); resetForm(); }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                submitting ||
                !name ||
                (positionId === "__new" ? !newPositionTitle.trim() : !positionId)
              }
            >
              {submitting ? "Saving..." : editing ? "Save Changes" : "Add Candidate"}
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
