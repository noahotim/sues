import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckSquare, CheckCircle2, Clock, AlertCircle, LogOut, LayoutDashboard, BarChart3 } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  electionService,
  candidateService,
  rosterService,
  voteService,
  authService,
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

interface BallotSection {
  election: Election;
  positions: Position[];
  candidates: Candidate[];
  eligible: boolean;
  votedPositions: Set<string>;
}

export default function VotePage() {
  const { session, profile, permissions, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [ballots, setBallots] = useState<BallotSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canVote = permissions.includes("VOTE");

  useEffect(() => {
    if (!authLoading && !session) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, session, navigate]);

  const load = useCallback(async () => {
    if (!session?.user.email) return;
    setLoading(true);
    setError(false);
    try {
      const { data } = await electionService.getElections();
      const active = (data || []).filter((e) => e.status === "active");

      // Build a ballot section for EVERY active election - the voter completes
      // the whole slate in one pass instead of hopping between elections.
      const sections = await Promise.all(
        active.map(async (el) => {
          const [posRes, candRes, rosterRes] = await Promise.all([
            electionService.getPositions(el.id),
            candidateService.getCandidates(el.id),
            rosterService.getMyRosterEntry(el.id, session.user.email),
          ]);
          let entry = rosterRes.data;

          // The uploaded register is system-wide: register members are eligible
          // everywhere. Materialize their per-election row for turnout tracking.
          if (!entry) {
            const reg = await rosterService.isOnRegister(session.user.email);
            if (reg.data === true) {
              rosterService
                .ensureRosterRow(el.id, session.user.email, profile?.fullName || "")
                .catch(() => {});
              entry = {
                id: `voter_${el.id}_${session.user.email.toLowerCase()}`,
                electionId: el.id,
                voterEmail: session.user.email.toLowerCase(),
                voterName: profile?.fullName || "",
                hasVoted: false,
                votedPositions: [],
              };
            }
          }

          const positions = (posRes.data || []).slice().sort((a, b) => a.displayOrder - b.displayOrder);
          return {
            election: el,
            positions,
            candidates: candRes.data || [],
            eligible: !!entry,
            votedPositions: new Set(entry?.votedPositions || []),
          } as BallotSection;
        })
      );

      setBallots(sections);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [session, profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSignOut() {
    await authService.signOut();
    navigate("/login", { replace: true });
  }

  async function handleSubmitVote(electionId: string, positionId: string) {
    if (!session) return;
    const key = `${electionId}:${positionId}`;
    const candidateId = selections[key];
    if (!candidateId) return;

    setSubmittingKey(key);
    setSubmitError(null);
    try {
      const res = await voteService.submitVote(electionId, positionId, candidateId);
      if (res.error) {
        setSubmitError(res.error);
        return;
      }
      setBallots((prev) =>
        prev.map((b) =>
          b.election.id === electionId
            ? { ...b, votedPositions: new Set(b.votedPositions).add(positionId) }
            : b
        )
      );
      setSelections((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit vote");
    } finally {
      setSubmittingKey(null);
    }
  }

  async function confirmSignOut() {
    await handleSignOut();
  }
  void confirmSignOut;

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

  const completedBallots = ballots.filter(
    (b) => b.eligible && b.positions.length > 0 && b.positions.every((p) => b.votedPositions.has(p.id))
  ).length;
  const relevantBallots = ballots.filter((b) => b.eligible && b.positions.length > 0).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar: brand + voter identity + sign out */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/sues-logo.jpg"
              alt="SUES logo"
              className="w-9 h-9 object-contain rounded-sm flex-shrink-0"
            />
            <span className="text-xs font-bold tracking-widest text-primary-900 uppercase truncate">
              SUES Elections
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-slate-500 truncate max-w-[180px]">
              {profile?.fullName || session?.user.email}
            </span>
            {permissions.includes("VIEW_DASHBOARD") && (
              <Link
                to="/admin/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-900 hover:underline"
              >
                <LayoutDashboard size={14} />
                Dashboard
              </Link>
            )}
            {permissions.includes("VIEW_RESULTS") && (
              <Link
                to="/results"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-900 hover:underline"
              >
                <BarChart3 size={14} />
                Results
              </Link>
            )}
            <Button variant="secondary" onClick={handleSignOut} className="!px-3 !py-2">
              <LogOut size={16} />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="mb-6 border-b-2 border-primary-900 pb-6">
          <h1 className="text-4xl font-extrabold text-primary-900 tracking-tight">Official Voting Booth</h1>
          <p className="text-sm text-slate-600 mt-2">
            Your vote is confidential and securely recorded on the SUES electoral ledger.
            Each voter casts <strong>one ballot per position</strong> — repeat attempts are
            automatically rejected by the system.
          </p>
        </div>

        {/* Submit error */}
        {submitError && (
          <div className="text-sm text-error-600 bg-error-50 border border-error-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <AlertCircle size={16} />
            {submitError}
          </div>
        )}

        {ballots.length === 0 ? (
          <Card className="p-8 max-w-md mx-auto text-center">
            <EmptyState
              icon={<CheckSquare size={48} />}
              title="No active elections"
              message="There are no elections currently open for voting. Please check back later."
            />
          </Card>
        ) : (
          <>
            {/* Progress */}
            <Card className="p-4 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                Ballots completed:{" "}
                <span className="font-extrabold text-primary-900">
                  {completedBallots} / {relevantBallots}
                </span>
              </p>
              {relevantBallots > 0 && completedBallots === relevantBallots && (
                <Badge variant="success">
                  <CheckCircle2 size={12} className="mr-1" />
                  All done
                </Badge>
              )}
            </Card>

            {ballots.map((b) => {
              const done = b.eligible && b.positions.length > 0 && b.positions.every((p) => b.votedPositions.has(p.id));
              return (
                <section key={b.election.id} className="space-y-4">
                  {/* Election heading */}
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200 pb-2">
                    <div>
                      <h2 className="text-xl font-bold text-primary-900">{b.election.title}</h2>
                      {b.election.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{b.election.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Active</Badge>
                      {done && (
                        <Badge variant="primary">
                          <CheckCircle2 size={12} className="mr-1" />
                          Completed
                        </Badge>
                      )}
                    </div>
                  </div>

                  {!b.eligible ? (
                    <Card className="p-5 border-warning-200 bg-warning-50">
                      <div className="flex items-start gap-3">
                        <AlertCircle size={20} className="text-warning-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-warning-700">You are not on this election's voter roster</p>
                          <p className="text-xs text-warning-600 mt-1">
                            You are not registered as an eligible voter for this election. Contact an
                            administrator if you believe this is an error.
                          </p>
                        </div>
                      </div>
                    </Card>
                  ) : (() => {
                    const now = Date.now();
                    const notStarted = b.election.startTime && new Date(b.election.startTime).getTime() > now;
                    const closed = b.election.endTime && new Date(b.election.endTime).getTime() < now;
                    if (notStarted) {
                      return (
                        <Card className="p-5 border-warning-200 bg-warning-50">
                          <div className="flex items-start gap-3">
                            <Clock size={20} className="text-warning-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-warning-700">Polls have not opened yet</p>
                              <p className="text-xs text-warning-600 mt-1">
                                Voting for this election opens at{" "}
                                <strong>{new Date(b.election.startTime!).toLocaleString()}</strong>.
                                No ballots can be cast before then.
                              </p>
                            </div>
                          </div>
                        </Card>
                      );
                    }
                    if (closed) {
                      return (
                        <Card className="p-5 border-slate-300 bg-slate-100">
                          <div className="flex items-start gap-3">
                            <Clock size={20} className="text-slate-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-slate-700">Polls have closed</p>
                              <p className="text-xs text-slate-600 mt-1">
                                Voting ended at <strong>{new Date(b.election.endTime!).toLocaleString()}</strong>.
                                Ballots can no longer be cast.
                              </p>
                              <Link
                                to="/results"
                                className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-primary-900 hover:underline"
                              >
                                <BarChart3 size={13} />
                                View Official Results
                              </Link>
                            </div>
                          </div>
                        </Card>
                      );
                    }
                    return b.positions.length === 0 ? (
                      <Card className="p-5">
                        <EmptyState
                          icon={<CheckSquare size={40} />}
                          title="No positions to vote on"
                          message="This election has no configured positions yet."
                        />
                      </Card>
                    ) : (
                      b.positions.map((position, idx) => {
                      const positionCandidates = b.candidates.filter((c) => c.positionId === position.id);
                      const hasVoted = b.votedPositions.has(position.id);
                      const key = `${b.election.id}:${position.id}`;
                      const selected = selections[key];

                      return (
                        <Card key={key} className="p-5">
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
                          ) : positionCandidates.length === 1 ? (
                            <>
                              <div className="bg-warning-50 border border-warning-200 rounded-sm px-3 py-2 mb-3">
                                <p className="text-xs text-warning-700">
                                  This position is <strong>unopposed</strong>. Casting your vote affirms
                                  the nomination (at least 51% is required to confirm).
                                </p>
                              </div>
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
                                      name={key}
                                      value={cand.id}
                                      checked={selected === cand.id}
                                      onChange={() =>
                                        setSelections((prev) => ({ ...prev, [key]: cand.id }))
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
                                  onClick={() => handleSubmitVote(b.election.id, position.id)}
                                  disabled={!selected || submittingKey === key}
                                >
                                  {submittingKey === key ? (
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
                                      name={key}
                                      value={cand.id}
                                      checked={selected === cand.id}
                                      onChange={() =>
                                        setSelections((prev) => ({ ...prev, [key]: cand.id }))
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
                                  onClick={() => handleSubmitVote(b.election.id, position.id)}
                                  disabled={!selected || submittingKey === key}
                                >
                                  {submittingKey === key ? (
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
                    })
                  );
                })()
              }
                </section>
              );
            })}

            {/* All done confirmation */}
            {relevantBallots > 0 && completedBallots === relevantBallots && (
              <Card className="p-6 text-center bg-success-50 border-success-200">
                <CheckCircle2 size={40} className="text-success-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-success-700">All Votes Submitted</h3>
                <p className="text-sm text-success-600 mt-1">
                  You have completed every available ballot. Thank you for participating!
                </p>
              </Card>
            )}

            {/* Clock info */}
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pb-6">
              <Clock size={14} />
              Polls follow each election's official opening and closing times.
            </div>

            {/* Technical support */}
            <div className="border-t border-slate-200 pt-5 pb-10 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                Having trouble voting?
              </p>
              <p className="text-xs text-slate-600">
                WhatsApp <span className="font-medium text-primary-900">Arikod Charles</span>
                <span className="text-slate-500"> (Electoral Commission) +256 700 837339</span> or
                <span className="font-medium text-primary-900"> Abel Ea</span>
                <span className="text-slate-500"> (Outgoing President) +256 784 014317</span>.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
