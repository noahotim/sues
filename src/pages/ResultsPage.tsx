import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { BarChart3, Trophy, FileDown, ArrowLeft, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import {
  electionService,
  candidateService,
  rosterService,
  voteService,
  type Election,
  type Position,
  type Candidate,
  type VoterRosterEntry,
  type Vote,
} from "../services";
import {
  Card,
  Button,
  Badge,
  Select,
  LoadingState,
  ErrorState,
  EmptyState,
} from "../components/ui";
import DeclarationDocument from "../components/DeclarationDocument";
import ElectoralReturnDocument from "../components/ElectoralReturnDocument";
import {
  downloadDeclarationPdf,
  downloadElectoralReturnPdf,
  printDeclarationPdf,
  printElectoralReturnPdf,
} from "../lib/officialPdf";

interface PositionResult {
  position: Position;
  results: { candidate: Candidate; votes: number; percentage: number }[];
  totalVotes: number;
  unopposed: boolean;
  affirmed: boolean;
}

export default function ResultsPage() {
  const location = useLocation();
  const isPublicView = location.pathname === "/results";
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [roster, setRoster] = useState<VoterRosterEntry[]>([]);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Opens the print-ready official declaration document (A4, two sheets).
  const [showDeclaration, setShowDeclaration] = useState(false);
  // Opens the print-ready official electoral return (A4, two sheets).
  const [showElectoralReturn, setShowElectoralReturn] = useState(false);

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
    setLoading(true);
    setError(false);
    // Realtime election list for the picker.
    const unsubE = electionService.subscribeToElections((data) => {
      setElections(data);
      if (data.length > 0 && !selectedElectionId) {
        setSelectedElectionId(data[0].id);
      }
      setLoading(false);
      setError(false);
    });
    return unsubE;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedElectionId) {
      setPositions([]);
      setCandidates([]);
      setRoster([]);
      setVoteCounts({});
      return;
    }
    // Realtime positions + candidates + roster + votes - tallies update live
    // as ballots are cast, with no manual refresh.
    const toCounts = (votes: Vote[]) => {
      const counts: Record<string, number> = {};
      votes.forEach((v) => {
        counts[v.candidateId] = (counts[v.candidateId] || 0) + 1;
      });
      return counts;
    };
    const unsubP = electionService.subscribeToPositions(selectedElectionId, (data) => {
      setPositions(data);
      setLoading(false);
      setError(false);
    });
    const unsubC = candidateService.subscribeToCandidates(selectedElectionId, (data) => {
      setCandidates(data);
      setLoading(false);
      setError(false);
    });
    const unsubR = rosterService.subscribeToRoster(selectedElectionId, (data) => {
      setRoster(data);
      setLoading(false);
      setError(false);
    });
    const unsubV = voteService.subscribeToVotes(selectedElectionId, (data) => {
      setVoteCounts(toCounts(data));
      setLoading(false);
      setError(false);
    });
    return () => {
      unsubP();
      unsubC();
      unsubR();
      unsubV();
    };
  }, [selectedElectionId]);

  const votersVoted = roster.filter((r) => r.hasVoted).length;
  const turnoutPercentage =
    roster.length > 0 ? Math.round((votersVoted / roster.length) * 100) : 0;
  // Everyone who RESOLVED a ballot (voted or abstained) = participants. For an
  // unopposed position the confidence test is affirm / participants, so a
  // participant who abstained (declined confidence) counts against affirmation.
  const participants = roster.filter(
    (r) => r.hasVoted || (r.votedPositions && r.votedPositions.length > 0)
  ).length;

  const positionResults: PositionResult[] = positions
    .map((pos) => {
      const posCandidates = candidates.filter((c) => c.positionId === pos.id);
      const posVotes = posCandidates.reduce(
        (sum, c) => sum + (voteCounts[c.id] ?? 0),
        0
      );
      const unopposed = posCandidates.length === 1;
      const single = posCandidates[0];
      // Affirmation requires the candidate to win a vote of confidence from
      // MORE THAN 50% of all participants who submitted a ballot. Abstainers
      // (declined confidence) count as not affirming.
      const affirmPct = unopposed && single && participants > 0
        ? ((voteCounts[single.id] ?? 0) / participants) * 100
        : 0;
      const affirmed = unopposed && affirmPct > 50;
      const results = posCandidates
        .map((c) => ({
          candidate: c,
          votes: voteCounts[c.id] ?? 0,
          percentage: posVotes > 0 ? Math.round(((voteCounts[c.id] ?? 0) / posVotes) * 100) : 0,
        }))
        .sort((a, b) => b.votes - a.votes);
      return { position: pos, results, totalVotes: posVotes, unopposed, affirmed };
    })
    .sort((a, b) => a.position.displayOrder - b.position.displayOrder);

  if (loading) return <LoadingState message="Loading results..." />;
  if (error) return <ErrorState message="We could not load the results." onRetry={load} />;

  const selectedElection = elections.find((e) => e.id === selectedElectionId);
  const isElectionOver =
    !!selectedElection &&
    (selectedElection.status === "closed" ||
      selectedElection.status === "published" ||
      (selectedElection.endTime && new Date(selectedElection.endTime).getTime() < Date.now()));

  // Voters (public /results) only see tallies once the election is over - the
  // results are locked while voting is in progress and appear automatically the
  // moment polls close. Admins (/admin/results) keep the live realtime preview.
  const isPublicLocked = isPublicView && !!selectedElectionId && !isElectionOver;

  async function downloadPdf() {
    if (!selectedElection) return;
    // Load the PDF library on demand so it never slows the initial page load.
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const margin = 18;
    const width = doc.internal.pageSize.getWidth();
    let y = margin;

    // Full-width navy header band (stretched edge-to-edge, no side margins) with
    // a gold accent stripe, matching the official SUES electoral branding. The
    // band runs from x=0 to the full page width so the colour fills the page.
    const bandH = 40;
    doc.setFillColor(11, 26, 44);
    doc.rect(0, 0, width, bandH, "F");
    doc.setFillColor(201, 162, 39);
    doc.rect(0, 0, width, 2.5, "F");
    doc.setTextColor(255, 255, 255);

    // Logo
    try {
      const img = await fetch("/sues-logo.jpg").then((r) => r.blob());
      const dataUrl: string = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = () => res(String(reader.result));
        reader.readAsDataURL(img);
      });
      doc.addImage(dataUrl, "JPEG", margin, y - 2, 18, 18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("SUES", margin + 24, y + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text("Soroti University Engineering Society", margin + 24, y + 11);
      doc.setTextColor(255, 255, 255);
    } catch {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("SUES Elections", margin, y + 6);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.setTextColor(255, 255, 255);
    doc.text("Official Election Results", margin, bandH - 10);
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    y = bandH + 18;

    doc.setFontSize(12);
    doc.text("Election: " + selectedElection.title, margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(
      "Generated: " + new Date().toLocaleString() + "   |   Status: " + selectedElection.status.toUpperCase(),
      margin,
      y
    );
    doc.setTextColor(0);
    y += 12;

    for (const { position, results, totalVotes, unopposed, affirmed } of positionResults) {
      // page-break safety
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(13);
      doc.setTextColor(23, 37, 84);
      doc.text(position.title + (unopposed ? "  (UNOPPOSED)" : ""), margin, y);
      doc.setTextColor(0);
      y += 7;

      if (results.length === 0) {
        doc.setFontSize(9);
        doc.text("No candidates for this position.", margin, y);
        y += 6;
        continue;
      }

      doc.setFontSize(10);
      for (const r of results) {
        // Unopposed: show the confidence % against ALL participants (abstainers
        // count against affirmation). Contested: share of the position's votes.
        const pct = unopposed
          ? participants > 0
            ? Math.round((r.votes / participants) * 100)
            : 0
          : totalVotes > 0
          ? Math.round((r.votes / totalVotes) * 100)
          : 0;
        doc.setFontSize(10);
        doc.text(`${r.candidate.name}`, margin, y);
        doc.text(`${r.votes} ${unopposed ? "affirm" : "vote(s)"} - ${pct}%`, width - margin, y, { align: "right" });
        // bar
        const barMax = width - margin * 2;
        const barLen = Math.max(0, Math.min(barMax, (barMax * r.votes) / (unopposed ? (participants || 1) : (totalVotes || 1))));
        doc.setFillColor(15, 23, 42);
        doc.rect(margin, y + 2.5, barLen, 2, "F");
        doc.setFillColor(22, 163, 74);
        doc.rect(margin + barLen, y + 2.5, Math.max(0, barMax - barLen), 2, "F");
        y += 9;
      }
      doc.text(
        unopposed
          ? `Affirmations: ${totalVotes} of ${participants} participants (${
              participants > 0 ? Math.round((totalVotes / participants) * 100) : 0
            }%)`
          : `Position total: ${totalVotes} vote(s)`,
        margin,
        y + 2
      );
      y += 6;
      if (unopposed) {
        doc.setFontSize(9);
        doc.setTextColor(180, 83, 9);
        doc.text(
          affirmed
            ? `Unopposed candidate AFFIRMED (majority vote of confidence, >50% of participants).`
            : `Unopposed candidate NOT affirmed (below the 50% confidence threshold).`,
          margin,
          y + 5
        );
        doc.setTextColor(0);
      }
      y += 12;
    }

    // Turnout summary
    doc.setDrawColor(15, 23, 42);
    doc.line(margin, y, width - margin, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Turnout", margin, y);
    doc.setFont("helvetica", "normal");
    y += 6;
    doc.setFontSize(10);
    doc.text(`Eligible voters: ${roster.length}`, margin, y);
    doc.text(`Voters who voted: ${votersVoted}`, margin, y + 6);
    doc.text(`Turnout: ${turnoutPercentage}%`, margin, y + 12);
    y += 20;

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      "Votes are recorded anonymously - no ballot can be traced back to a voter.",
      margin,
      y
    );

    doc.save(`SUES-Results-${selectedElection.title.replace(/[^a-z0-9]+/gi, "-")}.pdf`);
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

  return (
    <>
    {showDeclaration && selectedElection && (
      <DeclarationDocument
        election={selectedElection}
        positionResults={positionResults}
        rosterCount={roster.length}
        participants={participants}
        votersVoted={votersVoted}
        turnoutPercentage={turnoutPercentage}
        totalVotes={Object.values(voteCounts).reduce((s, v) => s + v, 0)}
        onClose={() => setShowDeclaration(false)}
        onPrint={() => void printDeclarationPdf(selectedElection.title)}
        onDownload={() => void downloadDeclarationPdf(selectedElection.title)}
      />
    )}
    {showElectoralReturn && selectedElection && (
      <ElectoralReturnDocument
        election={selectedElection}
        positionResults={positionResults}
        rosterCount={roster.length}
        votersVoted={votersVoted}
        turnoutPercentage={turnoutPercentage}
        onClose={() => setShowElectoralReturn(false)}
        onPrint={() => void printElectoralReturnPdf(selectedElection.title)}
        onDownload={() => void downloadElectoralReturnPdf(selectedElection.title)}
      />
    )}
    <div className={isPublicView ? "min-h-screen bg-slate-50" : "space-y-6 animate-fade-in"}>
      {/* Public layout wrapper */}
      {isPublicView && (
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img src="/sues-logo.jpg" alt="SUES logo" className="w-9 h-9 object-contain rounded-sm flex-shrink-0" />
              <span className="text-xs font-bold tracking-widest text-primary-900 uppercase truncate">
                SUES Elections
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/vote" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-900 hover:underline">
                <ArrowLeft size={14} />
                Back to Voting
              </Link>
            </div>
          </div>
        </header>
      )}
      <div className={isPublicView ? "max-w-5xl mx-auto px-4 py-8 space-y-6" : ""}>

      {/* Page header */}
      <div className="mb-8 border-b-2 border-primary-900 pb-4">
        <div className="flex items-center gap-4">
          {!isPublicView && (
            <img src="/sues-logo.jpg" alt="SUES logo" className="w-12 h-12 object-contain rounded-sm hidden sm:block" />
          )}
          {isPublicView && (
            <img src="/sues-logo.jpg" alt="SUES logo" className="w-12 h-12 object-contain rounded-sm" />
          )}
          <div>
            <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">
              {isPublicView ? "Soroti University Engineering Society" : "SUES Administration"}
            </h2>
            <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">Election Results</h1>
            <p className="text-sm text-slate-600 mt-2">
              {isElectionOver
                ? "Results are official. The ballot has been counted and declared."
                : isPublicLocked
                ? "Results are released automatically once this election closes."
                : "Results are calculated from actual cast votes and update in real time."}
            </p>
          </div>
        </div>
        {selectedElection && positionResults.length > 0 && !isPublicLocked && (
          <div className="flex flex-col items-end gap-2 mt-4 sm:mt-0">
            {isElectionOver && (
              <Button onClick={() => setShowDeclaration(true)} className="!bg-success-600 hover:!bg-success-700">
                <FileDown size={18} />
                Declaration of Results
              </Button>
            )}
            {isElectionOver && (
              <Button onClick={() => setShowElectoralReturn(true)} variant="secondary">
                <FileDown size={18} />
                Official Electoral Return
              </Button>
            )}
            <Button onClick={downloadPdf} variant={isElectionOver ? "secondary" : undefined}>
              <FileDown size={18} />
              Download Report
            </Button>
          </div>
        )}
      </div>

      {isElectionOver && selectedElection && (
        <Card className="p-5 bg-success-50 border-success-200">
          <div className="flex items-start gap-3">
            <Trophy size={22} className="text-success-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-success-800">
                Polls have closed — results are now official.
              </p>
              <p className="text-xs text-success-700 mt-1">
                The system has automatically tallied the final results. The{" "}
                <strong>Declaration of Results</strong> form certifies the winning candidates for
                each position.
              </p>
            </div>
          </div>
        </Card>
      )}

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
      ) : isPublicLocked ? (
        <Card className="p-8 text-center">
          <Lock size={40} className="text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Results not yet available</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Results will appear here automatically as soon as this election closes. Final tallies are
            released only after voting has ended.
          </p>
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
              <p className="text-3xl font-extrabold text-primary-900 tracking-tight">{votersVoted}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-primary-900 mt-1">Voters Voted</p>
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
              {positionResults.map(({ position, results, totalVotes, unopposed, affirmed }) => (
                <Card key={position.id} className="p-5 rounded-sm shadow-none border border-slate-200">
                  <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-primary-900">{position.title}</h3>
                        {unopposed && <Badge variant="warning">Unopposed</Badge>}
                      </div>
                      {position.description && (
                        <p className="text-sm text-slate-600 mt-1">{position.description}</p>
                      )}
                      {unopposed && (
                        <p className="text-xs text-slate-500 mt-1">
                          Unopposed nomination — requires <strong>more than 50%</strong> of all
                          participants to affirm (abstentions count against it).
                        </p>
                      )}
                    </div>
                    {unopposed ? (
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={affirmed ? "success" : "warning"}>
                          {affirmed ? "Affirmed" : "Not affirmed"}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {totalVotes} of {participants} affirm (
                          {participants > 0 ? Math.round((totalVotes / participants) * 100) : 0}%)
                        </span>
                      </div>
                    ) : (
                      <Badge variant="neutral">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</Badge>
                    )}
                  </div>

                  {results.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">No candidates for this position.</p>
                  ) : (
                    <div className="space-y-3">
                      {results.map((r, idx) => (
                        <div key={r.candidate.id}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              {idx === 0 && r.votes > 0 && (unopposed ? affirmed : true) && (
                                <Trophy size={16} className="text-warning-500" />
                              )}
                              <span className="text-sm font-medium text-slate-900">
                                {r.candidate.name}
                              </span>
                            </div>
                            {unopposed ? (
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-slate-600">{r.votes} affirm</span>
                                <span className="text-slate-400">
                                  {participants - r.votes} abstain
                                </span>
                                <span className="font-semibold text-slate-900 w-12 text-right">
                                  {participants > 0
                                    ? Math.round((r.votes / participants) * 100)
                                    : 0}
                                  %
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-slate-600">{r.votes} vote{r.votes !== 1 ? "s" : ""}</span>
                                <span className="font-semibold text-slate-900 w-12 text-right">
                                  {r.percentage}%
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="h-3 rounded-sm bg-slate-100 overflow-hidden mt-1">
                            <div
                              className={`h-full transition-all duration-500 ${
                                idx === 0 && r.votes > 0 && (unopposed ? affirmed : true)
                                  ? "bg-success-600"
                                  : "bg-primary-900"
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  unopposed && participants > 0
                                    ? (r.votes / participants) * 100
                                    : r.percentage
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      {unopposed && !affirmed && (
                        <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-sm px-3 py-2">
                          This candidate did not secure a majority vote of confidence — the
                          nomination is <strong>not affirmed</strong>.
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      </div>
    </div>
    </>
  );
}
