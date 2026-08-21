import {
  DEFAULT_SETTINGS,
  type MoveComment,
  type SavedGame,
  type Settings,
} from "../types";

const SETTINGS_KEY = "smallfish.settings.v1";
const GAMES_KEY = "smallfish.games.v1";
const LAST_KEY = "smallfish.last.v1";

export interface LastGameState {
  pgn: string;
  ply: number;
  white: string;
  black: string;
  event: string;
  comments: MoveComment[];
  evals: Array<number | null>;
  clocks?: { whiteMs: number; blackMs: number };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadSettings(): Settings {
  const stored = readJson<Partial<Settings>>(SETTINGS_KEY, {});
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  if (
    merged.engineStyle !== "stockfish" &&
    merged.engineStyle !== "alphazero" &&
    merged.engineStyle !== "chessapp"
  ) {
    merged.engineStyle = "stockfish";
  }
  return merged;
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadGames(): SavedGame[] {
  return readJson<SavedGame[]>(GAMES_KEY, []);
}

export function saveGames(games: SavedGame[]): void {
  localStorage.setItem(GAMES_KEY, JSON.stringify(games));
}

export function loadLastGame(): LastGameState | null {
  return readJson<LastGameState | null>(LAST_KEY, null);
}

export function saveLastGame(state: LastGameState): void {
  localStorage.setItem(LAST_KEY, JSON.stringify(state));
}

export function todayStamp(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
