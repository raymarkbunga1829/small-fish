import { Chess, type Square } from "chess.js";
import type { PvLine, Wdl } from "../types";
import { uciToMove } from "../lib/chessUtil";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FILES = "abcdefgh";
const RANKS = "12345678";

export function resolveFen(fen: string): string {
  return fen === "startpos" ? START_FEN : fen;
}

function findKing(chess: Chess, color: "w" | "b"): Square | null {
  const board = chess.board();
  for (const row of board) {
    for (const p of row) {
      if (p && p.type === "k" && p.color === color) return p.square;
    }
  }
  return null;
}

function kingAttackScore(chess: Chess, side: "w" | "b"): number {
  const enemy = side === "w" ? "b" : "w";
  const ksq = findKing(chess, enemy);
  if (!ksq) return 0;
  const kf = ksq.charCodeAt(0) - 97;
  const kr = Number(ksq[1]) - 1;
  let score = 0;
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== side || p.type === "k") continue;
      const f = p.square.charCodeAt(0) - 97;
      const r = Number(p.square[1]) - 1;
      const dist = Math.max(Math.abs(f - kf), Math.abs(r - kr));
      if (p.type === "q" && dist <= 3) score += 3.2 - dist * 0.6;
      else if (p.type === "n" && dist <= 3) score += 2.4 - dist * 0.5;
      else if (p.type === "r" && dist <= 3) score += 2.0 - dist * 0.45;
      else if (p.type === "b" && dist <= 3) score += 1.8 - dist * 0.4;
      else if (p.type === "p" && dist <= 2) score += 1.2 - dist * 0.4;
    }
  }
  if (chess.isAttacked(ksq, side)) score += 2;
  return score;
}

function mobilityScore(chess: Chess, side: "w" | "b"): number {
  let n = 0;
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const s = `${FILES[f]}${RANKS[r]}` as Square;
      if (chess.isAttacked(s, side)) n++;
    }
  }
  return n;
}

function pawnPlanScore(chess: Chess, side: "w" | "b"): number {
  const our: Array<{ f: number; r: number }> = [];
  const theirs: Array<{ f: number; r: number }> = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.type !== "p") continue;
      const f = p.square.charCodeAt(0) - 97;
      const r = Number(p.square[1]) - 1;
      if (p.color === side) our.push({ f, r });
      else theirs.push({ f, r });
    }
  }
  let score = 0;
  for (const p of our) {
    const advanced = side === "w" ? p.r : 7 - p.r;
    if (advanced >= 4) score += 0.6;
    if (advanced >= 5) score += 1.0;
    if (advanced >= 6) score += 1.6;
    const passed = !theirs.some((e) => {
      const ahead = side === "w" ? e.r > p.r : e.r < p.r;
      return ahead && Math.abs(e.f - p.f) <= 1;
    });
    if (passed) score += 1.4 + advanced * 0.25;
  }
  return score;
}

export function positionIsSharp(chess: Chess): boolean {
  const moves = chess.moves({ verbose: true });
  let captures = 0;
  let checks = 0;
  for (const m of moves) {
    if (m.captured) captures++;
    if (m.san.includes("+") || m.san.includes("#")) checks++;
  }
  const wk = findKing(chess, "w");
  const bk = findKing(chess, "b");
  const exposed =
    (!!wk && wk[1] !== "1" && wk[1] !== "2") || (!!bk && bk[1] !== "8" && bk[1] !== "7");
  return captures >= 4 || checks >= 2 || exposed;
}

function stmExpected(line: PvLine): number {
  if (line.wdl) return (line.wdl.w + 0.5 * line.wdl.d) / 1000;
  if (line.mate !== null) return line.mate > 0 ? 0.99 : 0.01;
  const cp = line.scoreCp ?? 0;
  return 1 / (1 + Math.exp(-cp / 200));
}

export function scoreHybridLine(fen: string, line: PvLine, turn: "w" | "b", sharp: boolean): number {
  const expected = stmExpected(line);
  const first = line.pvUci[0];
  let attack = 0;
  let mob = 0;
  let pawns = 0;
  let penalty = 0;
  if (first) {
    try {
      const g = new Chess(resolveFen(fen));
      const parsed = uciToMove(first);
      const mv = parsed ? g.move(parsed) : null;
      if (mv) {
        attack = kingAttackScore(g, turn);
        mob = mobilityScore(g, turn);
        pawns = pawnPlanScore(g, turn);
        const quiet = !mv.captured && !mv.san.includes("+") && !mv.san.includes("#");
        const drawn = line.wdl
          ? line.wdl.d >= 700 && line.wdl.w < 220 && line.wdl.l < 220
          : Math.abs(line.scoreCp ?? 0) < 15;
        if (sharp && quiet && drawn) penalty = 5;
      }
    } catch {
      /* leave bonuses at 0 */
    }
  }
  const attackN = Math.min(attack, 12) * 0.35;
  const mobN = Math.min(Math.max(mob - 16, 0), 20) * 0.12;
  const pawnN = Math.min(pawns, 8) * 0.28;
  return expected * 100 + attackN + mobN + pawnN - penalty;
}

export function pickHybridLine(fen: string, lines: PvLine[], turn: "w" | "b"): PvLine | null {
  if (!lines.length) return null;
  let sharp = false;
  try {
    sharp = positionIsSharp(new Chess(resolveFen(fen)));
  } catch {
    sharp = false;
  }
  let best = lines[0];
  let bestScore = -Infinity;
  for (const line of lines) {
    const s = scoreHybridLine(fen, line, turn, sharp);
    line.hybrid = s;
    if (s > bestScore) {
      bestScore = s;
      best = line;
    }
  }
  return best;
}

export function wdlExpectedWhite(wdl: Wdl, turn: "w" | "b"): number {
  const stm = (wdl.w + 0.5 * wdl.d) / 10;
  return turn === "w" ? stm : 100 - stm;
}
