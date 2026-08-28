import type { Election, Position, Candidate } from "../services";
import "../declaration.css";

interface PositionResultProp {
  position: Position;
  results: { candidate: Candidate; votes: number; percentage: number }[];
  totalVotes: number;
  unopposed: boolean;
  affirmed: boolean;
}

interface DeclarationDocumentProps {
  election: Election;
  positionResults: PositionResultProp[];
  rosterCount: number;
  participants: number;
  votersVoted: number;
  turnoutPercentage: number;
  totalVotes: number;
  onClose: () => void;
  onPrint: () => void;
  onDownload: () => void;
}

/** Format a Date/Timestamp as DD/MM/YYYY HH:MM:SS */
function fmtStamp(t: unknown): string {
  if (!t) return "";
  let d: Date;
  if (typeof t === "object" && t && typeof (t as any).toDate === "function") {
    d = (t as any).toDate();
  } else {
    d = new Date(t as any);
  }
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} \u2022 ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
}

const OFFICIAL = "OFFICIAL DECLARATION";

export default function DeclarationDocument({
  election,
  positionResults,
  rosterCount,
  participants,
  votersVoted,
  turnoutPercentage,
  totalVotes,
  onClose,
  onPrint,
  onDownload,
}: DeclarationDocumentProps) {
  const nowStamp = fmtStamp(new Date());
  const ecoLabel = `${election.title || "OFFICIAL DECLARATION OF RESULTS"}`;
  const yearLabel = election.title
    ? election.title
    : "OFFICIAL DECLARATION OF RESULTS";

  // Unit list for "CANDIDATES DECLARED ELECTED" table.
  const winners = positionResults
    .filter((pr) => pr.results.length > 0)
    .map((pr) => {
      const w = pr.results[0];
      let declaration: string;
      if (pr.unopposed) {
        declaration = pr.affirmed ? "AFFIRMED" : "NOT AFFIRMED";
      } else if (w && w.votes > 0) {
        declaration = "DECLARED ELECTED";
      } else {
        declaration = "NO WINNER";
      }
      return {
        position: pr.position,
        candidate: w ? w.candidate : null,
        votes: w ? w.votes : 0,
        declaration,
      };
    });

  // Sheet split (matches the official 4-page layout):
  //   Sheet 1: title + info + declaration + declared table + first position
  //   Sheet 2: positions 2-3
  //   Sheet 3: remaining positions + summary + certification
  //   Sheet 4: signatures + official record
  const sheet1Pos = positionResults.slice(0, 1);
  const sheet2Pos = positionResults.slice(1, 3);
  const sheet3Pos = positionResults.slice(3);

  const posDecl = (pr: PositionResultProp) => {
    if (pr.unopposed) {
      return pr.affirmed
        ? "\u2713 DECLARED: AFFIRMED \u2014 UNOPPOSED, 51%+ OF VOTES CAST"
        : "\u2713 DECLARED: NOT AFFIRMED \u2014 UNOPPOSED, BELOW 51% THRESHOLD";
    }
    return pr.results[0] && pr.results[0].votes > 0
      ? `\u2713 DECLARED: ${pr.results[0].candidate.name.toUpperCase()} \u2014 DECLARED ELECTED`
      : "NO WINNER";
  };

  const posDeclClass = (pr: PositionResultProp) => {
    if (pr.unopposed) return pr.affirmed ? "decl-pos__decl" : "decl-pos__decl decl-pos__decl--fail";
    return "decl-pos__decl decl-pos__decl--plain";
  };

  const posPct = (pr: PositionResultProp, votes: number) => {
    if (pr.unopposed && participants > 0) return Math.round((votes / participants) * 100);
    if (pr.totalVotes > 0) return Math.round((votes / pr.totalVotes) * 100);
    return 0;
  };

  const renderPosition = (pr: PositionResultProp) => (
    <div className="decl-pos" key={pr.position.id}>
      <div className="decl-pos__title">{pr.position.title}</div>
      <div className="decl-pos__body">
        {pr.results.length === 0 ? (
          <p style={{ fontSize: "10pt", color: "#64748b", margin: 0 }}>
            No candidates for this position.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>CANDIDATE</th>
                <th>VOTES</th>
                <th>PERCENTAGE</th>
              </tr>
            </thead>
            <tbody>
              {pr.results.map((r) => (
                <tr key={r.candidate.id}>
                  <td>{r.candidate.name}</td>
                  <td>{r.votes}</td>
                  <td>{posPct(pr, r.votes)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className={posDeclClass(pr)}>{posDecl(pr)}</div>
      </div>
    </div>
  );

  const signatures = [
    "RETURNING OFFICER",
    "CANDIDATE / REPRESENTATIVE",
    "OBSERVER 1",
    "OBSERVER 2",
  ];

  const header = (
    <div className="decl-header">
      <div className="decl-header__gold" />
      <img className="decl-header__logo" src="/sues-logo.jpg" alt="SUES logo" />
      <div className="decl-header__text">
        <span className="decl-header__org">Soroti University</span>
        <span className="decl-header__society">Engineering Society</span>
        <span className="decl-header__ec">Electoral Commission</span>
      </div>
    </div>
  );

  const titleBlock = (continued?: boolean) => (
    <div className="decl-title">
      <div className="decl-title__main">Official Declaration of Results</div>
      <div className="decl-title__sub">
        {yearLabel}
        {continued ? " \u2014 Continued" : ""}
      </div>
    </div>
  );

  const footer = (page: number) => (
    <div className="decl-footer">
      <div className="decl-footer__gold" />
      <div className="decl-footer__row">
        <span className="decl-footer__org">
          SUES Electoral Commission \u2014 Soroti University Engineering Society
        </span>
        <span>{nowStamp}</span>
      </div>
      <div className="decl-footer__row">
        <span>Official Declaration of Results</span>
        <span className="decl-footer__page">Page {page}</span>
      </div>
    </div>
  );

  const summaryBlock = (
    <div className="decl-section">
      <div className="decl-section__head">Summary of Returns</div>
      <div className="decl-summary">
        <div className="decl-summary__bar">Summary of Returns</div>
        <table>
          <tbody>
            <tr>
              <th>Total Valid Votes Cast</th>
              <td>{totalVotes}</td>
            </tr>
            <tr>
              <th>Registered Voters</th>
              <td>{rosterCount}</td>
            </tr>
            <tr>
              <th>Voters Who Participated</th>
              <td>{votersVoted}</td>
            </tr>
            <tr>
              <th>Turnout</th>
              <td>{turnoutPercentage}%</td>
            </tr>
            <tr>
              <th>Invalid / Rejected Ballots</th>
              <td>N/A (system records valid votes only)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const certificationBlock = (
    <div className="decl-section">
      <div className="decl-section__head">Certification</div>
      <div className="decl-cert">
        <p style={{ margin: 0 }}>
          I, the <strong>Returning Officer</strong>, hereby certify that the results shown in this
          document are a true and accurate record of the votes cast and counted, and I declare
          them accordingly.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* ============ TOOLBAR (screen only) ============ */}
      <div className="decl-doc-wrapper">
        <div className="decl-toolbar">
          <div>
            <div className="decl-toolbar__title">Official Declaration of Results</div>
            <div className="decl-toolbar__sub">
              Print-ready A4 document — Printing hides all site navigation.
            </div>
          </div>
          <div className="decl-toolbar__actions">
            <button className="decl-toolbar__btn" onClick={onClose}>
              Back to Results
            </button>
            <button className="decl-toolbar__btn" onClick={onDownload}>
              Download PDF
            </button>
            <button className="decl-toolbar__btn decl-toolbar__btn--primary" onClick={onPrint}>
              Print / Save as PDF
            </button>
          </div>
        </div>

        {/* ============ SHEET 1 ============ */}
        <div className="decl-sheet">
          {header}
          {titleBlock()}

          <div className="decl-section">
            <div className="decl-section__head">Election Information</div>
            <div className="decl-info">
              <div className="decl-info__cell">
                <span className="decl-info__label">Election</span>
                <span className="decl-info__value">{ecoLabel}</span>
              </div>
              <div className="decl-info__cell">
                <span className="decl-info__label">Date &amp; Time Declared</span>
                <span className="decl-info__value">{nowStamp}</span>
              </div>
              <div className="decl-info__cell">
                <span className="decl-info__label">Issuing Authority</span>
                <span className="decl-info__value">SUES Electoral Commission</span>
              </div>
              <div className="decl-info__cell">
                <span className="decl-info__label">Document Status</span>
                <span className="decl-info__value">{OFFICIAL}</span>
              </div>
            </div>
          </div>

          <div className="decl-section">
            <div className="decl-section__head">Declaration</div>
            <div className="decl-statement">
              <p>
                The <strong>SUES Electoral Commission</strong> hereby publishes and declares the
                results counted by the electoral system. The candidates listed below are declared
                elected in accordance with the society&rsquo;s electoral regulations.
              </p>
            </div>
          </div>

          <div className="decl-section">
            <div className="decl-section__head">Candidates Declared Elected</div>
            <div className="decl-elected">
              <div className="decl-elected__bar">Candidates Declared Elected</div>
              <table>
                <thead>
                  <tr>
                    <th>Office</th>
                    <th>Candidate</th>
                    <th>Votes</th>
                    <th>Declaration</th>
                  </tr>
                </thead>
                <tbody>
                  {winners.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center" }}>
                        No positions have met the threshold yet.
                      </td>
                    </tr>
                  ) : (
                    winners.map((w) => (
                      <tr key={w.position.id}>
                        <td>{w.position.title}</td>
                        <td>{w.candidate ? w.candidate.name : "\u2014"}</td>
                        <td>{w.votes}</td>
                        <td className="decl-elected__decl">{w.declaration}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {sheet1Pos.length > 0 && (
            <div className="decl-section">
              <div className="decl-section__head">Detailed Results</div>
              {sheet1Pos.map(renderPosition)}
            </div>
          )}

          {footer(1)}
        </div>

        {/* ============ SHEET 2 ============ */}
        {sheet2Pos.length > 0 && (
          <div className="decl-sheet">
            {header}
            {titleBlock(true)}

            <div className="decl-section">
              <div className="decl-section__head">Detailed Results</div>
              {sheet2Pos.map(renderPosition)}
            </div>

            {footer(2)}
          </div>
        )}

        {/* ============ SHEET 3 ============ */}
        <div className="decl-sheet">
          {header}
          {titleBlock(true)}

          {sheet3Pos.length > 0 && (
            <div className="decl-section">
              <div className="decl-section__head">Detailed Results</div>
              {sheet3Pos.map(renderPosition)}
            </div>
          )}

          {summaryBlock}

          {footer(3)}
        </div>

        {/* ============ SHEET 4 ============ */}
        <div className="decl-sheet">
          {header}
          {titleBlock(true)}

          <div className="decl-signatures">
            {signatures.map((label) => (
              <div className="decl-sig" key={label}>
                <div className="decl-sig__line" />
                <div className="decl-sig__label">{label}</div>
              </div>
            ))}
          </div>

          {certificationBlock}

          <div className="decl-section">
            <div className="decl-section__head">Official Record</div>
            <div className="decl-cert" style={{ fontStyle: "normal" }}>
              <p style={{ margin: 0 }}>
                Generated by the <strong>SUES Electoral Commission</strong> — Soroti University
                Engineering Society. This document presents the published declaration of results as
                recorded by the electoral system.
              </p>
            </div>
          </div>

          {footer(4)}
        </div>
      </div>
    </>
  );
}
