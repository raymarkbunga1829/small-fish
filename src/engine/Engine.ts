import { Chess } from "chess.js";
import type { Difficulty, EngineInfo, EngineStatus, EngineStyle, PvLine, Wdl } from "../types";
import { DIFFICULTY_ELO } from "../types";
import { movesToSanLine } from "../lib/chessUtil";
import { pickHybridLine, resolveFen, wdlExpectedWhite } from "./hybrid";

const FULL_JS = "/engine/stockfish-18-single.js";
const FULL_WASM = "https://cdn.jsdelivr.net/npm/stockfish@18.0.8/bin/stockfish-18-single.wasm";
const LITE_JS = "/engine/stockfish-18-lite-single.js";

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

/** AlphaZero-style expected score (0..1 from the side to move perspective). */
function expectedScore(line: PvLine, turn: "w" | "b"): number {
  if (line.wdl) {
    const stm = (line.wdl.w + 0.5 * line.wdl.d) / 1000;
    return turn === "w" ? stm : 1 - stm;
  }
  if (line.mate !== null) {
    const whiteMate = turn === "w" ? line.mate : -line.mate;
    return whiteMate > 0 ? 0.99 : 0.01;
  }
  const pawns = ((line.scoreCp ?? 0) / 100) * (turn === "w" ? 1 : -1);
  return 1 / (1 + Math.exp(-pawns / 2.8));
}

/** Soft selection of a PV line based on expected win probability (AlphaZero-like). */
export function pickAlphaZeroLine(lines: PvLine[], turn: "w" | "b"): PvLine | null {
  if (!lines.length) return null;
  const scores = lines.map((l) => expectedScore(l, turn));
  // Mild temperature so near-equal lines can compete
  const T = 0.85;
  const maxS = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - maxS) / T));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  const probs = exps.map((e) => e / sum);
  let best = 0;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[best]) best = i;
  }
  return lines[best];
}

export function firstSan(pvSan: string): string {
  const m = pvSan.trim().match(/^(?:\d+\.\s*)?(\S+)/);
  return m?.[1] ?? pvSan.trim();
}

/** Never surface raw WASM / RuntimeError strings in the UI. */
export function friendlyEngineError(message: string | null | undefined): string | null {
  if (!message) return null;
  if (/RuntimeError|Unreachable|n\.apply\s*\(\s*null/i.test(message)) {
    return "Engine restarted. Try again.";
  }
  return message;
}

const FRIENDLY_RESTART = "Engine restarted. Try again.";

export class StockfishEngine {
  private worker: Worker | null = null;
  private listeners = new Set<EngineListener>();
  private lineWaiters: Array<(line: string) => void> = [];
  private info: EngineInfo = { ...EMPTY_INFO };
  private currentFen = "startpos";
  private currentTurn: "w" | "b" = "w";
  private playToken = 0;
  private loadToken = 0;
  private style: EngineStyle = "stockfish";
  private searching = false;
  private mutex: Promise<void> = Promise.resolve();
  private recovering = false;
  private flavor: "full" | "lite" = "full";

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

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.mutex.then(fn, fn);
    this.mutex = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private pokeStop(): void {
    if (this.searching && this.worker) this.send("stop");
  }

  private recoverFromAbort(): void {
    if (this.recovering) return;
    this.recovering = true;
    if (this.flavor === "full") this.flavor = "lite";
    void this.load()
      .then(() => {
        this.recovering = false;
      })
      .catch(() => {
        this.recovering = false;
        this.emit({ status: "error", error: FRIENDLY_RESTART });
      });
  }

  setStyle(style: EngineStyle): void {
    this.style = style;
  }

  async load(): Promise<void> {
    const token = ++this.loadToken;
    this.playToken += 1;
    this.lineWaiters = [];
    this.searching = false;

    const tryFlavor = async (lite: boolean): Promise<void> => {
      this.flavor = lite ? "lite" : "full";
      this.emit({ status: "loading", error: null, identity: "Stockfish 18" });
      if (this.worker) {
        try {
          this.send("quit");
        } catch {
          /* ignore */
        }
        this.worker.terminate();
        this.worker = null;
      }
      const workerSrc = lite ? LITE_JS : FULL_JS + "#" + encodeURIComponent(FULL_WASM);
      this.worker = new Worker(workerSrc);
      this.worker.onerror = () => {
        this.searching = false;
        this.recoverFromAbort();
      };
      const channel = new MessageChannel();
      channel.port1.onmessage = (ev) => {
        const d = ev.data;
        if (!d || typeof d !== "object" || !("percent" in d)) return;
        const pct = Math.round(Number(d.percent) * 100);
        if (Number.isFinite(pct) && pct >= 0) {
          this.emit({ status: "loading", identity: pct > 0 ? `Stockfish 18 · ${pct}%` : "Stockfish 18" });
        }
      };
      let progressPortSent = false;
      this.worker.onmessage = (ev: MessageEvent<unknown>) => {
        if (typeof ev.data === "object" && ev.data && "percent" in ev.data) return;
        if (typeof ev.data !== "string") return;
        const line = ev.data.trim();
        if (!line) return;
        if (line.includes("WillOutputEngineDownloadProgress")) {
          if (!progressPortSent) {
            progressPortSent = true;
            try {
              this.worker?.postMessage({ progressPort: channel.port2 }, [channel.port2]);
            } catch {
              /* port already transferred */
            }
          }
          return;
        }
        try {
          this.handleLine(line);
        } catch {
          /* never break the worker message pump */
        }
      };
      this.worker.postMessage("setoption name CanOutputEngineDownloadProgress");

      await this.waitFor((l) => l === "uciok", () => this.send("uci"), lite ? 30000 : 180000);
      if (token !== this.loadToken) return;
      await this.waitFor((l) => l === "readyok", () => this.send("isready"), 15000);
      if (token !== this.loadToken) return;
      this.send("setoption name Hash value 16");
      this.send("setoption name Threads value 1");
      this.send("setoption name Ponder value false");
      this.recovering = false;
      const raw = (this.info.identity || "Stockfish 18").replace(/ · \d+%$/, "").replace(/ \(lite fallback\)$/, "");
      const name = raw.includes("Stockfish") ? raw : "Stockfish 18";
      this.emit({
        status: "ready",
        identity: lite ? `${name} (lite fallback)` : name,
        error: null,
      });
    };

    try {
      if (this.flavor === "full") {
        try {
          await tryFlavor(false);
          return;
        } catch {
          if (token !== this.loadToken) return;
          this.flavor = "lite";
        }
      }
      await tryFlavor(true);
    } catch (err) {
      if (token !== this.loadToken) return;
      const message = this.recovering
        ? FRIENDLY_RESTART
        : friendlyEngineError(err instanceof Error ? err.message : "Engine failed to start") ||
          FRIENDLY_RESTART;
      this.emit({ status: "error", error: message });
      throw err;
    }
  }

  private handleLine(line: string): void {
    if (line.startsWith("id name")) {
      const name = line.slice("id name".length).trim();
      const base = name.includes("Stockfish") ? name : "Stockfish 18";
      this.emit({ identity: this.flavor === "lite" ? `${base} (lite fallback)` : base });
    }
    for (const w of this.lineWaiters.slice()) {
      try {
        w(line);
      } catch {
        /* waiter must not break the pump */
      }
    }
    if (line.startsWith("info ")) {
      try {
        this.parseInfo(line);
      } catch {
        /* bad info line */
      }
    }
    if (line.startsWith("bestmove ")) {
      this.searching = false;
      try {
        const mv = line.split(/\s+/)[1] ?? null;
        const engineBest = mv && mv !== "(none)" ? mv : null;
        if (this.style === "chessapp") {
          let pick: PvLine | null = null;
          try {
            pick = this.applyHybrid();
          } catch {
            pick = null;
          }
          this.emit({
            bestMove: pick?.pvUci[0] ?? engineBest,
            planSan: pick?.pvSan ?? this.info.planSan,
            chosenMultipv: pick?.multipv ?? this.info.chosenMultipv,
          });
        } else if (this.style === "alphazero") {
          let pick: PvLine | null = null;
          try {
            pick = pickAlphaZeroLine(this.info.lines, this.currentTurn);
          } catch {
            pick = null;
          }
          this.emit({
            bestMove: pick?.pvUci[0] ?? engineBest,
            planSan: pick?.pvSan ?? this.info.planSan,
            chosenMultipv: pick?.multipv ?? this.info.chosenMultipv,
          });
        } else {
          this.emit({ bestMove: engineBest });
        }
      } catch {
        const mv = line.split(/\s+/)[1] ?? null;
        this.emit({ bestMove: mv && mv !== "(none)" ? mv : null });
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
    try {
      this.parseInfoInner(line);
    } catch {
      /* a bad PV / hybrid score must not break onmessage */
    }
  }

  private parseInfoInner(line: string): void {
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
    let pvSan = "";
    try {
      pvSan = movesToSanLine(resolveFen(this.currentFen), pvUci);
    } catch {
      pvSan = pvUci.join(" ");
    }
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
      try {
        const pick = pickHybridLine(this.currentFen, lines, this.currentTurn);
        if (pick) {
          bestMove = pick.pvUci[0] ?? bestMove;
          planSan = pick.pvSan;
          chosenMultipv = pick.multipv;
        }
      } catch {
        /* keep Stockfish top line */
      }
    } else if (this.style === "alphazero") {
      try {
        const pick = pickAlphaZeroLine(lines, this.currentTurn);
        if (pick) {
          bestMove = pick.pvUci[0] ?? bestMove;
          planSan = pick.pvSan;
          chosenMultipv = pick.multipv;
        }
      } catch {
        /* keep Stockfish top line */
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

  private async stopUnlocked(): Promise<void> {
    if (!this.worker) {
      this.searching = false;
      return;
    }
    if (this.searching) {
      try {
        await this.waitFor(
          (l) => l.startsWith("bestmove"),
          () => this.send("stop"),
          4000,
        );
      } catch {
        this.send("stop");
      }
      this.searching = false;
    }
    try {
      await this.waitFor((l) => l === "readyok", () => this.send("isready"), 4000);
    } catch {
      this.send("isready");
    }
  }

  async stop(): Promise<void> {
    this.pokeStop();
    try {
      await this.exclusive(() => this.stopUnlocked());
    } catch {
      this.send("isready");
      this.searching = false;
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
    // Both AlphaZero and Chess App benefit from multiple candidate lines
    this.send("setoption name MultiPV value 3");
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
    this.pokeStop();
    return this.exclusive(async () => {
      try {
        await this.stopUnlocked();
        if (token !== this.playToken) return null;
        this.style = style;

        // AlphaZero and Chess App both use MultiPV so we can soft-select
        if (style === "chessapp" || style === "alphazero") {
          const elo = DIFFICULTY_ELO[difficulty];
          this.send("setoption name MultiPV value 3");
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
        this.searching = true;
        const line = await this.waitFor(
          (l) => l.startsWith("bestmove"),
          () => this.send(`go movetime ${movetime + extra}`),
          20000,
        );
        this.searching = false;
        if (token !== this.playToken) return null;

        if (style === "chessapp") {
          let pick: PvLine | null = null;
          try {
            pick = this.applyHybrid();
          } catch {
            pick = null;
          }
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

        if (style === "alphazero") {
          let pick: PvLine | null = null;
          try {
            pick = pickAlphaZeroLine(this.info.lines, this.currentTurn);
          } catch {
            pick = null;
          }
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
      } catch {
        this.searching = false;
        this.send("isready");
        if (token === this.playToken) this.emit({ status: "ready" });
        return null;
      }
    });
  }

  async startAnalysis(fen: string, style: EngineStyle = "stockfish"): Promise<void> {
    const token = ++this.playToken;
    this.pokeStop();
    return this.exclusive(async () => {
      try {
        await this.stopUnlocked();
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
        this.searching = true;
        this.send("go depth 16");
      } catch {
        this.searching = false;
        this.send("isready");
        if (token === this.playToken) this.emit({ status: "analyzing" });
      }
    });
  }

  async evaluatePosition(
    fen: string,
    depth = 12,
    style: EngineStyle = "stockfish",
  ): Promise<{ pawns: number | null; best: string | null; winPctWhite: number | null; expectedPctWhite: number | null }> {
    const empty = { pawns: null, best: null, winPctWhite: null, expectedPctWhite: null };
    const token = ++this.playToken;
    this.pokeStop();
    return this.exclusive(async () => {
      try {
        await this.stopUnlocked();
        if (token !== this.playToken) return empty;
        this.configureAnalysis(style);
        this.send("setoption name MultiPV value 1");
        this.setPosition(fen);
        this.emit({ status: "analyzing" });
        this.searching = true;
        await this.waitFor(
          (l) => l.startsWith("bestmove"),
          () => this.send(`go depth ${depth}`),
          15000,
        );
        this.searching = false;
        if (token !== this.playToken) return empty;
        return {
          pawns: this.info.scorePawns,
          best: this.info.bestMove,
          winPctWhite: this.info.winPctWhite,
          expectedPctWhite: this.info.expectedPctWhite,
        };
      } catch {
        this.searching = false;
        this.send("isready");
        if (token === this.playToken) this.emit({ status: "ready" });
        return empty;
      }
    });
  }

  destroy(): void {
    this.playToken += 1;
    this.loadToken += 1;
    this.lineWaiters = [];
    this.searching = false;
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
