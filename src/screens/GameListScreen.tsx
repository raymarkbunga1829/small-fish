import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { MiniBoard } from "../components/MiniBoard";
import type { SavedGame } from "../types";

interface Props {
  games: SavedGame[];
  onBack: () => void;
  onLoad: (game: SavedGame, ply: number) => void;
  onDelete: (id: string) => void;
}

export function GameListScreen({ games, onBack, onLoad, onDelete }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [ply, setPly] = useState(0);
  const [editing, setEditing] = useState(false);

  const open = games.find((g) => g.id === openId) ?? null;
  const fen = useMemo(() => {
    if (!open) return new Chess().fen();
    const c = new Chess();
    try {
      c.loadPgn(open.pgn, { strict: false });
    } catch {
      return new Chess().fen();
    }
    const hist = c.history({ verbose: true });
    const g = new Chess();
    const n = Math.min(ply, hist.length);
    for (let i = 0; i < n; i++) {
      g.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
    }
    return g.fen();
  }, [open, ply]);

  const maxPly = useMemo(() => {
    if (!open) return 0;
    try {
      const c = new Chess();
      c.loadPgn(open.pgn, { strict: false });
      return c.history().length;
    } catch {
      return 0;
    }
  }, [open]);

  return (
    <div className="page">
      <header className="nav-bar">
        <button type="button" className="text-btn" onClick={onBack}>
          ‹ Back
        </button>
        <div className="nav-title">Games</div>
        <button type="button" className="text-btn" onClick={() => setEditing((e) => !e)}>
          {editing ? "Done" : "Edit"}
        </button>
      </header>
      <div className="grouped-list">
        {games.map((g) => {
          const expanded = openId === g.id;
          return (
            <div key={g.id} className="game-row-wrap">
              <button
                type="button"
                className="game-row"
                onClick={() => {
                  if (editing) return;
                  if (expanded) {
                    setOpenId(null);
                  } else {
                    setOpenId(g.id);
                    try {
                      const c = new Chess();
                      c.loadPgn(g.pgn, { strict: false });
                      setPly(c.history().length);
                    } catch {
                      setPly(0);
                    }
                  }
                }}
              >
                <div className="game-line">
                  <span className="dot-color white sm" />
                  <span className="strong">{g.white}</span>
                  <span className="muted right">{g.date}</span>
                </div>
                <div className="game-line">
                  <span className="dot-color black sm" />
                  <span className="strong">{g.black}</span>
                  <span className="muted right">{g.result}</span>
                </div>
                <div className="game-event">{g.event}</div>
              </button>
              {editing && (
                <button type="button" className="delete-btn" onClick={() => onDelete(g.id)}>
                  Delete
                </button>
              )}
              {expanded && (
                <div className="game-expand">
                  <MiniBoard fen={fen} />
                  <div className="expand-side">
                    <button type="button" className="load-btn" onClick={() => onLoad(g, ply - 1)}>
                      Load Game
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={maxPly}
                      value={ply}
                      onChange={(e) => setPly(Number(e.target.value))}
                      className="scrubber"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!games.length && <div className="tab-empty">No saved games yet.</div>}
      </div>
    </div>
  );
}
