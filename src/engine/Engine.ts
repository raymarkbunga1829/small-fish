import { Chess } from "chess.js";
import type { Difficulty, EngineInfo, EngineStatus, PvLine } from "../types";
import { DIFFICULTY_ELO } from "../types";
import { movesToSanLine } from "../lib/chessUtil";

const ENGINE_URL = "/engine/stockfish-18-lite-single.js";

export type EngineListener = (info: EngineInfo) => void;

function parseScore(tokens: string[]): { cp: number | null; mate: number | null } {
  const i = tokens.indexOf("score");
  if (i < 0) return { cp: null, mate: null };
  const kind = tokens[i + 1];
  const val = Number(tokens[i + 2]);
  if (kind === "mate") return { cp: null, mate: Number.isFinite(val) ? val : null };
  if (kind === "cp") return { cp: Number.isFinite(val) ? val : null, mate: null };
  return { cp: null, mate: null };
}

function whitePawns(scoreCp: number | null, mate: number | null, turn: "w" | "b"): number | null {
  if (mate !== null) {
    const sign = mate > 0 ? 1 : -1;
    const whiteSign = turn === "w" ? sign : -sign;
    return whiteSign * 100;
  }
  if (scoreCp === null) return null;
  const pawns = scoreCp / 100;
  return turn === "w" ? pawns : -pawns;
}

function formatScore(scoreCp: number | null, mate: number | null, turn: "w" | "b"): string {
  if (mate !== null) {
    const whiteMate = turn === "w" ? mate : -mate;
    return `M${whiteMate}`;
  }
  if (scoreCp === null) return "";
  const pawns = whitePawns(scoreCp, null, turn);
  if (pawns === null) return "";
  const abs = Math.abs(pawns).toFixed(2);
  if (pawns > 0.005) return `+${abs}`;
  if (pawns < -0.005) return `-${abs}`;
  return "0.00";
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private listeners = new Set<EngineListener>();
  private lineWaiters: Array<(line: string) => void> = [];
  private info: EngineInfo = {
    status: "loading",
    identity: "",
    error: null,
    depth: 0,
    scoreText: "",
    scorePawns: null,
    lines: [],
    bestMove: null,
  };
  private currentFen = "startpos";
  private currentTurn: "w" | "b" = "w";
  private playToken = 0;

  get snapshot(): EngineInfo {
    return this.info;
  }

  subscribe(fn: EngineListener): () => void {
    this.listeners.add(fn);
    fn(this.info);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<EngineInfo>): void {
    this.info = { ...this.info, ...patch };
    for (const fn of this.listeners) fn(this.info);
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  async load(): Promise<void> {
    try {
      this.emit({ status: "loading", error: null });
      this.worker = new Worker(ENGINE_URL);
      this.worker.onerror = (ev) => {
        this.emit({
          status: "error",
          error: ev.message || "Failed to load Stockfish 18",
        });
      };
      this.worker.onmessage = (ev: MessageEvent<unknown>) => {
        if (typeof ev.data === "object" && ev.data && "percent" in ev.data) return;
        if (typeof ev.data !== "string") return;
        const line = ev.data.trim();
        if (!line) return;
        this.handleLine(line);
      };

      await this.waitFor((l) => l === "uciok", () => this.send("uci"), 30000);
      await this.waitFor((l) => l === "readyok", () => this.send("isready"), 15000);
      this.send("setoption name Hash value 64");
      this.send("setoption name Threads value 1");
      this.send("setoption name Ponder value false");
      this.emit({
        status: "ready",
        identity: this.info.identity || "Stockfish 18",
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Engine failed to start";
      this.emit({ status: "error", error: message });
      throw err;
    }
  }

  private handleLine(line: string): void {
    if (line.startsWith("id name")) {
      const name = line.slice("id name".length).trim();
      this.emit({ identity: name.includes("Stockfish") ? name : "Stockfish 18" });
    }
    for (const w of this.lineWaiters) w(line);
    if (line.startsWith("info ")) this.parseInfo(line);
    if (line.startsWith("bestmove ")) {
      const mv = line.split(/\s+/)[1] ?? null;
      this.emit({ bestMove: mv && mv !== "(none)" ? mv : null });
    }
  }

  private parseInfo(line: string): void {
    const tokens = line.split(/\s+/);
    if (tokens.includes("currmove") && !tokens.includes("pv")) return;
    const depthIdx = tokens.indexOf("depth");
    const depth = depthIdx >= 0 ? Number(tokens[depthIdx + 1]) : this.info.depth;
    const mpvIdx = tokens.indexOf("multipv");
    const multipv = mpvIdx >= 0 ? Number(tokens[mpvIdx + 1]) : 1;
    const { cp, mate } = parseScore(tokens);
    const pvIdx = tokens.indexOf("pv");
    if (pvIdx < 0) {
      if (Number.isFinite(depth)) this.emit({ depth });
      return;
    }
    const pvUci = tokens.slice(pvIdx + 1).filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t));
    const pvSan = movesToSanLine(
      this.currentFen === "startpos"
        ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        : this.currentFen,
      pvUci,
    );
    const lineObj: PvLine = {
      multipv,
      depth: Number.isFinite(depth) ? depth : 0,
      scoreCp: cp,
      mate,
      pvUci,
      pvSan,
    };
    const lines = this.info.lines.filter((l) => l.multipv !== multipv);
    lines.push(lineObj);
    lines.sort((a, b) => a.multipv - b.multipv);
    const top = lines[0];
    this.emit({
      depth: top?.depth ?? depth,
      scoreText: top ? formatScore(top.scoreCp, top.mate, this.currentTurn) : this.info.scoreText,
      scorePawns: top ? whitePawns(top.scoreCp, top.mate, this.currentTurn) : this.info.scorePawns,
      lines,
      bestMove: top?.pvUci[0] ?? this.info.bestMove,
    });
  }

  private waitFor(pred: (line: string) => boolean, kickoff: () => void, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineWaiters = this.lineWaiters.filter((w) => w !== waiter);
        reject(new Error("Engine timed out"));
      }, timeoutMs);
      const waiter = (line: string) => {
        if (!pred(line)) return;
        clearTimeout(timer);
        this.lineWaiters = this.lineWaiters.filter((w) => w !== waiter);
        resolve(line);
      };
      this.lineWaiters.push(waiter);
      kickoff();
    });
  }

  async stop(): Promise<void> {
    if (!this.worker) return;
    
    try {
      await this.waitFor(
        (l) => l.startsWith("bestmove") || l === "readyok",
        () => {
          this.send("stop");
          this.send("isready");
        },
        4000,
      );
    } catch {
      this.send("isready");
    }
  }

  configurePlay(difficulty: Difficulty): void {
    const elo = DIFFICULTY_ELO[difficulty];
    this.send("setoption name MultiPV value 1");
    if (elo === null) {
      this.send("setoption name UCI_LimitStrength value false");
    } else {
      this.send("setoption name UCI_LimitStrength value true");
      this.send("setoption name UCI_Elo value " + elo);
    }
  }

  configureAnalysis(): void {
    this.send("setoption name UCI_LimitStrength value false");
    this.send("setoption name MultiPV value 3");
    this.send("setoption name Hash value 128");
  }

  setPosition(fen: string): void {
    this.currentFen = fen;
    try {
      const tmp = new Chess(fen);
      this.currentTurn = tmp.turn();
    } catch {
      this.currentTurn = "w";
    }
    if (fen === "startpos" || fen.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq")) {
      this.send("position startpos");
    } else {
      this.send("position fen " + fen);
    }
  }

  async playMove(fen: string, difficulty: Difficulty, movetime = 900): Promise<string | null> {
    const token = ++this.playToken;
    await this.stop();
    if (token !== this.playToken) return null;
    this.configurePlay(difficulty);
    this.setPosition(fen);
    this.emit({ status: "thinking", lines: [], bestMove: null, depth: 0, scoreText: "" });
    const extra = difficulty === "unlimited" ? 1600 : difficulty === "master" ? 400 : 0;
    const line = await this.waitFor(
      (l) => l.startsWith("bestmove"),
      () => this.send(`go movetime ${movetime + extra}`),
      20000,
    );
    if (token !== this.playToken) return null;
    const mv = line.split(/\s+/)[1];
    this.emit({ status: "ready", bestMove: mv && mv !== "(none)" ? mv : null });
    return mv && mv !== "(none)" ? mv : null;
  }

  async startAnalysis(fen: string): Promise<void> {
    const token = ++this.playToken;
    await this.stop();
    if (token !== this.playToken) return;
    
    this.configureAnalysis();
    this.setPosition(fen);
    this.emit({ status: "analyzing", lines: [], bestMove: null, depth: 0, scoreText: "…" });
    this.send("go infinite");
  }

  async evaluatePosition(fen: string, depth = 12): Promise<{ pawns: number | null; best: string | null }> {
    const token = ++this.playToken;
    await this.stop();
    if (token !== this.playToken) return { pawns: null, best: null };
    this.configureAnalysis();
    this.send("setoption name MultiPV value 1");
    this.setPosition(fen);
    this.emit({ status: "analyzing" });
    await this.waitFor(
      (l) => l.startsWith("bestmove"),
      () => this.send(`go depth ${depth}`),
      15000,
    );
    return { pawns: this.info.scorePawns, best: this.info.bestMove };
  }

  destroy(): void {
    this.playToken += 1;
    try {
      this.send("quit");
    } catch {
      /* ignore */
    }
    this.worker?.terminate();
    this.worker = null;
  }
}

export function statusLabel(status: EngineStatus): string {
  switch (status) {
    case "loading":
      return "Loading…";
    case "ready":
      return "Ready";
    case "thinking":
      return "Thinking…";
    case "analyzing":
      return "Analyzing";
    case "error":
      return "Engine error";
    default:
      return "";
  }
}
