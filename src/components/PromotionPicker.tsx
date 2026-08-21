import { PieceSvg } from "./Pieces";
import type { PieceSymbol } from "../types";

const PIECES: PieceSymbol[] = ["q", "r", "b", "n"];

export function PromotionPicker({
  color,
  onPick,
  onCancel,
}: {
  color: "w" | "b";
  onPick: (p: PieceSymbol) => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onCancel} role="presentation">
      <div className="promo" onClick={(e) => e.stopPropagation()}>
        <div className="promo-title">Promote to</div>
        <div className="promo-row">
          {PIECES.map((p) => (
            <button key={p} type="button" className="promo-btn" onClick={() => onPick(p)}>
              <PieceSvg type={p} color={color} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
