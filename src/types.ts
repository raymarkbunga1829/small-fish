export type Color = "w" | "b";
export type PieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";
export type Square = `${"a" | "b" | "c" | "d" | "e" | "f" | "g" | "h"}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export type GameMode = "white" | "black" | "human" | "self";
export type Difficulty = "beginner" | "easy" | "average" | "hard" | "master" | "unlimited";
export type TimeControl = "none" | "5+0" | "10+0";
export type Screen = "play" | "games" | "options";
export type Tab = "game" | "analysis" | "graph";
export type ThemeMode = "system" | "light" | "dark";
export type EngineStatus = "loading" | "ready" | "thinking" | "analyzing" | "error";
export type EngineStyle = "stockfish" | "alphazero" | "chessapp";
export type Nag = "??" | "?" | "?!";

export interface Settings {
  gameMode: GameMode;
  difficulty: Difficulty;
  timeControl: TimeControl;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  showLastMove: boolean;
  darkMode: boolean;
  followSystemTheme: boolean;
  engineStyle: EngineStyle;
}

export interface SavedGame {
  id: string;
  white: string;
  black: string;
  date: string;
  result: string;
  event: string;
  pgn: string;
}

export interface MoveComment {
  ply: number;
  nag: Nag;
  text: string;
}

export interface Wdl {
  w: number;
  d: number;
  l: number;
}

export interface PvLine {
  multipv: number;
  depth: number;
  scoreCp: number | null;
  mate: number | null;
  wdl: Wdl | null;
  pvUci: string[];
  pvSan: string;
  hybrid: number | null;
}

export interface EngineInfo {
  status: EngineStatus;
  identity: string;
  error: string | null;
  depth: number;
  scoreText: string;
  scorePawns: number | null;
  winPctWhite: number | null;
  drawPct: number | null;
  expectedPctWhite: number | null;
  lines: PvLine[];
  bestMove: string | null;
  planSan: string | null;
  chosenMultipv: number | null;
}

export interface ClockState {
  whiteMs: number;
  blackMs: number;
  running: boolean;
}

export const DIFFICULTY_ELO: Record<Difficulty, number | null> = {
  beginner: 800,
  easy: 1200,
  average: 1600,
  hard: 2000,
  master: 2500,
  unlimited: null,
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: "Beginner",
  easy: "Easy",
  average: "Average",
  hard: "Hard",
  master: "Master",
  unlimited: "Unlimited",
};

export const MODE_LABEL: Record<GameMode, string> = {
  white: "You play White",
  black: "You play Black",
  human: "Two players",
  self: "Self-play (Engine vs Engine)",
};

export const TIME_LABEL: Record<TimeControl, string> = {
  none: "None",
  "5+0": "5+0",
  "10+0": "10+0",
};

export const ENGINE_STYLES: EngineStyle[] = ["stockfish", "alphazero", "chessapp"];

export const ENGINE_STYLE_LABEL: Record<EngineStyle, string> = {
  stockfish: "Stockfish",
  alphazero: "AlphaZero",
  chessapp: "Chess App",
};

export const DEFAULT_SETTINGS: Settings = {
  gameMode: "white",
  difficulty: "average",
  timeControl: "none",
  showCoordinates: false,
  showLegalMoves: true,
  showLastMove: true,
  darkMode: false,
  followSystemTheme: true,
  engineStyle: "stockfish",
};

export const PLAYER_NAME = "Ray Mark Bunga";
export const ENGINE_NAME = "Stockfish";
export const AZ_ENGINE_NAME = "AlphaZero";
export const CHESSAPP_NAME = "Chess App";
export const STYLE_ENGINE_NAMES: Record<EngineStyle, string> = {
  stockfish: ENGINE_NAME,
  alphazero: AZ_ENGINE_NAME,
  chessapp: CHESSAPP_NAME,
};

export function usesWinPct(style: EngineStyle): boolean {
  return style === "alphazero" || style === "chessapp";
}
