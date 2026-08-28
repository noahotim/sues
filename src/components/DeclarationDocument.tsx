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
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} • ${p(d.getHours())}:${p(
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
      let kind: "ok" | "fail" | "plain" = "plain";
      if (pr.unopposed) {
        declaration = pr.affirmed ? "AFFIRMED" : "NOT AFFIRMED";
        kind = pr.affirmed ? "ok" : "fail";
      } else if (w && w.votes > 0) {
        declaration = "DECLARED ELECTED";
        kind = "ok";
      } else {
        declaration = "NO WINNER";
        kind = "fail";
      }
      return {
        position: pr.position,
        candidate: w ? w.candidate : null,
        votes: w ? w.votes : 0,
        declaration,
        kind,
      };
    });

  // Page layout: page 1 gets the first 3 positions, page 2 the rest.
  const page1Pos = positionResults.slice(0, 3);
  const page2Pos = positionResults.slice(3);

  const posDecl = (pr: PositionResultProp) => {
    if (pr.unopposed) {
      return pr.affirmed
        ? "✓ DECLARED: AFFIRMED — UNOPPOSED, 51%+ OF VOTES CAST"
        : "✓ DECLARED: NOT AFFIRMED — UNOPPOSED, BELOW 51% THRESHOLD";
    }
    return pr.results[0] && pr.results[0].votes > 0
      ? `✓ DECLARED: ${pr.results[0].candidate.name.toUpperCase()} — DECLARED ELECTED`
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
            <button className="decl-toolbar__btn decl-toolbar__btn--primary" onClick={onPrint}>
              Print / Save as PDF
            </button>
          </div>
        </div>

        {/* ============ PAGE 1 ============ */}
        <div className="decl-sheet">
          {/* Header band */}
          <div className="decl-header">
            <div className="decl-header__gold" />
            <img className="decl-header__logo" src="/sues-logo.jpg" alt="SUES logo" />
            <div className="decl-header__text">
              <span className="decl-header__org">Soroti University</span>
              <span className="decl-header__society">Engineering Society</span>
              <span className="decl-header__ec">Electoral Commission</span>
            </div>
          </div>

          {/* Title */}
          <div className="decl-title">
            <div className="decl-title__main">Official Declaration of Results</div>
            <div className="decl-title__sub">{yearLabel}</div>
          </div>

          {/* Election information */}
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

          {/* Declaration statement */}
          <div className="decl-section">
            <div className="decl-section__head">Declaration</div>
            <div className="decl-statement">
              <p>
                This is to certify that the following are the results of the elections conducted by
                the <strong>SUES Electoral Commission</strong> for the{" "}
                <strong>Soroti University Engineering Society</strong>. The results herein were
                recorded and counted in accordance with the electoral regulations, and are hereby
                officially declared as the true and accurate outcome of the elections held under the
                aforementioned society&rsquo;s constitution and electoral guidelines.
              </p>
            </div>
          </div>

          {/* Candidates declared elected */}
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

          {/* Detailed results - page 1 */}
          <div className="decl-section">
            <div className="decl-section__head">Detailed Results</div>
            {page1Pos.length ? page1Pos.map(renderPosition) : <p style={{ fontSize: "10pt" }}>No results yet.</p>}
          </div>

          {/* Footer */}
          <div className="decl-footer">
            <div className="decl-footer__gold" />
            <div className="decl-footer__row">
              <span className="decl-footer__org">SUES Electoral Commission — Soroti University Engineering Society</span>
              <span>{nowStamp}</span>
            </div>
            <div className="decl-footer__row">
              <span>Official Declaration of Results</span>
              <span className="decl-footer__page">Page 1</span>
            </div>
          </div>
        </div>

        {/* ============ PAGE 2 ============ */}
        <div className="decl-sheet">
          <div className="decl-header">
            <div className="decl-header__gold" />
            <img className="decl-header__logo" src="/sues-logo.jpg" alt="SUES logo" />
            <div className="decl-header__text">
              <span className="decl-header__org">Soroti University</span>
              <span className="decl-header__society">Engineering Society</span>
              <span className="decl-header__ec">Electoral Commission</span>
            </div>
          </div>

          <div className="decl-title">
            <div className="decl-title__main">Official Declaration of Results</div>
            <div className="decl-title__sub">{yearLabel} — Continued</div>
          </div>

          {/* Detailed results - remaining positions */}
          <div className="decl-section">
            <div className="decl-section__head">Detailed Results</div>
            {page2Pos.length ? page2Pos.map(renderPosition) : <p style={{ fontSize: "10pt" }}>No further positions.</p>}
          </div>

          {/* Summary of returns */}
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

          {/* Certification */}
          <div className="decl-section">
            <div className="decl-section__head">Certification</div>
            <div className="decl-cert">
              <p style={{ margin: 0 }}>
                I, the <strong>Returning Officer</strong>, hereby certify that the results shown in
                this document are a true and accurate record of the votes cast and counted, and I
                declare them accordingly.
              </p>
            </div>
          </div>

          {/* Signatures */}
          <div className="decl-signatures">
            {signatures.map((label) => (
              <div className="decl-sig" key={label}>
                <div className="decl-sig__line" />
                <div className="decl-sig__label">{label}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="decl-footer">
            <div className="decl-footer__gold" />
            <div className="decl-footer__row">
              <span className="decl-footer__org">SUES Electoral Commission — Soroti University Engineering Society</span>
              <span>{nowStamp}</span>
            </div>
            <div className="decl-footer__row">
              <span>Official Declaration of Results</span>
              <span className="decl-footer__page">Page 2</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
