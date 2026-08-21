import { Chess } from "chess.js";
import { PieceSvg } from "./Pieces";
import { coordAt } from "../lib/chessUtil";

export function MiniBoard({ fen, flipped = false }: { fen: string; flipped?: boolean }) {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    chess = new Chess();
  }
  return (
    <div className="mini-board">
      {Array.from({ length: 8 }, (_, row) =>
        Array.from({ length: 8 }, (_, col) => {
          const sq = coordAt(col, row, flipped);
          const piece = chess.get(sq);
          const light = (col + row) % 2 === 0;
          return (
            <div key={sq} className={`mini-sq ${light ? "light" : "dark"}`}>
              {piece && (
                <span className="mini-piece">
                  <PieceSvg type={piece.type} color={piece.color} />
                </span>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}
