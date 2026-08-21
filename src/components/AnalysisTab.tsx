import type { EngineInfo } from "../types";
import { statusLabel } from "../engine/Engine";

export function AnalysisTab({ info, onMore }: { info: EngineInfo; onMore: () => void }) {
  const top = info.lines[0];
  const extras = info.lines.slice(1);
  return (
    <div className="analysis-tab">
      <div className="analysis-head">
        <div className="analysis-status">{statusLabel(info.status)}</div>
        <button type="button" className="icon-btn" onClick={onMore} aria-label="More">
          ···
        </button>
      </div>
      {info.error && <div className="engine-error">{info.error}</div>}
      {!info.error && (
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
    </div>
  );
}
