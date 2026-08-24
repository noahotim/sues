import { useEffect, useState, useCallback } from "react";
import { BarChart3, Trophy } from "lucide-react";
import {
  electionService,
  candidateService,
  rosterService,
  voteService,
  type Election,
  type Position,
  type Candidate,
  type VoterRosterEntry,
} from "../services";
import {
  Card,
  Badge,
  Select,
  LoadingState,
  ErrorState,
  EmptyState,
} from "../components/ui";

interface PositionResult {
  position: Position;
  results: { candidate: Candidate; votes: number; percentage: number }[];
  totalVotes: number;
}

export default function ResultsPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [roster, setRoster] = useState<VoterRosterEntry[]>([]);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
      setRoster([]);
      setVoteCounts({});
      return;
    }
    (async () => {
      try {
        const [posRes, candRes, rosRes, votesRes] = await Promise.all([
          electionService.getPositions(selectedElectionId),
          candidateService.getCandidates(selectedElectionId),
          rosterService.getRoster(selectedElectionId),
          voteService.getVotes(selectedElectionId),
        ]);
        if (posRes.data) setPositions(posRes.data);
        if (candRes.data) setCandidates(candRes.data);
        if (rosRes.data) setRoster(rosRes.data);
        if (votesRes.data) {
          const counts: Record<string, number> = {};
          votesRes.data.forEach(v => {
            counts[v.candidateId] = (counts[v.candidateId] || 0) + 1;
          });
          setVoteCounts(counts);
        }
      } catch {
        setPositions([]);
        setCandidates([]);
        setRoster([]);
        setVoteCounts({});
      }
    })();
  }, [selectedElectionId]);

  const totalVotesCast = Object.values(voteCounts).reduce((sum, v) => sum + v, 0);
  const turnoutPercentage =
    roster.length > 0 ? Math.round((totalVotesCast / roster.length) * 100) : 0;

  // Build results per position
  const positionResults: PositionResult[] = positions
    .map((pos) => {
      const posCandidates = candidates.filter((c) => c.positionId === pos.id);
      const posVotes = posCandidates.reduce(
        (sum, c) => sum + (voteCounts[c.id] ?? 0),
        0
      );
      const results = posCandidates
        .map((c) => ({
          candidate: c,
          votes: voteCounts[c.id] ?? 0,
          percentage: posVotes > 0 ? Math.round(((voteCounts[c.id] ?? 0) / posVotes) * 100) : 0,
        }))
        .sort((a, b) => b.votes - a.votes);
      return { position: pos, results, totalVotes: posVotes };
    })
    .sort((a, b) => a.position.displayOrder - b.position.displayOrder);

  if (loading) return <LoadingState message="Loading results..." />;
  if (error) return <ErrorState message="We could not load the results." onRetry={load} />;

  const selectedElection = elections.find((e) => e.id === selectedElectionId);

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-8 border-b-2 border-primary-900 pb-4">
        <div>
          <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">SUES Administration</h2>
          <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">Election Results</h1>
          <p className="text-sm text-slate-600 mt-2">
            Results are calculated from actual cast votes and update in real time.
          </p>
        </div>
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
            icon={<BarChart3 size={48} />}
            title="No elections available"
            message="Results will appear here once elections are created and votes are cast."
          />
        </Card>
      ) : !selectedElectionId ? (
        <Card className="p-6">
          <EmptyState
            icon={<BarChart3 size={48} />}
            title="Select an election"
            message="Choose an election above to view its results."
          />
        </Card>
      ) : (
        <>
          {/* Summary metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-5 rounded-sm shadow-none border-l-4 border-l-slate-400">
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{roster.length}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-1">Eligible Voters</p>
            </Card>
            <Card className="p-5 rounded-sm shadow-none border-l-4 border-l-primary-900">
              <p className="text-3xl font-extrabold text-primary-900 tracking-tight">{totalVotesCast}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-primary-900 mt-1">Votes Cast</p>
            </Card>
            <Card className="p-5 rounded-sm shadow-none border-l-4 border-l-success-600">
              <p className="text-3xl font-extrabold text-success-600 tracking-tight">{turnoutPercentage}%</p>
              <p className="text-xs font-bold uppercase tracking-widest text-success-600 mt-1">Turnout</p>
            </Card>
            <Card className="p-5 rounded-sm shadow-none border-l-4 border-l-slate-900">
              <div className="flex items-center gap-2">
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{positions.length}</p>
                {selectedElection && statusBadge(selectedElection.status)}
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-1">Positions</p>
            </Card>
          </div>

          {/* Per-position results */}
          {positionResults.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={<BarChart3 size={48} />}
                title="No positions configured"
                message="This election has no positions yet."
              />
            </Card>
          ) : (
            <div className="space-y-6">
              {positionResults.map(({ position, results, totalVotes }) => (
                <Card key={position.id} className="p-5 rounded-sm shadow-none border border-slate-200">
                  <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-primary-900">{position.title}</h3>
                      {position.description && (
                        <p className="text-sm text-slate-600 mt-1">{position.description}</p>
                      )}
                    </div>
                    <Badge variant="neutral">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</Badge>
                  </div>

                  {results.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">No candidates for this position.</p>
                  ) : (
                    <div className="space-y-3">
                      {results.map((r, idx) => (
                        <div key={r.candidate.id}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              {idx === 0 && r.votes > 0 && (
                                <Trophy size={16} className="text-warning-500" />
                              )}
                              <span className="text-sm font-medium text-slate-900">
                                {r.candidate.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="text-slate-600">{r.votes} vote{r.votes !== 1 ? "s" : ""}</span>
                              <span className="font-semibold text-slate-900 w-12 text-right">
                                {r.percentage}%
                              </span>
                            </div>
                          </div>
                          <div className="h-3 rounded-sm bg-slate-100 overflow-hidden mt-1">
                            <div
                              className={`h-full transition-all duration-500 ${
                                idx === 0 && r.votes > 0
                                  ? "bg-success-600"
                                  : "bg-primary-900"
                              }`}
                              style={{ width: `${r.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
