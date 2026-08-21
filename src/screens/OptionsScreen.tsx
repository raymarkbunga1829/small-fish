import type { Difficulty, GameMode, Settings, TimeControl } from "../types";
import { DIFFICULTY_LABEL, MODE_LABEL, TIME_LABEL } from "../types";
import { EngineStyleSwitch } from "../components/EngineStyleSwitch";

interface Props {
  settings: Settings;
  engineLabel: string;
  onChange: (s: Settings) => void;
  onDone: () => void;
  onImport: () => void;
  onExport: () => void;
  onNewGame: () => void;
  onResign: () => void;
  onDraw: () => void;
  engineError?: boolean;
  onRetryEngine?: () => void;
}

function Toggle({
  label,
  on,
  set,
}: {
  label: string;
  on: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <label className="ios-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`switch ${on ? "on" : ""}`}
        onClick={() => set(!on)}
      />
    </label>
  );
}

function cycle<T>(list: T[], cur: T): T {
  const i = list.indexOf(cur);
  return list[(i + 1) % list.length];
}

export function OptionsScreen({
  settings,
  engineLabel,
  onChange,
  onDone,
  onImport,
  onExport,
  onNewGame,
  onResign,
  onDraw,
  engineError,
  onRetryEngine,
}: Props) {
  const patch = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  return (
    <div className="page options-page">
      <header className="nav-bar">
        <span />
        <div className="nav-title">Options</div>
        <button type="button" className="text-btn" onClick={onDone}>
          Done
        </button>
      </header>

      <div className="group-label">GAME</div>
      <div className="ios-group">
        <button
          type="button"
          className="ios-row"
          onClick={() =>
            patch({ gameMode: cycle<GameMode>(["white", "black", "human"], settings.gameMode) })
          }
        >
          <span>Game Mode</span>
          <span className="row-value">
            {MODE_LABEL[settings.gameMode]} ›
          </span>
        </button>
        <button
          type="button"
          className="ios-row"
          onClick={() =>
            patch({ timeControl: cycle<TimeControl>(["none", "5+0", "10+0"], settings.timeControl) })
          }
        >
          <span>Time Control</span>
          <span className="row-value">{TIME_LABEL[settings.timeControl]} ›</span>
        </button>
        <button
          type="button"
          className="ios-row"
          onClick={() =>
            patch({
              difficulty: cycle<Difficulty>(
                ["beginner", "easy", "average", "hard", "master", "unlimited"],
                settings.difficulty,
              ),
            })
          }
        >
          <span>Game Difficulty</span>
          <span className="row-value">{DIFFICULTY_LABEL[settings.difficulty]} ›</span>
        </button>
      </div>

      <div className="group-label">BOARD</div>
      <div className="ios-group">
        <Toggle
          label="Show Coordinates"
          on={settings.showCoordinates}
          set={(v) => patch({ showCoordinates: v })}
        />
        <Toggle
          label="Show Legal Moves"
          on={settings.showLegalMoves}
          set={(v) => patch({ showLegalMoves: v })}
        />
        <Toggle
          label="Show Last Move"
          on={settings.showLastMove}
          set={(v) => patch({ showLastMove: v })}
        />
        <Toggle
          label="Dark Mode"
          on={settings.darkMode}
          set={(v) => patch({ darkMode: v, followSystemTheme: false })}
        />
        <Toggle
          label="Follow System Theme"
          on={settings.followSystemTheme}
          set={(v) => patch({ followSystemTheme: v })}
        />
      </div>

      <div className="group-label">ENGINE</div>
      <div className="ios-group">
        <div className="ios-row seg-row">
          <EngineStyleSwitch
            value={settings.engineStyle}
            onChange={(engineStyle) => patch({ engineStyle })}
          />
        </div>
        <div className="ios-row">
          <span>Engine</span>
          <span className="row-value">{engineLabel}</span>
        </div>
        {engineError && onRetryEngine && (
          <button type="button" className="ios-row center" onClick={onRetryEngine}>
            Retry engine
          </button>
        )}
      </div>
      {settings.engineStyle === "alphazero" && (
        <p className="group-hint">
          AlphaZero style uses Stockfish 18 with win%. Not DeepMind&apos;s weights.
        </p>
      )}
      {settings.engineStyle === "chessapp" && (
        <p className="group-hint">
          Chess App is a hybrid on Stockfish 18 search. It does not out-Elo Stockfish.
        </p>
      )}

      <div className="group-label">PGN</div>
      <div className="ios-group">
        <button type="button" className="ios-row center" onClick={onImport}>
          Import PGN
        </button>
        <button type="button" className="ios-row center" onClick={onExport}>
          Export PGN
        </button>
      </div>

      <div className="group-label">GAME ACTIONS</div>
      <div className="ios-group">
        <button type="button" className="ios-row center" onClick={onNewGame}>
          New Game
        </button>
        <button type="button" className="ios-row center danger" onClick={onResign}>
          Resign
        </button>
        <button type="button" className="ios-row center" onClick={onDraw}>
          Draw
        </button>
      </div>
    </div>
  );
}
