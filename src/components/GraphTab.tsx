import { useMemo, useRef } from "react";
import type { MoveComment } from "../types";

interface Props {
  evals: Array<number | null>;
  ply: number;
  totalPlies: number;
  comments: MoveComment[];
  onJump: (ply: number) => void;
}

const W = 320;
const H = 168;
const MID = H / 2;
const CAP = 6;

export function GraphTab({ evals, ply, totalPlies, comments, onJump }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const n = Math.max(totalPlies, 1);

  const points = useMemo(() => {
    const pts: Array<{ x: number; y: number; ply: number; v: number }> = [];
    pts.push({ x: 0, y: MID, ply: -1, v: 0 });
    for (let i = 0; i < n; i++) {
      const raw = evals[i];
      const v = raw == null ? (pts[pts.length - 1]?.v ?? 0) : Math.max(-CAP, Math.min(CAP, raw));
      const x = ((i + 1) / n) * W;
      const y = MID - (v / CAP) * (H / 2 - 6);
      pts.push({ x, y, ply: i, v: raw == null ? pts[pts.length - 1]?.v ?? 0 : raw });
    }
    return pts;
  }, [evals, n]);

  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `0,${MID} ${line} ${W},${MID}`;
  const markerX = ((Math.max(ply, -1) + 1) / n) * W;

  const jumpAt = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const t = (clientX - r.left) / r.width;
    const idx = Math.round(t * n) - 1;
    onJump(Math.max(-1, Math.min(totalPlies - 1, idx)));
  };

  const bands = comments.map((c) => {
    const x = ((c.ply + 1) / n) * W;
    const w = W / n;
    const cls = c.nag === "??" ? "blunder" : c.nag === "?" ? "mistake" : "inacc";
    return { x, w, cls, ply: c.ply };
  });

  return (
    <div className="graph-tab">
      <svg
        ref={svgRef}
        className="eval-graph"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onPointerDown={(e) => jumpAt(e.clientX)}
        onPointerMove={(e) => {
          if (e.buttons) jumpAt(e.clientX);
        }}
      >
        {bands.map((b) => (
          <rect
            key={b.ply}
            x={b.x - b.w}
            y={0}
            width={b.w}
            height={H}
            className={`shade ${b.cls}`}
          />
        ))}
        <line x1="0" y1="0" x2="0" y2={H} className="axis" />
        <line x1={W} y1="0" x2={W} y2={H} className="axis" />
        <line x1="0" y1={MID} x2={W} y2={MID} className="zero" />
        <polygon points={area} className="eval-fill" />
        <polyline points={line} className="eval-line" />
        <line x1={markerX} y1="0" x2={markerX} y2={H} className="marker" />
        <circle cx={markerX} cy="2.4" r="2.6" className="marker-dot" />
        <circle cx={markerX} cy={H - 2.4} r="2.6" className="marker-dot" />
      </svg>
    </div>
  );
}
