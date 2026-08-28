import type { Election, Position, Candidate } from "../services";
import "../electoralReturn.css";

interface PositionResultProp {
  position: Position;
  results: { candidate: Candidate; votes: number; percentage: number }[];
  totalVotes: number;
  unopposed: boolean;
  affirmed: boolean;
}

interface ElectoralReturnDocumentProps {
  election: Election;
  positionResults: PositionResultProp[];
  rosterCount: number;
  votersVoted: number;
  turnoutPercentage: number;
  onClose: () => void;
  onPrint: () => void;
  onDownload: () => void;
}

/** Format a Date as DD/MM/YYYY • HH:MM:SS */
function fmtStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} \u2022 ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const YEAR_LABEL = "2026 SUES Elections";
const FOOTER_ORG = "SUES Electoral Commission \u2014 Soroti University Engineering Society";

export default function ElectoralReturnDocument({
  election,
  positionResults,
  rosterCount,
  votersVoted,
  turnoutPercentage,
  onClose,
  onPrint,
  onDownload,
}: ElectoralReturnDocumentProps) {
  const nowStamp = fmtStamp(new Date());
  const electionLabel = (election.title || "2026 SUES Elections").toUpperCase();

  // Page 1 = first 3 positions; page 2 = the rest.
  const page1Pos = positionResults.slice(0, 3);
  const page2Pos = positionResults.slice(3);

  const affirmDetail = () =>
    `Majority vote of confidence, >50% of participants.`;

  const affirmStat = (pr: PositionResultProp) => {
    const confirm = pr.results[0]?.votes ?? 0;
    return `${confirm} AFFIRM`;
  };

  const affirmPct = (pr: PositionResultProp) => {
    if (pr.totalVotes > 0) return `${pr.results[0] ? Math.round((pr.results[0].votes / pr.totalVotes) * 100) : 0}%`;
    return "0%";
  };

  const renderUnopposed = (pr: PositionResultProp) => (
    <div className="er-pos" key={pr.position.id}>
      <div className="er-pos__head">
        <div className="er-pos__title">{pr.position.title}</div>
        <div className="er-pos__badge">UNOPPOSED</div>
      </div>
      <div className="er-pos__row er-pos__row--band">
        <div className="er-pos__cand">
          {pr.results[0] ? pr.results[0].candidate.name : "\u2014"}
        </div>
        <div className="er-pos__stat">
          <b>{affirmStat(pr)}</b> {affirmPct(pr)}
        </div>
      </div>
      <div className="er-pos__affirm">
        <div className="er-pos__affirm-label">
          {pr.affirmed ? "AFFIRMED" : "NOT AFFIRMED"}
        </div>
        <div className="er-pos__affirm-detail">
          {pr.results[0]?.votes ?? 0} of {rosterCount || votersVoted} participants ({affirmPct(pr)}) —{" "}
          {affirmDetail()}
        </div>
      </div>
    </div>
  );

  const renderContested = (pr: PositionResultProp) => (
    <div className="er-pos" key={pr.position.id}>
      <div className="er-pos__head">
        <div className="er-pos__title">{pr.position.title}</div>
      </div>
      <div className="er-pos__row" style={{ padding: 0 }}>
        <table className="er-table">
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
                <td>{r.votes} vote(s)</td>
                <td>{r.percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="er-total">
        <div className="er-total__label">POSITION TOTAL</div>
        <div className="er-total__value">{pr.totalVotes} vote(s)</div>
        {pr.results[0] && (
          <div className="er-total__elected">
            ELECTED: {pr.results[0].candidate.name}
          </div>
        )}
      </div>
    </div>
  );

  const renderPos = (pr: PositionResultProp) =>
    pr.unopposed ? renderUnopposed(pr) : renderContested(pr);

  const header = (
    <div className="er-header">
      <div className="er-header__gold" />
      <img className="er-header__logo" src="/sues-logo.jpg" alt="SUES logo" />
      <div className="er-header__text">
        <span className="er-header__org">Soroti University</span>
        <span className="er-header__society">Engineering Society</span>
        <span className="er-header__ec">Electoral Commission</span>
      </div>
      <div className="er-header__badge">Official Electoral Return</div>
    </div>
  );

  const footer = (page: number) => (
    <div className="er-footer">
      <div className="er-footer__gold" />
      <div className="er-footer__row">
        <span className="er-footer__org">{FOOTER_ORG}</span>
        <span>{nowStamp}</span>
      </div>
      <div className="er-footer__row">
        <span>Official Electoral Return</span>
        <span className="er-footer__page">{YEAR_LABEL} — Page {page}</span>
      </div>
    </div>
  );

  return (
    <>
      {/* ======== TOOLBAR (screen only) ======== */}
      <div className="er-doc-wrapper">
        <div className="er-toolbar">
          <div>
            <div className="er-toolbar__title">Official Electoral Return</div>
            <div className="er-toolbar__sub">
              Print-ready A4 document — Printing hides all site navigation.
            </div>
          </div>
          <div className="er-toolbar__actions">
            <button className="er-toolbar__btn" onClick={onClose}>
              Back to Results
            </button>
            <button className="er-toolbar__btn" onClick={onDownload}>
              Download PDF
            </button>
            <button className="er-toolbar__btn er-toolbar__btn--primary" onClick={onPrint}>
              Print / Save as PDF
            </button>
          </div>
        </div>

        {/* ======== PAGE 1 ======== */}
        <div className="er-sheet">
          {header}
          <div className="er-title">
            <div className="er-title__main">Official Election Results</div>
            <div className="er-title__sub">{electionLabel}</div>
          </div>

          <div className="er-meta">
            <div className="er-meta__grid">
              <div className="er-meta__cell">
                <span className="er-meta__label">Election</span>
                <span className="er-meta__value">{electionLabel}</span>
              </div>
              <div className="er-meta__cell">
                <span className="er-meta__label">Generated</span>
                <span className="er-meta__value">{nowStamp}</span>
              </div>
              <div className="er-meta__cell">
                <span className="er-meta__label">Status</span>
                <span className="er-meta__value">{election.status?.toUpperCase() || "Published"}</span>
              </div>
              <div className="er-meta__cell">
                <span className="er-meta__label">Issuing Authority</span>
                <span className="er-meta__value">SUES Electoral Commission</span>
              </div>
            </div>
          </div>

          <div className="er-bar" style={{ marginTop: "6mm" }}>
            Official Results
          </div>

          <div style={{ marginTop: "5mm" }}>
            {page1Pos.length ? (
              page1Pos.map(renderPos)
            ) : (
              <p style={{ fontSize: "10pt" }}>No results yet.</p>
            )}
          </div>

          {footer(1)}
        </div>

        {/* ======== PAGE 2 ======== */}
        <div className="er-sheet">
          {header}
          <div className="er-title">
            <div className="er-title__main">Official Election Results</div>
            <div className="er-title__sub">{electionLabel} — Continued</div>
          </div>

          {page2Pos.length > 0 && (
            <>
              <div className="er-bar">Official Results</div>
              <div style={{ marginTop: "5mm" }}>
                {page2Pos.map(renderPos)}
              </div>
            </>
          )}

          <div className="er-sec" style={{ marginTop: "7mm" }}>
            <div className="er-bar er-bar--navy">Turnout &amp; Election Integrity</div>
            <div className="er-summary" style={{ marginTop: "0mm" }}>
              <table>
                <tbody>
                  <tr>
                    <th>Eligible Voters</th>
                    <td>{rosterCount}</td>
                  </tr>
                  <tr>
                    <th>Voters Who Voted</th>
                    <td>{votersVoted}</td>
                  </tr>
                  <tr>
                    <th>Turnout</th>
                    <td className="er-summary__big">{turnoutPercentage}%</td>
                  </tr>
                  <tr>
                    <th>Ballot Record</th>
                    <td>Anonymous</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="er-sec" style={{ marginTop: "5mm" }}>
            <div className="er-notice">
              <div className="er-notice__head">Election Integrity Notice</div>
              <p>
                Votes are recorded anonymously — no ballot can be traced back to a voter.
              </p>
            </div>
          </div>

          <div className="er-sec" style={{ marginTop: "7mm" }}>
            <div className="er-bar er-bar--navy">Official Record</div>
            <div className="er-record er-summary" style={{ marginTop: 0 }}>
              <p style={{ padding: "4mm 5mm" }}>
                This document presents the published {electionLabel} results as recorded by the
                electoral system. It is issued by the{" "}
                <strong>SUES Electoral Commission</strong> and certifies the official outcome of
                the elections by position, together with the turnout and election-integrity
                information shown above.
              </p>
            </div>
          </div>

          {footer(2)}
        </div>
      </div>
    </>
  );
}
