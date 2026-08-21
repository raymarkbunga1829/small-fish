import type { EngineInfo, EngineStyle } from "../types";
import { firstSan, friendlyEngineError, policyPercents, statusLabel } from "../engine/Engine";

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

export function AnalysisTab({
  info,
  style,
  onMore,
  onRetry,
}: {
  info: EngineInfo;
  style: EngineStyle;
  onMore: () => void;
  onRetry?: () => void;
}) {
  const az = style === "alphazero" || style === "chessapp";
  const top = info.lines[0];
  const extras = info.lines.slice(1);
  const percents = az ? policyPercents(info.lines) : [];
  const errorText =
    friendlyEngineError(info.error) ||
    (info.status === "error" ? "Engine restarted. Try again." : null);

  return (
    <div className="analysis-tab">
      <div className="analysis-head">
        <div className="analysis-status">{statusLabel(info.status)}</div>
        <button type="button" className="icon-btn" onClick={onMore} aria-label="More">
          ···
        </button>
      </div>
      {(info.status === "error" || errorText) && (
        <div className="engine-error-block">
          <div className="engine-error">{errorText || "Engine restarted. Try again."}</div>
          {onRetry && (
            <button type="button" className="retry-btn" onClick={onRetry}>
              Retry engine
            </button>
          )}
        </div>
      )}
      {!errorText && !az && (
        <>
          <div className="analysis-depth">
            Depth: {info.depth || "—"}
            {info.scoreText ? `  (${info.scoreText})` : ""}
          </div>
          {top && <div className="pv main">{top.pvSan || "…"}</div>}
          {extras.map((l) => (
            <div key={l.multipv} className="pv extra">
              {l.mate !== null ? `M${l.mate}` : l.scoreCp !== null ? (l.scoreCp / 100).toFixed(2) : ""}{" "}
              {l.pvSan}
            </div>
          ))}
          {info.identity && <div className="engine-id">{info.identity}</div>}
        </>
      )}
      {!errorText && az && (
        <>
          <div className="az-win">White {fmtPct(info.winPctWhite)}</div>
          <div className="az-draw">Draw {fmtPct(info.drawPct)}</div>
          {style === "chessapp" && info.planSan && (
            <div className="az-plan">
              <span className="az-plan-k">Plan</span> {info.planSan}
            </div>
          )}
          <div className="analysis-depth">Depth: {info.depth || "—"}</div>
          <div className="policy-list">
            {info.lines.map((l, i) => (
              <div
                key={l.multipv}
                className={`policy-row${style === "chessapp" && l.multipv === info.chosenMultipv ? " chosen" : ""}${i === 0 && style !== "chessapp" ? " top" : ""}`}
              >
                <span className="policy-san">{firstSan(l.pvSan)}</span>
                <span className="policy-pct">{fmtPct(percents[i] ?? null)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
