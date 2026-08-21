import { Chess, type Move, type Square } from "chess.js";
import type { Nag } from "../types";

export function cloneAtPly(pgn: string, ply: number): Chess {
  const game = new Chess();
  if (pgn.trim()) {
    try {
      game.loadPgn(pgn, { strict: false });
    } catch {
      game.reset();
    }
  }
  const verbose = game.history({ verbose: true });
  const target = new Chess();
  const headers = game.getHeaders();
  for (const [k, v] of Object.entries(headers)) {
    if (v) target.setHeader(k, v);
  }
  const count = ply < 0 ? 0 : Math.min(ply + 1, verbose.length);
  for (let i = 0; i < count; i++) {
    const m = verbose[i];
    target.move({ from: m.from, to: m.to, promotion: m.promotion });
  }
  return target;
}

export function loadGame(pgn: string): { chess: Chess; moves: Move[]; ok: boolean } {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn, { strict: false });
    return { chess, moves: chess.history({ verbose: true }), ok: true };
  } catch {
    return { chess: new Chess(), moves: [], ok: false };
  }
}

export function resultOf(chess: Chess): string {
  if (chess.isCheckmate()) return chess.turn() === "w" ? "0-1" : "1-0";
  if (
    chess.isStalemate() ||
    chess.isThreefoldRepetition() ||
    chess.isInsufficientMaterial() ||
    chess.isDraw()
  ) {
    return "1/2-1/2";
  }
  return "*";
}

export function endReason(chess: Chess): string | null {
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? "Black wins by checkmate" : "White wins by checkmate";
  }
  if (chess.isStalemate()) return "Draw by stalemate";
  if (chess.isThreefoldRepetition()) return "Draw by repetition";
  if (chess.isInsufficientMaterial()) return "Draw by insufficient material";
  if (chess.isDraw()) return "Draw";
  return null;
}

export function uciToMove(uci: string): { from: Square; to: Square; promotion?: string } | null {
  if (!uci || uci.length < 4 || uci === "0000") return null;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? uci[4] : undefined;
  return { from, to, promotion };
}

export function movesToSanLine(fen: string, uciMoves: string[]): string {
  try {
    const g = new Chess(fen);
    const sans: string[] = [];
    let plyOffset = g.moveNumber();
    const startBlack = g.turn() === "b";
    for (let i = 0; i < uciMoves.length; i++) {
      const parsed = uciToMove(uciMoves[i]);
      if (!parsed) break;
      const mv = g.move(parsed);
      if (!mv) break;
      if (i === 0 && startBlack) {
        sans.push(`${plyOffset}...${mv.san}`);
      } else if (mv.color === "w") {
        sans.push(`${g.moveNumber()}.${mv.san}`);
      } else {
        sans.push(mv.san);
      }
    }
    return sans.join(" ");
  } catch {
    return uciMoves.join(" ");
  }
}

export function classifySwing(delta: number): Nag | null {
  const abs = Math.abs(delta);
  if (abs >= 3) return "??";
  if (abs >= 1) return "?";
  if (abs >= 0.5) return "?!";
  return null;
}

export function nagLabel(nag: Nag): string {
  if (nag === "??") return "Blunder";
  if (nag === "?") return "Mistake";
  return "Inaccuracy";
}

export function formatClock(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fileToCol(file: string, flipped: boolean): number {
  const col = file.charCodeAt(0) - 97;
  return flipped ? 7 - col : col;
}

export function rankToRow(rank: string, flipped: boolean): number {
  const row = 8 - Number(rank);
  return flipped ? 7 - row : row;
}

export function coordAt(col: number, row: number, flipped: boolean): Square {
  const file = flipped ? 7 - col : col;
  const rank = flipped ? row + 1 : 8 - row;
  return `${String.fromCharCode(97 + file)}${rank}` as Square;
}
