import type { Tab } from "../types";

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  ply: number;
  total: number;
  onJump: (ply: number) => void;
  onMore: () => void;
}

export function BottomChrome({ tab, onTab, ply, total, onJump, onMore }: Props) {
  const max = Math.max(total - 1, 0);
  const value = total === 0 ? 0 : Math.max(0, ply + 1);
  return (
    <div className="chrome">
      <div className="scrubber-row">
        <button type="button" className="nav-btn" onClick={() => onJump(ply - 1)} aria-label="Previous">
          ‹
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(total, 0)}
          value={value}
          onChange={(e) => onJump(Number(e.target.value) - 1)}
          className="scrubber"
          aria-label="Game progress"
        />
        <button type="button" className="nav-btn" onClick={() => onJump(ply + 1)} aria-label="Next">
          ›
        </button>
      </div>
      <div className="tabs">
        {(["game", "analysis", "graph"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => onTab(t)}
          >
            {t === "game" ? "Game" : t === "analysis" ? "Analysis" : "Graph"}
          </button>
        ))}
        <button type="button" className="icon-btn more" onClick={onMore} aria-label="More">
          ···
        </button>
      </div>
      <span className="sr-only">{max}</span>
    </div>
  );
}
