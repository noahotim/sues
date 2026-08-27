import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { BarChart3, Trophy, FileDown, ArrowLeft } from "lucide-react";
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

  const votersVoted = roster.filter((r) => r.hasVoted).length;
  const turnoutPercentage =
    roster.length > 0 ? Math.round((votersVoted / roster.length) * 100) : 0;

  const positionResults: PositionResult[] = positions
    .map((pos) => {
      const posCandidates = candidates.filter((c) => c.positionId === pos.id);
      const posVotes = posCandidates.reduce(
        (sum, c) => sum + (voteCounts[c.id] ?? 0),
        0
      );
      const unopposed = posCandidates.length === 1;
      const single = posCandidates[0];
      const singlePct = unopposed && single && posVotes > 0
        ? ((voteCounts[single.id] ?? 0) / posVotes) * 100
        : 0;
      const affirmed = unopposed && singlePct >= 51;
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

  /** SUES-branded Declaration of Results PDF (Uganda EC format). */
  async function downloadDeclarationForm() {
    if (!selectedElection) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 18;
    let y = M;

    // Attempt to load the SUES logo for the PDF header.
    let logoDataUrl: string | null = null;
    try {
      const blob = await fetch("/sues-logo.jpg").then((r) => r.blob());
      logoDataUrl = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = () => res(String(reader.result));
        reader.readAsDataURL(blob);
      });
    } catch { /* logo unavailable — text-only header */ }

    // ── Header band ────────────────────────────────────────────────────
    // Dark navy band across the full width of the page.
    doc.setFillColor(15, 23, 42);          // primary-950
    doc.rect(0, 0, W, 42, "F");

    // Accent stripe at the very top.
    doc.setFillColor(234, 179, 8);         // accent gold
    doc.rect(0, 0, W, 3, "F");

    // Logo inside the navy band.
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "JPEG", M, 8, 22, 22);
    }

    // Organisation name + subtitle inside the navy band.
    const textX = logoDataUrl ? M + 28 : M;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("SOROTI UNIVERSITY", textX, 17);
    doc.setFontSize(14);
    doc.text("ENGINEERING SOCIETY", textX, 25);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);      // slate-300
    doc.text("Soroti University  |  Electoral Commission", textX, 33);

    // Document title centred below the navy band.
    y = 50;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("DECLARATION OF RESULTS", W / 2, y, { align: "center" });
    y += 6;
    doc.setDrawColor(234, 179, 8);         // gold rule
    doc.setLineWidth(0.8);
    doc.line(M, y, W - M, y);
    y += 10;

    // ── Election details ───────────────────────────────────────────────
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);          // slate-700

    const detail = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.text(label + ":", M, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, M + 38, y);
      y += 6;
    };

    detail("Election", selectedElection.title);
    if (selectedElection.startTime)
      detail("Poll opened", new Date(selectedElection.startTime).toLocaleString());
    if (selectedElection.endTime)
      detail("Poll closed", new Date(selectedElection.endTime).toLocaleString());
    detail("Date declared", new Date().toLocaleString());
    y += 4;

    // ── Candidates declared elected ────────────────────────────────────
    const winners = positionResults
      .filter((pr) => pr.results.length > 0 && (pr.unopposed ? pr.affirmed : pr.results[0].votes > 0))
      .map((pr) => {
        const w = pr.results[0];
        return `${pr.position.title}: ${w.candidate.name}  (${w.votes} vote${w.votes !== 1 ? "s" : ""}${pr.unopposed ? "  \u2014 affirmed" : ""})`;
      });

    // Green header bar.
    doc.setFillColor(22, 163, 74);         // success-600
    doc.rect(M, y, W - M * 2, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("CANDIDATES DECLARED ELECTED", M + 4, y + 5.5);
    y += 10;

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (winners.length) {
      winners.forEach((w) => { doc.text(w, M + 4, y); y += 6; });
    } else {
      doc.text("No position has met the required threshold yet.", M + 4, y);
      y += 6;
    }
    y += 6;

    // ── Per-position tables ────────────────────────────────────────────
    for (const pr of positionResults) {
      if (y > H - 80) { doc.addPage(); y = M; }

      // Position title with navy left accent.
      doc.setFillColor(15, 23, 42);
      doc.rect(M, y, 3, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(pr.position.title.toUpperCase(), M + 7, y + 5.5);
      y += 10;

      // Table header row.
      doc.setFillColor(241, 245, 249);     // slate-100
      doc.rect(M, y, W - M * 2, 7, "F");
      doc.setDrawColor(203, 213, 225);     // slate-300
      doc.setLineWidth(0.3);
      doc.line(M, y + 7, M + W - M * 2, y + 7);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);     // slate-500
      doc.text("CANDIDATE", M + 3, y + 5);
      doc.text("VOTES", M + 95, y + 5, { align: "left" });
      doc.text("%", W - M - 3, y + 5, { align: "right" });
      y += 7;

      // Data rows.
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      for (let i = 0; i < pr.results.length; i++) {
        const r = pr.results[i];
        if (i % 2 === 0) {
          doc.setFillColor(248, 250, 252); // slate-50
          doc.rect(M, y, W - M * 2, 7, "F");
        }
        const isWinner = i === 0 && r.votes > 0 && (pr.unopposed ? pr.affirmed : true);
        if (isWinner) {
          doc.setFont("helvetica", "bold");
        }
        doc.setTextColor(15, 23, 42);
        doc.text(r.candidate.name, M + 3, y + 5);
        doc.text(String(r.votes), M + 95, y + 5, { align: "left" });
        doc.text(`${r.percentage}%`, W - M - 3, y + 5, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setDrawColor(226, 232, 240);   // slate-200
        doc.line(M, y + 7, M + W - M * 2, y + 7);
        y += 7;
      }

      // Winner declaration line.
      const wText = pr.unopposed
        ? pr.affirmed
          ? "AFFIRMED (unopposed, 51%+ of votes cast)"
          : "NOT AFFIRMED (unopposed, below 51% threshold)"
        : pr.results[0] && pr.results[0].votes > 0
          ? `${pr.results[0].candidate.name}  \u2014 DECLARED ELECTED`
          : "No winner";

      doc.setFillColor(254, 252, 232);      // yellow-50
      doc.rect(M, y, W - M * 2, 9, "F");
      doc.setDrawColor(234, 179, 8);        // gold border
      doc.setLineWidth(0.4);
      doc.rect(M, y, W - M * 2, 9, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(146, 64, 14);        // amber-800
      doc.text("Declared:  " + wText, M + 3, y + 6);
      doc.setFont("helvetica", "normal");
      y += 14;
    }

    // ── Summary of returns ─────────────────────────────────────────────
    if (y > H - 80) { doc.addPage(); y = M; }
    const totalVotes = Object.values(voteCounts).reduce((s, v) => s + v, 0);

    doc.setFillColor(15, 23, 42);
    doc.rect(M, y, W - M * 2, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("SUMMARY OF RETURNS", M + 4, y + 5.5);
    y += 10;

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const row = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.text(label + ":", M + 4, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, M + 60, y);
      y += 6;
    };
    row("Total valid votes cast", String(totalVotes));
    row("Registered voters", String(roster.length));
    row("Voters who participated", String(votersVoted));
    row("Turnout", `${turnoutPercentage}%`);
    row("Invalid / rejected ballots", "N/A (system records valid votes only)");
    y += 6;

    // ── Certification + signatures ─────────────────────────────────────
    if (y > H - 80) { doc.addPage(); y = M; }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text(
      "I, the Returning Officer, hereby certify that the results shown above are a true and",
      M, y
    );
    doc.text(
      "accurate record of the votes cast and counted, and I declare them accordingly.",
      M, y + 6
    );
    y += 16;

    const sigW = (W - M * 2 - 16) / 2;
    const sigLine = (x: number, label: string) => {
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.4);
      doc.line(x, y + 24, x + sigW, y + 24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(label, x, y + 30);
    };

    sigLine(M, "Returning Officer");
    sigLine(M + sigW + 16, "Candidate / Representative");
    y += 38;
    sigLine(M, "Observer 1");
    sigLine(M + sigW + 16, "Observer 2");
    y += 40;

    // Footer.
    doc.setDrawColor(234, 179, 8);
    doc.setLineWidth(0.5);
    doc.line(M, y, W - M, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "Generated by SUES Electoral Commission  |  Soroti University Engineering Society  |  " +
        new Date().toLocaleString(),
      M, y
    );

    doc.save(`SUES-Declaration-${selectedElection.title.replace(/[^a-z0-9]+/gi, "-")}.pdf`);
  }

  async function downloadPdf() {
    if (!selectedElection) return;
    // Load the PDF library on demand so it never slows the initial page load.
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const margin = 18;
    const width = doc.internal.pageSize.getWidth();
    let y = margin;

    // Logo
    try {
      const img = await fetch("/sues-logo.jpg").then((r) => r.blob());
      const dataUrl: string = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = () => res(String(reader.result));
        reader.readAsDataURL(img);
      });
      doc.addImage(dataUrl, "JPEG", margin, y - 2, 16, 16);
      doc.text("SUES", margin + 22, y + 4);
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text("Soroti University Engineering Society", margin + 22, y + 10);
      doc.setTextColor(0);
    } catch {
      doc.text("SUES Elections", margin, y + 6);
    }
    doc.setFontSize(18);
    doc.text("Official Election Results", margin, y + 26);
    y += 34;

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
        const pct = totalVotes > 0 ? Math.round((r.votes / totalVotes) * 100) : 0;
        doc.setFontSize(10);
        doc.text(`${r.candidate.name}`, margin, y);
        doc.text(`${r.votes} vote(s) - ${pct}%`, width - margin, y, { align: "right" });
        // bar
        const barMax = width - margin * 2;
        const barLen = Math.max(0, Math.min(barMax, (barMax * r.votes) / (totalVotes || 1)));
        doc.setFillColor(15, 23, 42);
        doc.rect(margin, y + 2.5, barLen, 2, "F");
        doc.setFillColor(22, 163, 74);
        doc.rect(margin + barLen, y + 2.5, Math.max(0, barMax - barLen), 2, "F");
        y += 9;
      }
      doc.text(`Position total: ${totalVotes} vote(s)`, margin, y + 2);
      y += 6;
      if (unopposed) {
        doc.setFontSize(9);
        doc.setTextColor(180, 83, 9);
        doc.text(
          affirmed
            ? `Unopposed candidate AFFIRMED (>= 51% of votes cast).`
            : `Unopposed candidate NOT affirmed (below the 51% threshold).`,
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
                : "Results are calculated from actual cast votes and update in real time."}
            </p>
          </div>
        </div>
        {selectedElection && positionResults.length > 0 && (
          <div className="flex flex-col items-end gap-2 mt-4 sm:mt-0">
            {isElectionOver && (
              <Button onClick={downloadDeclarationForm} className="!bg-success-600 hover:!bg-success-700">
                <FileDown size={18} />
                Declaration of Results
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
                          Unopposed nomination — requires <strong>at least 51%</strong> of votes cast
                          to be affirmed.
                        </p>
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
                              {idx === 0 && r.votes > 0 && (unopposed ? affirmed : true) && (
                                <Trophy size={16} className="text-warning-500" />
                              )}
                              <span className="text-sm font-medium text-slate-900">
                                {r.candidate.name}
                              </span>
                              {unopposed && idx === 0 && affirmed && (
                                <Badge variant="success">Affirmed</Badge>
                              )}
                              {unopposed && idx === 0 && !affirmed && (
                                <Badge variant="warning">Not affirmed</Badge>
                              )}
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
                                idx === 0 && r.votes > 0 && (unopposed ? affirmed : true)
                                  ? "bg-success-600"
                                  : "bg-primary-900"
                              }`}
                              style={{ width: `${Math.min(100, r.percentage)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {unopposed && !affirmed && (
                        <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-sm px-3 py-2">
                          This candidate received below the 51% threshold — the nomination is
                          <strong> not affirmed</strong>.
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
  );
}
