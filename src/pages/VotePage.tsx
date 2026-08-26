import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, CheckCircle2, Vote, Clock, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  electionService,
  candidateService,
  rosterService,
  voteService,
  type Election,
  type Position,
  type Candidate,
} from "../services";
import {
  Card,
  Button,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
  Spinner,
} from "../components/ui";

export default function VotePage() {
  const { session, permissions, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isEligible, setIsEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [votedPositions, setVotedPositions] = useState<Set<string>>(new Set());
  const [submittingPos, setSubmittingPos] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canVote = permissions.includes("VOTE");

  useEffect(() => {
    if (!authLoading && !session) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, session, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await electionService.getElections();
      if (data) {
        const active = data.filter((e) => e.status === "active");
        setElections(active);
        if (active.length > 0 && !selectedElectionId) {
          setSelectedElectionId(active[0].id);
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
    if (!selectedElectionId || !session) {
      setPositions([]);
      setCandidates([]);
      setIsEligible(false);
      return;
    }
    (async () => {
      try {
        const [posRes, candRes, rosterRes] = await Promise.all([
          electionService.getPositions(selectedElectionId),
          candidateService.getCandidates(selectedElectionId),
          rosterService.getMyRosterEntry(selectedElectionId, session.user.email),
        ]);
        const pos = posRes.data || [];
        setPositions(pos);
        setCandidates(candRes.data || []);
        const myEntry = rosterRes.data;
        setIsEligible(!!myEntry);

        // Which positions has this voter already cast a ballot for? Read from the
        // voter's own roster row (email-scoped), matching server-side enforcement.
        setVotedPositions(new Set(myEntry?.votedPositions || []));
      } catch {
        setPositions([]);
        setCandidates([]);
        setIsEligible(false);
      }
    })();
  }, [selectedElectionId, session]);

  async function handleSubmitVote(positionId: string) {
    if (!session || !selectedElectionId) return;
    const candidateId = selections[positionId];
    if (!candidateId) return;

    setSubmittingPos(positionId);
    setSubmitError(null);
    try {
      await voteService.submitVote(selectedElectionId, positionId, candidateId);
      setVotedPositions((prev) => new Set(prev).add(positionId));
      setSelections((prev) => {
        const next = { ...prev };
        delete next[positionId];
        return next;
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit vote");
    } finally {
      setSubmittingPos(null);
    }
  }

  if (authLoading || loading) return <LoadingState message="Loading ballot..." />;
  if (error) return <ErrorState message="We could not load the voting interface." onRetry={load} />;

  if (!canVote) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle size={40} className="text-warning-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Voting Not Available</h2>
          <p className="text-sm text-slate-500">
            Your current role does not include voting privileges.
          </p>
        </Card>
      </div>
    );
  }

  if (elections.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <Card className="p-8 max-w-md text-center">
          <EmptyState
            icon={<Vote size={48} />}
            title="No active elections"
            message="There are no elections currently open for voting. Please check back later."
          />
        </Card>
      </div>
    );
  }

  const selectedElection = elections.find((e) => e.id === selectedElectionId);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="mb-10 border-b-2 border-primary-900 pb-6">
          <div className="flex items-center gap-3 mb-2">
            <Vote size={24} className="text-primary-900" />
            <span className="text-xs font-bold tracking-widest text-slate-500 uppercase">Soroti University Engineering Society</span>
          </div>
          <h1 className="text-4xl font-extrabold text-primary-900 tracking-tight">Official Voting Booth</h1>
          <p className="text-sm text-slate-600 mt-2">
            Your vote is confidential and securely recorded on the SUES electoral ledger.
          </p>
        </div>

        {/* Election selector */}
        {elections.length > 1 && (
          <Card className="p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Select Election</label>
            <select
              value={selectedElectionId}
              onChange={(e) => setSelectedElectionId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-sm border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary-900 focus:border-primary-900"
            >
              {elections.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </Card>
        )}

        {/* Eligibility check */}
        {selectedElectionId && !isEligible && (
          <Card className="p-5 border-warning-200 bg-warning-50">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-warning-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning-700">You are not on the voter roster</p>
                <p className="text-xs text-warning-600 mt-1">
                  You are not registered as an eligible voter for this election. Contact an administrator if you believe this is an error.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Election info */}
        {selectedElection && (
          <Card className="p-5">
            <h2 className="text-2xl font-bold text-slate-900">{selectedElection.title}</h2>
            {selectedElection.description && (
              <p className="text-sm text-slate-600 mt-2">{selectedElection.description}</p>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
              {selectedElection.startTime && (
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  Started: {new Date(selectedElection.startTime).toLocaleString()}
                </span>
              )}
              {selectedElection.endTime && (
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  Ends: {new Date(selectedElection.endTime).toLocaleString()}
                </span>
              )}
            </div>
          </Card>
        )}

        {/* Submit error */}
        {submitError && (
          <div className="text-sm text-error-600 bg-error-50 border border-error-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <AlertCircle size={16} />
            {submitError}
          </div>
        )}

        {/* Ballot positions */}
        {isEligible && positions.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={<CheckSquare size={48} />}
              title="No positions to vote on"
              message="This election has no configured positions yet."
            />
          </Card>
        ) : (
          <div className="space-y-6">
            {positions.map((position, idx) => {
              const positionCandidates = candidates.filter((c) => c.positionId === position.id);
              const hasVoted = votedPositions.has(position.id);
              const selected = selections[position.id];

              return (
                <Card key={position.id} className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Position {idx + 1}
                        </span>
                        {hasVoted && (
                          <Badge variant="success">
                            <CheckCircle2 size={12} className="mr-1" />
                            Voted
                          </Badge>
                        )}
                      </div>
                      <h3 className="text-xl font-bold text-primary-900 mt-1">{position.title}</h3>
                      {position.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{position.description}</p>
                      )}
                    </div>
                  </div>

                  {hasVoted ? (
                    <div className="bg-success-50 border border-success-200 rounded-sm p-4 text-center">
                      <CheckCircle2 size={24} className="text-success-700 mx-auto mb-2" />
                      <p className="text-sm font-medium text-success-800">
                        Your vote has been recorded for this position.
                      </p>
                    </div>
                  ) : positionCandidates.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">
                      No candidates for this position.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {positionCandidates.map((cand) => (
                          <label
                            key={cand.id}
                            className={`flex items-start gap-4 p-4 rounded-sm border-2 cursor-pointer transition-all ${
                              selected === cand.id
                                ? "border-primary-900 bg-primary-50"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`position-${position.id}`}
                              value={cand.id}
                              checked={selected === cand.id}
                              onChange={() =>
                                setSelections((prev) => ({ ...prev, [position.id]: cand.id }))
                              }
                              className="mt-1 accent-primary-900 w-4 h-4"
                            />
                            {cand.photoUrl ? (
                              <img
                                src={cand.photoUrl}
                                alt={cand.name}
                                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                                <span className="text-slate-500 font-semibold text-lg">
                                  {cand.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                            <div className="flex-1">
                              <p className="font-bold text-slate-900 text-base">{cand.name}</p>
                              {cand.bio && (
                                <p className="text-sm text-slate-600 mt-1 leading-relaxed">{cand.bio}</p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button
                          onClick={() => handleSubmitVote(position.id)}
                          disabled={!selected || submittingPos === position.id}
                        >
                          {submittingPos === position.id ? (
                            <>
                              <Spinner className="text-white" size={16} />
                              Submitting...
                            </>
                          ) : (
                            <>
                              <CheckSquare size={16} />
                              Confirm Selection
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* All voted confirmation */}
        {isEligible && positions.length > 0 && votedPositions.size === positions.length && (
          <Card className="p-6 text-center bg-success-50 border-success-200">
            <CheckCircle2 size={40} className="text-success-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-success-700">All Votes Submitted</h3>
            <p className="text-sm text-success-600 mt-1">
              You have voted on all positions in this election. Thank you for participating!
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
