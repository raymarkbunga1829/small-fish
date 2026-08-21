import { formatClock } from "../lib/chessUtil";

interface Props {
  white: string;
  black: string;
  turn: "w" | "b";
  whiteMs?: number | null;
  blackMs?: number | null;
  showClocks: boolean;
}

export function PlayerRow({ white, black, turn, whiteMs, blackMs, showClocks }: Props) {
  return (
    <div className="player-row">
      <div className={`player ${turn === "w" ? "to-move" : ""}`}>
        <span className={`dot-color white ${turn === "w" ? "selected" : ""}`} />
        <span className="side-label">White</span>
        <span className="player-name">{white}</span>
        {showClocks && whiteMs != null && <div className="clock">{formatClock(whiteMs)}</div>}
      </div>
      <div className={`player ${turn === "b" ? "to-move" : ""}`}>
        <span className={`dot-color black ${turn === "b" ? "selected" : ""}`} />
        <span className="side-label">Black</span>
        <span className="player-name">{black}</span>
        {showClocks && blackMs != null && <div className="clock">{formatClock(blackMs)}</div>}
      </div>
    </div>
  );
}
