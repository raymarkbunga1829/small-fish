import { useCallback, useMemo, useRef, useState, type PointerEvent, type MouseEvent } from "react";
import type { Chess, Square } from "chess.js";
import { PieceSvg } from "./Pieces";
import { coordAt, fileToCol, rankToRow, uciToMove } from "../lib/chessUtil";

interface BoardProps {
  chess: Chess;
  flipped: boolean;
  lastFrom?: string | null;
  lastTo?: string | null;
  bestMove?: string | null;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  showLastMove: boolean;
  interactive: boolean;
  onMove: (from: Square, to: Square, promotion?: string) => boolean;
  onFlip: () => void;
  onNeedPromotion: (from: Square, to: Square, color: "w" | "b") => void;
}

export function Board({
  chess,
  flipped,
  lastFrom,
  lastTo,
  bestMove,
  showCoordinates,
  showLegalMoves,
  showLastMove,
  interactive,
  onMove,
  onFlip,
  onNeedPromotion,
}: BoardProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<{
    sq: Square;
    x: number;
    y: number;
    w: number;
  } | null>(null);
  const lastTap = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);

  const legalTargets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(chess.moves({ square: selected, verbose: true }).map((m) => m.to));
  }, [chess, selected]);

  const files = flipped ? "hgfedcba" : "abcdefgh";
  const ranks = flipped ? "12345678" : "87654321";

  const squareFromPoint = (clientX: number, clientY: number): Square | null => {
    const el = boardRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const col = Math.floor(((clientX - r.left) / r.width) * 8);
    const row = Math.floor(((clientY - r.top) / r.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return coordAt(col, row, flipped);
  };

  const tryMove = (from: Square, to: Square): void => {
    if (from === to) {
      setSelected(from);
      return;
    }
    const piece = chess.get(from);
    if (!piece) return;
    const legal = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!legal.length) {
      const dest = chess.get(to);
      if (dest && dest.color === chess.turn()) setSelected(to);
      else setSelected(null);
      return;
    }
    if (legal.some((m) => m.promotion)) {
      onNeedPromotion(from, to, piece.color);
      setSelected(null);
      return;
    }
    const ok = onMove(from, to);
    setSelected(ok ? null : from);
  };

  const onPointerDown = (sq: Square, e: PointerEvent) => {
    if (!interactive) return;
    const piece = chess.get(sq);
    if (!piece || piece.color !== chess.turn()) {
      if (selected) tryMove(selected, sq);
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < 280 && !selected) {
      /* handled at board level */
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const board = boardRef.current?.getBoundingClientRect();
    setSelected(sq);
    setDrag({
      sq,
      x: e.clientX,
      y: e.clientY,
      w: board ? board.width / 8 : 48,
    });
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!drag) return;
    const dest = squareFromPoint(e.clientX, e.clientY);
    const from = drag.sq;
    setDrag(null);
    if (dest) tryMove(from, dest);
  };

  const onBoardClick = (e: MouseEvent) => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      onFlip();
      setSelected(null);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    if (!interactive) return;
    const sq = squareFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    if (selected) tryMove(selected, sq);
  };

  const arrow = useMemo(() => {
    if (!bestMove) return null;
    const parsed = uciToMove(bestMove);
    if (!parsed) return null;
    const x1 = fileToCol(parsed.from[0], flipped) * 12.5 + 6.25;
    const y1 = rankToRow(parsed.from[1], flipped) * 12.5 + 6.25;
    const x2 = fileToCol(parsed.to[0], flipped) * 12.5 + 6.25;
    const y2 = rankToRow(parsed.to[1], flipped) * 12.5 + 6.25;
    return { x1, y1, x2, y2 };
  }, [bestMove, flipped]);

  const boardPos = boardRef.current?.getBoundingClientRect();

  const handleKey = useCallback(() => undefined, []);

  return (
    <div
      className="board-wrap"
      ref={boardRef}
      onClick={onBoardClick}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={handleKey}
      role="grid"
      aria-label="Chessboard"
    >
      {Array.from({ length: 8 }, (_, row) =>
        Array.from({ length: 8 }, (_, col) => {
          const sq = coordAt(col, row, flipped);
          const piece = chess.get(sq);
          const light = (col + row) % 2 === 0;
          const isLast = showLastMove && (sq === lastFrom || sq === lastTo);
          const isSel = selected === sq;
          const isLegal = showLegalMoves && legalTargets.has(sq);
          const isCapture = isLegal && !!piece;
          const dragging = drag?.sq === sq;
          return (
            <div
              key={sq}
              className={[
                "sq",
                light ? "light" : "dark",
                isLast ? "last" : "",
                isSel ? "sel" : "",
              ].join(" ")}
              role="gridcell"
              onPointerDown={(e) => {
                e.stopPropagation();
                onPointerDown(sq, e);
              }}
            >
              {showCoordinates && col === 0 && (
                <span className="coord rank">{ranks[row]}</span>
              )}
              {showCoordinates && row === 7 && (
                <span className="coord file">{files[col]}</span>
              )}
              {isLegal && !isCapture && <span className="dot" />}
              {isCapture && <span className="ring" />}
              {piece && !dragging && (
                <span className="piece">
                  <PieceSvg type={piece.type} color={piece.color} />
                </span>
              )}
            </div>
          );
        }),
      )}
      {arrow && (
        <svg className="board-arrows" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker
              id="bm"
              markerWidth="4"
              markerHeight="4"
              refX="3"
              refY="2"
              orient="auto"
            >
              <path d="M0,0 L4,2 L0,4 Z" fill="#0A4FA0" />
            </marker>
          </defs>
          <line
            x1={arrow.x1}
            y1={arrow.y1}
            x2={arrow.x2}
            y2={arrow.y2}
            stroke="#0A4FA0"
            strokeWidth="1.7"
            strokeLinecap="round"
            markerEnd="url(#bm)"
          />
        </svg>
      )}
      {drag && boardPos && (
        <span
          className="piece ghost"
          style={{
            position: "fixed",
            left: drag.x - drag.w / 2,
            top: drag.y - drag.w / 2,
            width: drag.w,
            height: drag.w,
            pointerEvents: "none",
            zIndex: 20,
          }}
        >
          {chess.get(drag.sq) && (
            <PieceSvg type={chess.get(drag.sq)!.type} color={chess.get(drag.sq)!.color} />
          )}
        </span>
      )}
    </div>
  );
}
