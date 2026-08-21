import type { Move } from "chess.js";
import type { MoveComment } from "../types";
import { nagLabel } from "../lib/chessUtil";

interface Props {
  moves: Move[];
  ply: number;
  comments: MoveComment[];
  onJump: (ply: number) => void;
}

export function GameTab({ moves, ply, comments, onJump }: Props) {
  const pairs: Array<{ n: number; w?: Move; b?: Move; wi: number; bi: number }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      n: Math.floor(i / 2) + 1,
      w: moves[i],
      b: moves[i + 1],
      wi: i,
      bi: i + 1,
    });
  }
  const byPly = new Map(comments.map((c) => [c.ply, c]));

  if (!moves.length) {
    return <div className="tab-empty" />;
  }

  return (
    <div className="move-list">
      {pairs.map((p) => (
        <div key={p.n} className="move-pair">
          <span className="move-num">{p.n}.</span>
          {p.w && (
            <button
              type="button"
              className={`san ${ply === p.wi ? "current" : ""}`}
              onClick={() => onJump(p.wi)}
            >
              {p.w.san}
            </button>
          )}
          {p.b && (
            <button
              type="button"
              className={`san ${ply === p.bi ? "current" : ""}`}
              onClick={() => onJump(p.bi)}
            >
              {p.b.san}
            </button>
          )}
          {byPly.has(p.wi) && (
            <span className={`nag nag-${byPly.get(p.wi)!.nag}`}>
              {byPly.get(p.wi)!.nag} {nagLabel(byPly.get(p.wi)!.nag)}
              {byPly.get(p.wi)!.text ? ` — ${byPly.get(p.wi)!.text}` : ""}
            </span>
          )}
          {byPly.has(p.bi) && (
            <span className={`nag nag-${byPly.get(p.bi)!.nag}`}>
              {byPly.get(p.bi)!.nag} {nagLabel(byPly.get(p.bi)!.nag)}
              {byPly.get(p.bi)!.text ? ` — ${byPly.get(p.bi)!.text}` : ""}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
