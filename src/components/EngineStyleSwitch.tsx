import type { EngineStyle } from "../types";
import { ENGINE_STYLE_LABEL, ENGINE_STYLES } from "../types";

interface Props {
  value: EngineStyle;
  onChange: (style: EngineStyle) => void;
  compact?: boolean;
}

export function EngineStyleSwitch({ value, onChange, compact }: Props) {
  return (
    <div
      className={`seg${compact ? " compact" : ""}`}
      role="radiogroup"
      aria-label="Engine style"
    >
      {ENGINE_STYLES.map((style) => (
        <button
          key={style}
          type="button"
          role="radio"
          aria-checked={value === style}
          className={`seg-btn${value === style ? " on" : ""}`}
          onClick={() => onChange(style)}
        >
          {ENGINE_STYLE_LABEL[style]}
        </button>
      ))}
    </div>
  );
}
