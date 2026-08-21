import { Chess } from "chess.js";
import type { Difficulty, EngineInfo, EngineStatus, EngineStyle, PvLine, Wdl } from "../types";
import { DIFFICULTY_ELO } from "../types";
import { movesToSanLine } from "../lib/chessUtil";
import { pickHybridLine, resolveFen, wdlExpectedWhite } from "./hybrid";

const ENGINE_URL = "/engine/stockfish-18-lite-single.js";

export type EngineListener = (info: EngineInfo) => void;

const EMPTY_INFO: EngineInfo = {
  status: "loading",
  identity: "",
  error: null,
  depth: 0,
  scoreText: "",
  scorePawns: null,
  winPctWhite: null,
  drawPct: null,
  expectedPctWhite: null,
  lines: [],
  bestMove: null,
  planSan: null,
  chosenMultipv: null,
};

function parseScore(tokens: string[]): { cp: number | null; mate: number | null } {
  const i = tokens.indexOf("score");
  if (i < 0) return { cp: null, mate: null };
  const kind = tokens[i + 1];
  const val = Number(tokens[i + 2]);
  if (kind === "mate") return { cp: null, mate: Number.isFinite(val) ? val : null };
  if (kind === "cp") return { cp: Number.isFinite(val) ? val : null, mate: null };
  return { cp: null, mate: null };
}

function parseWdl(tokens: string[]): Wdl | null {
  const i = tokens.indexOf("wdl");
  if (i < 0) return null;
  const w = Number(tokens[i + 1]);
  const d = Number(tokens[i + 2]);
  const l = Number(tokens[i + 3]);
  if (![w, d, l].every(Number.isFinite)) return null;
  return { w, d, l };
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

export function pawnsToWinPct(pawns: number | null): number | null {
  if (pawns == null || !Number.isFinite(pawns)) return null;
  return 50 + 50 * Math.tanh(pawns / 4);
}

function whiteWinFromWdl(wdl: Wdl, turn: "w" | "b"): number {
  return (turn === "w" ? wdl.w : wdl.l) / 10;
}

export function policyPercents(lines: PvLine[]): number[] {
  if (!lines.length) return [];
  const hasWdl = lines.some((l) => l.wdl);
  if (hasWdl) {
    const weights = lines.map((l) => Math.max(l.wdl ? l.wdl.w : 0, 0.5));
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum > 0) return weights.map((w) => (w / sum) * 100);
  }
  const T = 250;
  const logits = lines.map((l) => {
    if (l.mate !== null) return l.mate > 0 ? 20 : -20;
    const cp = l.scoreCp ?? 0;
    return Math.max(-20, Math.min(20, cp / T));
  });
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => (e / sum) * 100);
}

export function firstSan(pvSan: string): string {
  const m = pvSan.trim().match(/^(?:\d+\.+\s*)?(\S+)/);
  return m?.[1] ?? pvSan.trim();
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private listeners = new Set<EngineListener>();
  private lineWaiters: Array<(line: string) => void> = [];
  private info: EngineInfo = { ...EMPTY_INFO };
  private currentFen = "startpos";
  private currentTurn: "w" | "b" = "w";
  private playToken = 0;
  private supportsWdl = false;
  private style: EngineStyle = "stockfish";

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
      if (this.supportsWdl) this.send("setoption name UCI_ShowWDL value true");
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
    if (line.startsWith("option name UCI_ShowWDL")) this.supportsWdl = true;
    for (const w of this.lineWaiters) w(line);
    if (line.startsWith("info ")) this.parseInfo(line);
    if (line.startsWith("bestmove ")) {
      const mv = line.split(/\s+/)[1] ?? null;
      const engineBest = mv && mv !== "(none)" ? mv : null;
      if (this.style === "chessapp") {
        const pick = this.applyHybrid();
        this.emit({
          bestMove: pick?.pvUci[0] ?? engineBest,
          planSan: pick?.pvSan ?? this.info.planSan,
          chosenMultipv: pick?.multipv ?? this.info.chosenMultipv,
        });
      } else {
        this.emit({ bestMove: engineBest });
      }
    }
  }

  private applyHybrid(): PvLine | null {
    const pick = pickHybridLine(this.currentFen, this.info.lines, this.currentTurn);
    if (!pick) return null;
    this.info = {
      ...this.info,
      lines: this.info.lines.slice(),
      bestMove: pick.pvUci[0] ?? this.info.bestMove,
      planSan: pick.pvSan,
      chosenMultipv: pick.multipv,
    };
    return pick;
  }

  private parseInfo(line: string): void {
    const tokens = line.split(/\s+/);
    if (tokens.includes("currmove") && !tokens.includes("pv")) return;
    const depthIdx = tokens.indexOf("depth");
    const depth = depthIdx >= 0 ? Number(tokens[depthIdx + 1]) : this.info.depth;
    const mpvIdx = tokens.indexOf("multipv");
    const multipv = mpvIdx >= 0 ? Number(tokens[mpvIdx + 1]) : 1;
    const { cp, mate } = parseScore(tokens);
    const wdl = parseWdl(tokens);
    const pvIdx = tokens.indexOf("pv");
    if (pvIdx < 0) {
      if (Number.isFinite(depth)) this.emit({ depth });
      return;
    }
    const pvUci = tokens.slice(pvIdx + 1).filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t));
    const pvSan = movesToSanLine(resolveFen(this.currentFen), pvUci);
    const lineObj: PvLine = {
      multipv,
      depth: Number.isFinite(depth) ? depth : 0,
      scoreCp: cp,
      mate,
      wdl,
      pvUci,
      pvSan,
      hybrid: null,
    };
    const lines = this.info.lines.filter((l) => l.multipv !== multipv);
    lines.push(lineObj);
    lines.sort((a, b) => a.multipv - b.multipv);
    const top = lines[0];
    const topWdl = top?.wdl ?? null;
    const pawns = top ? whitePawns(top.scoreCp, top.mate, this.currentTurn) : this.info.scorePawns;
    const winPctWhite = topWdl
      ? whiteWinFromWdl(topWdl, this.currentTurn)
      : pawnsToWinPct(pawns);
    const drawPct = topWdl ? topWdl.d / 10 : null;
    const expectedPctWhite = topWdl
      ? wdlExpectedWhite(topWdl, this.currentTurn)
      : winPctWhite;
    let bestMove = top?.pvUci[0] ?? this.info.bestMove;
    let planSan = top?.pvSan ?? this.info.planSan;
    let chosenMultipv = top?.multipv ?? 1;
    if (this.style === "chessapp") {
      const pick = pickHybridLine(this.currentFen, lines, this.currentTurn);
      if (pick) {
        bestMove = pick.pvUci[0] ?? bestMove;
        planSan = pick.pvSan;
        chosenMultipv = pick.multipv;
      }
    }
    this.emit({
      depth: top?.depth ?? depth,
      scoreText: top ? formatScore(top.scoreCp, top.mate, this.currentTurn) : this.info.scoreText,
      scorePawns: pawns,
      winPctWhite,
      drawPct,
      expectedPctWhite,
      lines,
      bestMove,
      planSan,
      chosenMultipv,
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

  configureAnalysis(style: EngineStyle = "stockfish"): void {
    this.style = style;
    this.send("setoption name UCI_LimitStrength value false");
    this.send(`setoption name MultiPV value ${style === "stockfish" ? 3 : 4}`);
    this.send("setoption name Hash value 128");
    if (this.supportsWdl) this.send("setoption name UCI_ShowWDL value true");
  }

  setPosition(fen: string): void {
    this.currentFen = fen;
    try {
      const tmp = new Chess(resolveFen(fen));
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

  async playMove(
    fen: string,
    difficulty: Difficulty,
    movetime = 900,
    style: EngineStyle = "stockfish",
  ): Promise<string | null> {
    const token = ++this.playToken;
    await this.stop();
    if (token !== this.playToken) return null;
    this.style = style;
    if (style === "chessapp") {
      const elo = DIFFICULTY_ELO[difficulty];
      this.send("setoption name MultiPV value 4");
      if (this.supportsWdl) this.send("setoption name UCI_ShowWDL value true");
      if (elo === null) {
        this.send("setoption name UCI_LimitStrength value false");
      } else {
        this.send("setoption name UCI_LimitStrength value true");
        this.send("setoption name UCI_Elo value " + elo);
      }
    } else {
      this.configurePlay(difficulty);
    }
    this.setPosition(fen);
    this.emit({
      status: "thinking",
      lines: [],
      bestMove: null,
      depth: 0,
      scoreText: "",
      planSan: null,
      chosenMultipv: null,
    });
    const extra = difficulty === "unlimited" ? 1600 : difficulty === "master" ? 400 : 0;
    const line = await this.waitFor(
      (l) => l.startsWith("bestmove"),
      () => this.send(`go movetime ${movetime + extra}`),
      20000,
    );
    if (token !== this.playToken) return null;
    if (style === "chessapp") {
      const pick = this.applyHybrid();
      const mv = pick?.pvUci[0] ?? line.split(/\s+/)[1];
      const chosen = mv && mv !== "(none)" ? mv : null;
      this.emit({
        status: "ready",
        bestMove: chosen,
        planSan: pick?.pvSan ?? null,
        chosenMultipv: pick?.multipv ?? null,
      });
      return chosen;
    }
    const mv = line.split(/\s+/)[1];
    this.emit({ status: "ready", bestMove: mv && mv !== "(none)" ? mv : null });
    return mv && mv !== "(none)" ? mv : null;
  }

  async startAnalysis(fen: string, style: EngineStyle = "stockfish"): Promise<void> {
    const token = ++this.playToken;
    await this.stop();
    if (token !== this.playToken) return;

    this.configureAnalysis(style);
    this.setPosition(fen);
    this.emit({
      status: "analyzing",
      lines: [],
      bestMove: null,
      depth: 0,
      scoreText: "…",
      winPctWhite: null,
      drawPct: null,
      expectedPctWhite: null,
      planSan: null,
      chosenMultipv: null,
    });
    this.send("go infinite");
  }

  async evaluatePosition(
    fen: string,
    depth = 12,
    style: EngineStyle = "stockfish",
  ): Promise<{ pawns: number | null; best: string | null; winPctWhite: number | null; expectedPctWhite: number | null }> {
    const token = ++this.playToken;
    await this.stop();
    if (token !== this.playToken) {
      return { pawns: null, best: null, winPctWhite: null, expectedPctWhite: null };
    }
    this.configureAnalysis(style);
    this.send("setoption name MultiPV value 1");
    this.setPosition(fen);
    this.emit({ status: "analyzing" });
    await this.waitFor(
      (l) => l.startsWith("bestmove"),
      () => this.send(`go depth ${depth}`),
      15000,
    );
    return {
      pawns: this.info.scorePawns,
      best: this.info.bestMove,
      winPctWhite: this.info.winPctWhite,
      expectedPctWhite: this.info.expectedPctWhite,
    };
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
