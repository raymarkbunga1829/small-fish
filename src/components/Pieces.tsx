import type { PieceSymbol } from "../types";

const W_FILL = "#F4EFE3";
const W_STROKE = "#1C1C1C";
const B_FILL = "#2B2B2B";
const B_STROKE = "#EDE8DC";

function common(color: "w" | "b") {
  return {
    fill: color === "w" ? W_FILL : B_FILL,
    stroke: color === "w" ? W_STROKE : B_STROKE,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function PieceSvg({
  type,
  color,
}: {
  type: PieceSymbol;
  color: "w" | "b";
}) {
  const p = common(color);
  const ink = color === "w" ? W_STROKE : B_STROKE;
  const body = color === "w" ? W_FILL : B_FILL;

  switch (type) {
    case "p":
      return (
        <svg viewBox="0 0 45 45" className="piece-svg">
          <path
            d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
            {...p}
          />
        </svg>
      );
    case "r":
      return (
        <svg viewBox="0 0 45 45" className="piece-svg">
          <g {...p}>
            <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
            <path d="M34 14l-3 3H14l-3-3" />
            <path d="M31 17v12.5H14V17" />
            <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
            <path d="M9 39.5h27" fill="none" />
          </g>
        </svg>
      );
    case "n":
      return (
        <svg viewBox="0 0 45 45" className="piece-svg">
          <g {...p}>
            <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 0-13 2-15-1.5-1-3-3-3.5-5.5-2 1-4.5 2-7 1.5 1.5-4 3.5-6 6.5-7.5-1-2.5-1-5.5 1-8 2.5 1.5 4.5 2 7 1.5z" />
            <path
              d="M24.55 10.4l-.3 1.5.5.1c3.15 1 5.65 2.49 7.9 6.75s2.75 10.54 2.35 16.85l-.05 1H39.3s-.05-9.7-2.4-16.1c-1.45-3.95-4.15-7.6-8.2-8.95-.65-.2-1.3-.35-2.15-.35z"
              fill={body}
              stroke="none"
            />
            <path
              d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z"
              fill={ink}
              stroke="none"
            />
            <path
              d="M14.85 16.2a.5 1.5 30 1 1-.85-.3.5 1.5 30 1 1 .86.3z"
              fill={ink}
              stroke="none"
            />
          </g>
        </svg>
      );
    case "b":
      return (
        <svg viewBox="0 0 45 45" className="piece-svg">
          <g {...p}>
            <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z" />
            <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" />
          </g>
          <path
            d="M17.5 26h10M15 30h15M22.5 15.5l0 10"
            fill="none"
            stroke={ink}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      );
    case "q":
      return (
        <svg viewBox="0 0 45 45" className="piece-svg">
          <g {...p}>
            <circle cx="6" cy="12" r="2.75" />
            <circle cx="14" cy="9" r="2.75" />
            <circle cx="22.5" cy="8" r="2.75" />
            <circle cx="31" cy="9" r="2.75" />
            <circle cx="39" cy="12" r="2.75" />
            <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5-7.5 8.5-4.5-12-4.5 13-4.5-13-4.5 12-7.5-8.5z" />
            <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 4.5-1.5 4.5h26s0-3.5-1.5-4.5c-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
            <path d="M11.5 38.5a35 35 1 0 0 22 0" fill="none" />
            <path d="M11 29a35 35 1 0 1 23 0" fill="none" />
          </g>
        </svg>
      );
    case "k":
      return (
        <svg viewBox="0 0 45 45" className="piece-svg">
          <g {...p} fill="none">
            <path d="M22.5 11.63V6" />
            <path d="M20 8h5" />
            <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill={body} />
            <path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill={body} />
            <path d="M12.5 30c5.5-3 14.5-3 20 0M12.5 33.5c5.5-3 14.5-3 20 0M12.5 37c5.5-3 14.5-3 20 0" />
          </g>
        </svg>
      );
    default:
      return null;
  }
}
