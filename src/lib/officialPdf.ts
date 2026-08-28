import { jsPDF } from "jspdf";

export interface PositionResultPdf {
  position: { id: string; title: string };
  results: { candidate: { id: string; name: string }; votes: number; percentage: number }[];
  totalVotes: number;
  unopposed: boolean;
  affirmed: boolean;
}

export interface DeclarationPdfOptions {
  election: { title: string; status?: string };
  positionResults: PositionResultPdf[];
  rosterCount: number;
  participants: number;
  votersVoted: number;
  turnoutPercentage: number;
  totalVotes: number;
}

export interface ElectoralReturnPdfOptions {
  election: { title: string; status?: string };
  positionResults: PositionResultPdf[];
  rosterCount: number;
  votersVoted: number;
  turnoutPercentage: number;
}

// Palette (RGB)
const C = {
  navy: [8, 17, 31] as const,
  navy2: [21, 35, 56] as const,
  gold: [200, 155, 44] as const,
  green: [8, 116, 67] as const,
  greenLight: [236, 253, 242] as const,
  greenBorder: [171, 239, 198] as const,
  slateLight: [248, 250, 252] as const,
  line: [214, 220, 229] as const,
  slate: [51, 65, 85] as const,
  muted: [100, 116, 139] as const,
  page: [252, 252, 251] as const,
  cream: [251, 247, 234] as const,
  white: [255, 255, 255] as const,
  ink: [15, 23, 42] as const,
};

const W = 595.28;
const H = 841.89;
const MARGIN = 40; // left/right margin in pt (~14mm)
const CONTENT = W - MARGIN * 2;

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} \u2022 ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function hex(color: readonly number[]): [number, number, number] {
  return [color[0], color[1], color[2]];
}

function drawHeader(doc: jsPDF, badge: string) {
  // top gold strip
  doc.setFillColor(...hex(C.gold));
  doc.rect(0, 0, W, 3.5, "F");
  // navy band
  doc.setFillColor(...hex(C.navy));
  doc.rect(0, 3.5, W, 38, "F");
  // gold bottom line
  doc.setFillColor(...hex(C.gold));
  doc.rect(0, 41.5, W, 0.7, "F");
  // badge
  doc.setFillColor(...hex(C.gold));
  const bw = doc.getTextWidth(badge) + 14;
  doc.roundedRect(W - MARGIN - bw, 15, bw, 11, 1.5, 1.5, "F");
  doc.setTextColor(...hex(C.navy2));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(badge, W - MARGIN - bw + 7, 23, { align: "center" });
  // org lines
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text("SOROTI UNIVERSITY", MARGIN + 2, 16);
  doc.setFontSize(10.5);
  doc.text("ENGINEERING SOCIETY", MARGIN + 2, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("ELECTORAL COMMISSION", MARGIN + 2, 31);
}

function drawFooter(doc: jsPDF, page: number, label: string) {
  doc.setDrawColor(...hex(C.gold));
  doc.setLineWidth(0.8);
  doc.line(MARGIN, 805, W - MARGIN, 805);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.6);
  doc.setTextColor(...hex(C.muted));
  doc.text("SUES Electoral Commission \u2014 Soroti University Engineering Society", MARGIN, 812);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...hex(C.navy));
  doc.text(`${label} \u2014 Page ${page}`, W - MARGIN, 812, { align: "right" });
}

function boldLine(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  size = 10.5,
  color: readonly number[] = C.ink
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(...hex(color));
  doc.text(text, x, y);
}

function normalLine(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  size = 9.5,
  color: readonly number[] = C.slate
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(...hex(color));
  doc.text(text, x, y);
}

function sectionHead(doc: jsPDF, y: number, text: string) {
  boldLine(doc, MARGIN, y, text.toUpperCase(), 11.5, C.navy);
  doc.setDrawColor(...hex(C.gold));
  doc.setLineWidth(1);
  const tw = doc.getTextWidth(text.toUpperCase());
  doc.line(MARGIN + tw + 10, y - 2, W - MARGIN, y - 2);
  return y + 9;
}

/* =====================================================================
 *  DECLARATION OF RESULTS
 * =================================================================== */
export async function downloadDeclarationPdf(opts: DeclarationPdfOptions) {
  const { jsPDF: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const stamp = nowStamp();

  const startPage = () => {
    if (doc.getNumberOfPages() > 0) doc.addPage();
    doc.setFillColor(...hex(C.page));
    doc.rect(0, 0, W, H, "F");
  };
  startPage();

  // ---- header + title (page 1) ----
  drawHeader(doc, "OFFICIAL DECLARATION OF RESULTS");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...hex(C.navy));
  doc.text("OFFICIAL DECLARATION OF RESULTS", W / 2, 78, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(...hex(C.slate));
  doc.text((opts.election.title || "2026 SUES ELECTIONS").toUpperCase(), W / 2, 88, {
    align: "center",
  });
  doc.setDrawColor(...hex(C.gold));
  doc.setLineWidth(1.4);
  doc.line(MARGIN, 94, W - MARGIN, 94);

  let y = 108;

  // ---- election info box ----
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...hex(C.line));
  doc.setLineWidth(0.6);
  doc.roundedRect(MARGIN, y, CONTENT, 34, 4, 4, "FD");
  // 2x2 grid
  const cellW = CONTENT / 2;
  doc.line(MARGIN + cellW, y, MARGIN + cellW, y + 34);
  doc.line(MARGIN, y + 17, W - MARGIN, y + 17);
  const cells = [
    ["Election", opts.election.title.toUpperCase() || "2026 SUES ELECTIONS"],
    ["Date & Time Declared", stamp],
    ["Issuing Authority", "SUES ELECTORAL COMMISSION"],
    ["Document Status", "OFFICIAL DECLARATION"],
  ];
  cells.forEach(([label, value], i) => {
    const cx = MARGIN + (i % 2) * cellW + 8;
    const cy = y + (i < 2 ? 0 : 17) + 11;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C.muted));
    doc.text(label.toUpperCase(), cx, cy - 6);
    doc.setFontSize(9);
    doc.setTextColor(...hex(C.navy));
    doc.text(value, cx, cy);
  });
  y += 44;

  // ---- declaration statement ----
  y = sectionHead(doc, y, "Declaration") + 1;
  doc.setDrawColor(...hex(C.navy));
  doc.setLineWidth(1);
  doc.setFillColor(...hex(C.slateLight));
  doc.roundedRect(MARGIN, y, CONTENT, 42, 4, 4, "FD");
  normalLine(
    doc,
    MARGIN + 8,
    y + 12,
    "This is to certify that the following are the results of the elections conducted by the",
    8.5,
    C.slate
  );
  normalLine(
    doc,
    MARGIN + 8,
    y + 22,
    "SUES Electoral Commission for the Soroti University Engineering Society, recorded and",
    8.5,
    C.slate
  );
  normalLine(
    doc,
    MARGIN + 8,
    y + 32,
    "counted in accordance with the electoral regulations, and hereby officially declared.",
    8.5,
    C.slate
  );
  y += 54;

  // ---- candidates declared elected ----
  const winners = opts.positionResults
    .filter((pr) => pr.results.length > 0)
    .map((pr) => {
      const w = pr.results[0];
      let decl: string;
      if (pr.unopposed) decl = pr.affirmed ? "AFFIRMED" : "NOT AFFIRMED";
      else if (w && w.votes > 0) decl = "DECLARED ELECTED";
      else decl = "NO WINNER";
      return { pos: pr.position.title, cand: w ? w.candidate.name : "", votes: w ? w.votes : 0, decl };
    });

  y = sectionHead(doc, y, "Candidates Declared Elected") + 1;
  doc.setFillColor(...hex(C.green));
  doc.roundedRect(MARGIN, y, CONTENT, 14, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("CANDIDATES DECLARED ELECTED", W / 2, y + 9.5, { align: "center" });
  y += 18;
  const cols = [200, CONTENT - 200 - 150, 55, 95]; // office, candidate, votes, declaration
  doc.setDrawColor(...hex(C.line));
  doc.setLineWidth(0.6);
  doc.setFillColor(...hex(C.slateLight));
  doc.rect(MARGIN, y, CONTENT, 14, "FD");
  const heads = ["OFFICE", "CANDIDATE", "VOTES", "DECLARATION"];
  let ox = MARGIN + 6;
  heads.forEach((hd, i) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...hex(C.muted));
    doc.text(hd, ox, y + 9.5);
    ox += cols[i];
  });
  y += 14;
  winners.forEach((wl) => {
    doc.setDrawColor(...hex(C.line));
    doc.line(MARGIN, y, W - MARGIN, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...hex(C.ink));
    doc.text(wl.pos, MARGIN + 6, y + 9);
    doc.text(wl.cand || "\u2014", MARGIN + 6 + cols[0], y + 9);
    doc.text(String(wl.votes), MARGIN + 6 + cols[0] + cols[1], y + 9);
    doc.text(wl.decl, MARGIN + 6 + cols[0] + cols[1] + cols[2], y + 9);
    y += 13;
  });
  y += 6;

  // ---- per-position detail ----
  y = sectionHead(doc, y, "Detailed Results") + 1;
  opts.positionResults.slice(0, 3).forEach((pr) => {
    if (y > 560) {
      drawFooter(doc, doc.getNumberOfPages(), "Official Declaration of Results");
      startPage();
      y = 60;
    }
    doc.setFillColor(...hex(C.navy));
    doc.roundedRect(MARGIN, y, CONTENT, 14, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(pr.position.title.toUpperCase(), MARGIN + 6, y + 9.5);
    y += 16;
    if (pr.unopposed) {
      doc.setFillColor(...hex(C.slateLight));
      doc.rect(MARGIN, y, CONTENT, 15, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...hex(C.ink));
      doc.text(pr.results[0] ? pr.results[0].candidate.name : "\u2014", MARGIN + 6, y + 10);
      doc.text(`${pr.results[0]?.votes ?? 0} AFFIRM`, W - MARGIN - 60, y + 10, { align: "center" });
      doc.text(pr.results[0] ? "100%" : "0%", W - MARGIN - 22, y + 10, { align: "center" });
      y += 18;
      doc.setFillColor(...hex(C.greenLight));
      doc.setDrawColor(...hex(C.greenBorder));
      doc.roundedRect(MARGIN, y, CONTENT, 20, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...hex(C.green));
      doc.text(pr.affirmed ? "AFFIRMED" : "NOT AFFIRMED", MARGIN + 6, y + 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...hex(C.slate));
      doc.text(
        `${pr.results[0]?.votes ?? 0} of ${opts.participants} participants \u2014 Majority vote of confidence, >50% of participants.`,
        MARGIN + 70,
        y + 13
      );
      y += 24;
    } else {
      doc.setDrawColor(...hex(C.line));
      doc.setFillColor(...hex(C.slateLight));
      doc.rect(MARGIN, y, CONTENT, 14, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...hex(C.muted));
      doc.text("CANDIDATE", MARGIN + 6, y + 9.5);
      doc.text("VOTES", W - MARGIN - 90, y + 9.5, { align: "center" });
      doc.text("PERCENTAGE", W - MARGIN - 30, y + 9.5, { align: "center" });
      y += 14;
      pr.results.forEach((r) => {
        doc.line(MARGIN, y, W - MARGIN, y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...hex(C.ink));
        doc.text(r.candidate.name, MARGIN + 6, y + 9);
        doc.text(`${r.votes} vote(s)`, W - MARGIN - 90, y + 9, { align: "center" });
        doc.text(`${r.percentage}%`, W - MARGIN - 30, y + 9, { align: "center" });
        y += 13;
      });
      y += 4;
    }
  });

  drawFooter(doc, doc.getNumberOfPages(), "Official Declaration of Results");
  startPage();
  y = 60;

  // ---- remaining positions (page 2) ----
  y = sectionHead(doc, y, "Detailed Results") + 1;
  opts.positionResults.slice(3).forEach((pr) => {
    if (y > 560) {
      drawFooter(doc, doc.getNumberOfPages(), "Official Declaration of Results");
      startPage();
      y = 60;
    }
    doc.setFillColor(...hex(C.navy));
    doc.roundedRect(MARGIN, y, CONTENT, 14, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(pr.position.title.toUpperCase(), MARGIN + 6, y + 9.5);
    y += 16;
    if (pr.unopposed) {
      doc.setFillColor(...hex(C.slateLight));
      doc.rect(MARGIN, y, CONTENT, 15, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...hex(C.ink));
      doc.text(pr.results[0] ? pr.results[0].candidate.name : "\u2014", MARGIN + 6, y + 10);
      y += 18;
      doc.setFillColor(...hex(C.greenLight));
      doc.setDrawColor(...hex(C.greenBorder));
      doc.roundedRect(MARGIN, y, CONTENT, 20, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...hex(C.green));
      doc.text(pr.affirmed ? "AFFIRMED" : "NOT AFFIRMED", MARGIN + 6, y + 13);
      y += 24;
    } else {
      doc.setDrawColor(...hex(C.line));
      doc.setFillColor(...hex(C.slateLight));
      doc.rect(MARGIN, y, CONTENT, 14, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...hex(C.muted));
      doc.text("CANDIDATE", MARGIN + 6, y + 9.5);
      doc.text("VOTES", W - MARGIN - 90, y + 9.5, { align: "center" });
      doc.text("PERCENTAGE", W - MARGIN - 30, y + 9.5, { align: "center" });
      y += 14;
      pr.results.forEach((r) => {
        doc.line(MARGIN, y, W - MARGIN, y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...hex(C.ink));
        doc.text(r.candidate.name, MARGIN + 6, y + 9);
        doc.text(`${r.votes} vote(s)`, W - MARGIN - 90, y + 9, { align: "center" });
        doc.text(`${r.percentage}%`, W - MARGIN - 30, y + 9, { align: "center" });
        y += 13;
      });
      y += 4;
    }
  });

  // ---- summary of returns ----
  y = sectionHead(doc, y, "Summary of Returns") + 1;
  const summaryRows = [
    ["Total Valid Votes Cast", String(opts.totalVotes)],
    ["Registered Voters", String(opts.rosterCount)],
    ["Voters Who Participated", String(opts.votersVoted)],
    ["Turnout", `${opts.turnoutPercentage}%`],
    ["Invalid / Rejected Ballots", "N/A (system records valid votes only)"],
  ];
  doc.setDrawColor(...hex(C.line));
  doc.setLineWidth(0.6);
  summaryRows.forEach(([label, value], i) => {
    const row = i % 2 === 0 ? C.white : C.slateLight;
    doc.setFillColor(row[0], row[1], row[2]);
    doc.rect(MARGIN, y, CONTENT, 15, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...hex(C.navy));
    doc.text(label, MARGIN + 6, y + 10);
    doc.setTextColor(...hex(C.ink));
    doc.text(value, W - MARGIN - 6, y + 10, { align: "right" });
    y += 15;
  });

  // ---- certification ----
  y += 8;
  const certY = y;
  doc.setDrawColor(...hex(C.gold));
  doc.setLineWidth(2.5);
  doc.line(MARGIN, certY, MARGIN, certY + 34);
  doc.setFillColor(...hex(C.cream));
  doc.setDrawColor(...hex(C.line));
  doc.rect(MARGIN, certY, CONTENT, 40, "FD");
  normalLine(
    doc,
    MARGIN + 12,
    certY + 14,
    "I, the Returning Officer, hereby certify that the results shown in this document are a true",
    8.5,
    C.slate
  );
  normalLine(
    doc,
    MARGIN + 12,
    certY + 24,
    "and accurate record of the votes cast and counted, and I declare them accordingly.",
    8.5,
    C.slate
  );
  y = certY + 50;

  // ---- signatures ----
  const sigs = ["RETURNING OFFICER", "CANDIDATE / REPRESENTATIVE", "OBSERVER 1", "OBSERVER 2"];
  const gap = CONTENT / 4;
  sigs.forEach((label, i) => {
    const sx = MARGIN + i * gap + gap / 2;
    doc.setDrawColor(...hex(C.navy));
    doc.setLineWidth(0.8);
    const lineLen = 60;
    doc.line(sx - lineLen / 2, y, sx + lineLen / 2, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...hex(C.navy));
    doc.text(label, sx, y + 10, { align: "center" });
  });

  drawFooter(doc, doc.getNumberOfPages(), "Official Declaration of Results");
  doc.save(`SUES-Declaration-of-Results-${opts.election.title.replace(/[^a-z0-9]+/gi, "-")}.pdf`);
}

/* =====================================================================
 *  OFFICIAL ELECTORAL RETURN
 * =================================================================== */
export async function downloadElectoralReturnPdf(opts: ElectoralReturnPdfOptions) {
  const { jsPDF: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const stamp = nowStamp();
  const electionLabel = (opts.election.title || "2026 SUES Elections").toUpperCase();

  const startPage = () => {
    if (doc.getNumberOfPages() > 0) doc.addPage();
    doc.setFillColor(...hex(C.page));
    doc.rect(0, 0, W, H, "F");
  };
  startPage();

  drawHeader(doc, "OFFICIAL ELECTORAL RETURN");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...hex(C.navy));
  doc.text("OFFICIAL ELECTION RESULTS", W / 2, 76, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(...hex(C.slate));
  doc.text(electionLabel, W / 2, 86, { align: "center" });
  doc.setDrawColor(...hex(C.gold));
  doc.setLineWidth(1.4);
  doc.line(MARGIN, 92, W - MARGIN, 92);

  let y = 106;
  // meta 2x2
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...hex(C.line));
  doc.setLineWidth(0.6);
  doc.roundedRect(MARGIN, y, CONTENT, 32, 4, 4, "FD");
  const cellW = CONTENT / 2;
  doc.line(MARGIN + cellW, y, MARGIN + cellW, y + 32);
  doc.line(MARGIN, y + 16, W - MARGIN, y + 16);
  const meta = [
    ["Election", electionLabel],
    ["Generated", stamp],
    ["Status", opts.election.status?.toUpperCase() || "Published"],
    ["Issuing Authority", "SUES ELECTORAL COMMISSION"],
  ];
  meta.forEach(([label, value], i) => {
    const mx = MARGIN + (i % 2) * cellW + 8;
    const my = y + (i < 2 ? 0 : 16) + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C.muted));
    doc.text(label.toUpperCase(), mx, my - 6);
    doc.setFontSize(8.5);
    doc.setTextColor(...hex(C.navy));
    doc.text(value, mx, my);
  });
  y += 40;

  // OFFICIAL RESULTS bar
  doc.setFillColor(...hex(C.green));
  doc.roundedRect(MARGIN, y, CONTENT, 14, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text("OFFICIAL RESULTS", MARGIN + 6, y + 9.5);
  y += 20;

  // page 1: first 3 positions
  opts.positionResults.slice(0, 3).forEach((pr) => {
    if (y > 560) {
      drawFooter(doc, doc.getNumberOfPages(), "Official Electoral Return");
      startPage();
      y = 58;
      doc.setFillColor(...hex(C.green));
      doc.roundedRect(MARGIN, y, CONTENT, 14, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(255, 255, 255);
      doc.text("OFFICIAL RESULTS", MARGIN + 6, y + 9.5);
      y += 20;
    }
    y = drawPositionReturn(doc, y, pr, opts.rosterCount);
  });

  drawFooter(doc, doc.getNumberOfPages(), "Official Electoral Return");
  startPage();
  y = 58;

  // page 2: remaining positions
  const rest = opts.positionResults.slice(3);
  if (rest.length) {
    doc.setFillColor(...hex(C.green));
    doc.roundedRect(MARGIN, y, CONTENT, 14, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text("OFFICIAL RESULTS", MARGIN + 6, y + 9.5);
    y += 20;
    rest.forEach((pr) => {
      if (y > 560) {
        drawFooter(doc, doc.getNumberOfPages(), "Official Electoral Return");
        startPage();
        y = 58;
        doc.setFillColor(...hex(C.green));
        doc.roundedRect(MARGIN, y, CONTENT, 14, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(255, 255, 255);
        doc.text("OFFICIAL RESULTS", MARGIN + 6, y + 9.5);
        y += 20;
      }
      y = drawPositionReturn(doc, y, pr, opts.rosterCount);
    });
  }

  // turnout & integrity
  y += 6;
  doc.setFillColor(...hex(C.navy2));
  doc.roundedRect(MARGIN, y, CONTENT, 14, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text("TURNOUT & ELECTION INTEGRITY", MARGIN + 6, y + 9.5);
  y += 18;
  const tRows = [
    ["Eligible Voters", String(opts.rosterCount), 9],
    ["Voters Who Voted", String(opts.votersVoted), 9],
    ["Turnout", `${opts.turnoutPercentage}%`, 13],
    ["Ballot Record", "Anonymous", 9],
  ];
  doc.setDrawColor(...hex(C.line));
  tRows.forEach(([label, value, size], i) => {
    const row = i % 2 === 0 ? C.white : C.slateLight;
    doc.setFillColor(row[0], row[1], row[2]);
    doc.rect(MARGIN, y, CONTENT, 15, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...hex(C.slate));
    doc.text(label as string, MARGIN + 6, y + 10.5);
    doc.setTextColor(...hex(C.navy));
    doc.setFontSize(size as number);
    doc.text(value as string, W - MARGIN - 6, y + 10.5, { align: "right" });
    y += 15;
  });

  // integrity notice
  y += 6;
  doc.setFillColor(...hex(C.cream));
  doc.setDrawColor(...hex(C.gold));
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, y, CONTENT, 34, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...hex([154, 107, 0]));
  doc.text("ELECTION INTEGRITY NOTICE", MARGIN + 8, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...hex(C.slate));
  doc.text("Votes are recorded anonymously \u2014 no ballot can be traced back to a voter.", MARGIN + 8, y + 22);
  y += 44;

  // official record
  doc.setFillColor(...hex(C.navy2));
  doc.roundedRect(MARGIN, y, CONTENT, 14, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text("OFFICIAL RECORD", MARGIN + 6, y + 9.5);
  y += 18;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...hex(C.line));
  doc.roundedRect(MARGIN, y, CONTENT, 42, 4, 4, "FD");
  normalLine(
    doc,
    MARGIN + 8,
    y + 14,
    "This document presents the published election results as recorded by the electoral system.",
    8.5,
    C.slate
  );
  normalLine(
    doc,
    MARGIN + 8,
    y + 26,
    "It is issued by the SUES Electoral Commission and certifies the official outcome of the",
    8.5,
    C.slate
  );
  normalLine(
    doc,
    MARGIN + 8,
    y + 38,
    "elections by position, together with turnout and election-integrity information shown above.",
    8.5,
    C.slate
  );

  drawFooter(doc, doc.getNumberOfPages(), "Official Electoral Return");
  doc.save(`SUES-Official-Electoral-Return-${opts.election.title.replace(/[^a-z0-9]+/gi, "-")}.pdf`);
}

function drawPositionReturn(doc: jsPDF, y: number, pr: PositionResultPdf, rosterCount: number): number {
  doc.setDrawColor(...hex(C.line));
  doc.setLineWidth(0.6);
  // head
  doc.setFillColor(...hex(C.green));
  doc.roundedRect(MARGIN, y, CONTENT, 13, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(pr.position.title.toUpperCase(), MARGIN + 6, y + 8.5);
  if (pr.unopposed) {
    doc.setFillColor(...hex(C.cream));
    doc.setTextColor(...hex([154, 107, 0]));
    const bw = doc.getTextWidth("UNOPPOSED") + 12;
    doc.roundedRect(W - MARGIN - bw - 4, y + 1.5, bw, 10, 1.5, 1.5, "F");
    doc.setFontSize(6.5);
    doc.text("UNOPPOSED", W - MARGIN - bw / 2 - 4, y + 8.5, { align: "center" });
  }
  y += 15;
  if (pr.unopposed) {
    doc.setFillColor(...hex(C.slateLight));
    doc.rect(MARGIN, y, CONTENT, 15, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...hex(C.ink));
    doc.text(pr.results[0] ? pr.results[0].candidate.name : "\u2014", MARGIN + 6, y + 10);
    doc.text(`${pr.results[0]?.votes ?? 0} AFFIRM`, W - MARGIN - 80, y + 10, { align: "center" });
    doc.text(pr.results[0] ? "100%" : "0%", W - MARGIN - 22, y + 10, { align: "center" });
    y += 18;
    doc.setFillColor(...hex(C.greenLight));
    doc.setDrawColor(...hex(C.greenBorder));
    doc.roundedRect(MARGIN, y, CONTENT, 19, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...hex(C.green));
    doc.text(pr.affirmed ? "AFFIRMED" : "NOT AFFIRMED", MARGIN + 6, y + 12.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...hex(C.slate));
    doc.text(
      `${pr.results[0]?.votes ?? 0} of ${rosterCount || pr.results[0]?.votes} participants (100%) \u2014 Majority vote of confidence, >50% of participants.`,
      MARGIN + 70,
      y + 12.5
    );
    y += 23;
  } else {
    doc.setFillColor(...hex(C.slateLight));
    doc.rect(MARGIN, y, CONTENT, 13, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...hex(C.muted));
    doc.text("CANDIDATE", MARGIN + 6, y + 9);
    doc.text("VOTES", W - MARGIN - 90, y + 9, { align: "center" });
    doc.text("PERCENTAGE", W - MARGIN - 30, y + 9, { align: "center" });
    y += 13;
    pr.results.forEach((r) => {
      doc.line(MARGIN, y, W - MARGIN, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...hex(C.ink));
      doc.text(r.candidate.name, MARGIN + 6, y + 9);
      doc.text(`${r.votes} vote(s)`, W - MARGIN - 90, y + 9, { align: "center" });
      doc.text(`${r.percentage}%`, W - MARGIN - 30, y + 9, { align: "center" });
      y += 13;
    });
    // total row
    doc.setFillColor(...hex(C.greenLight));
    doc.setDrawColor(...hex(C.greenBorder));
    doc.roundedRect(MARGIN, y, CONTENT, 16, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...hex(C.green));
    doc.text("POSITION TOTAL", MARGIN + 6, y + 10.5);
    doc.text(`${pr.totalVotes} vote(s)`, W - MARGIN - 180, y + 10.5, { align: "center" });
    doc.text(
      pr.results[0] ? `ELECTED: ${pr.results[0].candidate.name}` : "ELECTED: \u2014",
      W - MARGIN - 6,
      y + 10.5,
      { align: "right" }
    );
    y += 20;
  }
  return y;
}
