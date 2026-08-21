import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import type {
  EngineInfo,
  EngineStyle,
  GameMode,
  MoveComment,
  PieceSymbol,
  SavedGame,
  Screen,
  Settings,
  Tab,
} from "./types";
import { ENGINE_NAME, ENGINE_STYLE_LABEL, ENGINE_STYLES, PLAYER_NAME, STYLE_ENGINE_NAMES } from "./types";
import { friendlyEngineError, pawnsToWinPct, StockfishEngine } from "./engine/Engine";
import { cloneAtPly, classifySwing, endReason, loadGame, resultOf, uciToMove } from "./lib/chessUtil";
import { SAMPLE_GAME } from "./lib/sample";
import {
  loadGames,
  loadLastGame,
  loadSettings,
  saveGames,
  saveLastGame,
  saveSettings,
  todayStamp,
  uid,
} from "./lib/storage";
import { PlayScreen } from "./screens/PlayScreen";
import { GameListScreen } from "./screens/GameListScreen";
import { OptionsScreen } from "./screens/OptionsScreen";
import { MoreMenu } from "./components/MoreMenu";
import { PromotionPicker } from "./components/PromotionPicker";
import { ImportPgn, Toast } from "./components/Overlays";

function namesFor(mode: GameMode, style: EngineStyle): { white: string; black: string } {
  const engine = STYLE_ENGINE_NAMES[style];
  if (mode === "white") return { white: PLAYER_NAME, black: engine };
  if (mode === "black") return { white: engine, black: PLAYER_NAME };
  return { white: "White", black: "Black" };
}

function graphValue(style: EngineStyle, info: { scorePawns: number | null; winPctWhite: number | null; expectedPctWhite: number | null }): number | null {
  if (style === "chessapp") {
    return info.expectedPctWhite ?? info.winPctWhite ?? pawnsToWinPct(info.scorePawns);
  }
  if (style === "alphazero") {
    return info.winPctWhite ?? pawnsToWinPct(info.scorePawns);
  }
  return info.scorePawns;
}

function timeMs(tc: Settings["timeControl"]): number {
  if (tc === "5+0") return 5 * 60 * 1000;
  if (tc === "10+0") return 10 * 60 * 1000;
  return 0;
}

function exportPgn(chess: Chess, comments: MoveComment[]): string {
  const headers = chess.getHeaders();
  const lines: string[] = [];
  for (const [k, v] of Object.entries(headers)) {
    if (v) lines.push(`[${k} "${v}"]`);
  }
  lines.push("");
  const moves = chess.history({ verbose: true });
  const byPly = new Map(comments.map((c) => [c.ply, c]));
  const bits: string[] = [];
  moves.forEach((m, i) => {
    const nag = byPly.get(i);
    const extra = nag ? `${m.san}${nag.nag}` : m.san;
    if (m.color === "w") bits.push(`${Math.floor(i / 2) + 1}.${extra}`);
    else bits.push(extra);
  });
  const result = headers.Result || "*";
  bits.push(result);
  lines.push(bits.join(" "));
  return lines.join("\n");
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>("play");
  const [tab, setTab] = useState<Tab>("game");
  const [pgn, setPgn] = useState("");
  const [ply, setPly] = useState(-1);
  const [white, setWhite] = useState(PLAYER_NAME);
  const [black, setBlack] = useState(ENGINE_NAME);
  const [event, setEvent] = useState("Casual Game");
  const [comments, setComments] = useState<MoveComment[]>([]);
  const [evals, setEvals] = useState<Array<number | null>>([]);
  const [flipped, setFlipped] = useState(false);
  const [games, setGames] = useState<SavedGame[]>(() => {
    const stored = loadGames();
    if (stored.length) return stored;
    return [SAMPLE_GAME];
  });
  const [engineInfo, setEngineInfo] = useState<EngineInfo>({
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
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square; color: "w" | "b" } | null>(null);
  const [whiteMs, setWhiteMs] = useState(0);
  const [blackMs, setBlackMs] = useState(0);
  const [clockOn, setClockOn] = useState(false);
  const [manualResult, setManualResult] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  const engineRef = useRef<StockfishEngine | null>(null);
  const busyRef = useRef(false);
  const toastTimer = useRef<number>(0);
  const styleRef = useRef(settings.engineStyle);
  styleRef.current = settings.engineStyle;

  const flash = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  };

  const full = useMemo(() => loadGame(pgn).chess, [pgn]);
  const moves = useMemo(() => full.history({ verbose: true }), [full]);
  const view = useMemo(() => cloneAtPly(pgn, ply), [pgn, ply]);
  const lastMove = ply >= 0 ? moves[ply] : undefined;
  const atTip = ply === moves.length - 1 || (moves.length === 0 && ply === -1);
  const reason = manualResult
    ? manualResult
    : endReason(full);
  const over = !!reason && atTip;

  const engineTurn = useMemo(() => {
    if (settings.gameMode === "human") return false;
    if (over) return false;
    if (reviewing) return false;
    if (!atTip) return false;
    const turn = view.turn();
    if (settings.gameMode === "white") return turn === "b";
    return turn === "w";
  }, [settings.gameMode, over, reviewing, atTip, view]);

  const applyHeaders = (game: Chess, w: string, b: string, ev: string, result: string) => {
    game.setHeader("Event", ev);
    game.setHeader("Site", "SmallFish");
    game.setHeader("Date", todayStamp().replaceAll(".", "."));
    game.setHeader("White", w);
    game.setHeader("Black", b);
    game.setHeader("Result", result);
  };

  const commitPgn = (game: Chess, nextPly?: number) => {
    applyHeaders(game, white, black, event, resultOf(game));
    const next = game.pgn();
    setPgn(next);
    setPly(nextPly ?? game.history().length - 1);
  };

  const newGame = useCallback(
    (mode = settings.gameMode) => {
      const n = namesFor(mode, settings.engineStyle);
      const g = new Chess();
      applyHeaders(g, n.white, n.black, "Casual Game", "*");
      setWhite(n.white);
      setBlack(n.black);
      setEvent("Casual Game");
      setPgn(g.pgn());
      setPly(-1);
      setComments([]);
      setEvals([]);
      setManualResult(null);
      setFlipped(mode === "black");
      const ms = timeMs(settings.timeControl);
      setWhiteMs(ms);
      setBlackMs(ms);
      setClockOn(ms > 0);
      setScreen("play");
      setTab("game");
    },
    [settings.gameMode, settings.timeControl, settings.engineStyle],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => setSystemDark(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const engine = STYLE_ENGINE_NAMES[settings.engineStyle];
    const prior = new Set(Object.values(STYLE_ENGINE_NAMES));
    if (settings.gameMode === "white" && prior.has(black) && black !== engine) setBlack(engine);
    if (settings.gameMode === "black" && prior.has(white) && white !== engine) setWhite(engine);
  }, [settings.engineStyle, settings.gameMode, white, black]);

  useEffect(() => {
    saveGames(games);
  }, [games]);

  useEffect(() => {
    saveLastGame({
      pgn,
      ply,
      white,
      black,
      event,
      comments,
      evals,
      clocks: { whiteMs, blackMs },
    });
  }, [pgn, ply, white, black, event, comments, evals, whiteMs, blackMs]);

  useEffect(() => {
    const last = loadLastGame();
    if (last?.pgn) {
      setPgn(last.pgn);
      setPly(last.ply);
      setWhite(last.white);
      setBlack(last.black);
      setEvent(last.event);
      setComments(last.comments ?? []);
      setEvals(last.evals ?? []);
      if (last.clocks) {
        setWhiteMs(last.clocks.whiteMs);
        setBlackMs(last.clocks.blackMs);
      }
    } else {
      newGame();
    }
    const stored = loadGames();
    if (!stored.length) setGames([SAMPLE_GAME]);

    const engine = new StockfishEngine();
    engineRef.current = engine;
    const unsub = engine.subscribe(setEngineInfo);
    engine.load().catch((err: unknown) => {
      console.error(err);
    });
    return () => {
      unsub();
      engine.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryEngine = async () => {
    const eng = engineRef.current;
    if (!eng) return;
    try {
      await eng.load();
      eng.setStyle(styleRef.current);
      if (tab === "analysis" || analyzing) {
        await eng.startAnalysis(view.fen(), styleRef.current);
      }
    } catch {
      flash("Engine unavailable");
    }
  };

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.snapshot.status === "error") {
      void retryEngine();
      return;
    }
    eng.setStyle(settings.engineStyle);
    // Style taps only — retryEngine reads latest tab/analyzing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.engineStyle]);

  const playEngine = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng || busyRef.current) return;
    const pos = cloneAtPly(pgn, ply);
    if (pos.isGameOver()) return;
    busyRef.current = true;
    try {
      const style = styleRef.current;
      const uci = await eng.playMove(pos.fen(), settings.difficulty, 900, style);
      if (!uci) return;
      const parsed = uciToMove(uci);
      if (!parsed) return;
      const tip = loadGame(pgn).chess;
      const mv = tip.move(parsed);
      if (!mv) return;
      const nextEvals = evals.slice();
      const gv = graphValue(style, eng.snapshot);
      if (gv != null) nextEvals[tip.history().length - 1] = gv;
      setEvals(nextEvals);
      commitPgn(tip);
    } catch {
      flash("Engine busy — try again");
    } finally {
      busyRef.current = false;
    }
  }, [pgn, ply, settings.difficulty, evals, white, black, event]);

  useEffect(() => {
    if (engineTurn && engineInfo.status !== "loading" && engineInfo.status !== "error" && !analyzing) {
      void playEngine();
    }
  }, [engineTurn, engineInfo.status, analyzing, playEngine, pgn]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (tab !== "analysis" && !analyzing) return;
    void eng.startAnalysis(view.fen(), styleRef.current).catch(() => {
      flash("Analysis paused");
    });
    return () => {
      void eng.stop().catch(() => undefined);
    };
  }, [tab, ply, pgn, analyzing, settings.engineStyle]);

  useEffect(() => {
    if (!clockOn || over) return;
    const id = window.setInterval(() => {
      const turn = view.turn();
      if (turn === "w") {
        setWhiteMs((ms) => {
          const n = ms - 100;
          if (n <= 0) {
            setManualResult("Black wins on time");
            setClockOn(false);
            return 0;
          }
          return n;
        });
      } else {
        setBlackMs((ms) => {
          const n = ms - 100;
          if (n <= 0) {
            setManualResult("White wins on time");
            setClockOn(false);
            return 0;
          }
          return n;
        });
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [clockOn, over, view]);

  const dark = settings.followSystemTheme ? systemDark : settings.darkMode;

  const makeMove = (from: Square, to: Square, promotion?: string): boolean => {
    if (engineTurn || reviewing) return false;
    const base = atTip ? loadGame(pgn).chess : cloneAtPly(pgn, ply);
    const mv = base.move({ from, to, promotion });
    if (!mv) return false;
    if (!atTip) {
      setComments((cs) => cs.filter((c) => c.ply <= ply));
      setEvals((es) => es.slice(0, ply + 1));
    }
    commitPgn(base);
    return true;
  };

  const onNeedPromotion = (from: Square, to: Square, color: "w" | "b") => {
    setPromo({ from, to, color });
  };

  const jump = (next: number) => {
    const max = moves.length - 1;
    if (moves.length === 0) {
      setPly(-1);
      return;
    }
    setPly(Math.max(-1, Math.min(max, next)));
  };

  const takeback = () => {
    const tip = loadGame(pgn).chess;
    const hist = tip.history({ verbose: true });
    if (!hist.length) return;
    const twice = settings.gameMode !== "human" && hist.length >= 2;
    tip.undo();
    if (twice) tip.undo();
    setComments((cs) => cs.filter((c) => c.ply < tip.history().length));
    setEvals((es) => es.slice(0, tip.history().length));
    setManualResult(null);
    commitPgn(tip);
  };

  const saveCurrent = () => {
    const g = loadGame(pgn).chess;
    applyHeaders(g, white, black, event, manualResult?.includes("White") ? "1-0" : manualResult?.includes("Black") ? "0-1" : resultOf(g));
    const rec: SavedGame = {
      id: uid(),
      white,
      black,
      date: todayStamp(),
      result: g.getHeaders().Result || "*",
      event,
      pgn: exportPgn(g, comments),
    };
    setGames((list) => [rec, ...list.filter((x) => x.id !== SAMPLE_GAME.id || list.length > 1)]);
    flash("Game saved");
  };

  const copyPgn = async () => {
    const text = exportPgn(full, comments);
    try {
      await navigator.clipboard.writeText(text);
      flash("PGN copied");
    } catch {
      flash("Copy failed");
    }
  };

  const downloadPgn = () => {
    const text = exportPgn(full, comments);
    const blob = new Blob([text], { type: "application/x-chess-pgn" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "smallfish.pgn";
    a.click();
    URL.revokeObjectURL(a.href);
    flash("PGN downloaded");
  };

  const importPgn = (text: string) => {
    const loaded = loadGame(text);
    if (!loaded.ok && !loaded.moves.length) {
      flash("Could not parse PGN");
      return;
    }
    const h = loaded.chess.getHeaders();
    setWhite(h.White || "White");
    setBlack(h.Black || "Black");
    setEvent(h.Event || "Imported");
    setPgn(loaded.chess.pgn());
    setPly(loaded.moves.length - 1);
    setComments([]);
    setEvals([]);
    setManualResult(null);
    setClockOn(false);
    setImportOpen(false);
    setScreen("play");
    flash("PGN imported");
  };

  const resign = () => {
    const loser = view.turn() === "w" ? "White" : "Black";
    const winner = loser === "White" ? "Black" : "White";
    setManualResult(`${winner} wins by resignation`);
    setClockOn(false);
    const g = loadGame(pgn).chess;
    g.setHeader("Result", winner === "White" ? "1-0" : "0-1");
    setPgn(g.pgn());
    setScreen("play");
  };

  const drawGame = () => {
    setManualResult("Draw by agreement");
    setClockOn(false);
    const g = loadGame(pgn).chess;
    g.setHeader("Result", "1/2-1/2");
    setPgn(g.pgn());
    setScreen("play");
  };

  const toggleAnalyze = async () => {
    const eng = engineRef.current;
    if (!eng) return;
    try {
      if (analyzing) {
        await eng.stop();
        setAnalyzing(false);
        if (tab === "analysis") setTab("game");
      } else {
        setAnalyzing(true);
        setTab("analysis");
        await eng.startAnalysis(view.fen(), styleRef.current);
      }
    } catch {
      flash("Analysis paused");
      setAnalyzing(false);
    }
  };

  const blunderCheck = async () => {
    const eng = engineRef.current;
    if (!eng || reviewing) return;
    setReviewing(true);
    setTab("graph");
    flash("Checking the game…");
    const hist = moves;
    const found: MoveComment[] = [];
    const scores: Array<number | null> = [];
    try {
      for (let i = 0; i < hist.length; i++) {
        const before = cloneAtPly(pgn, i - 1);
        const after = cloneAtPly(pgn, i);
        const style = styleRef.current;
        const a = await eng.evaluatePosition(before.fen(), 10, style);
        const b = await eng.evaluatePosition(after.fen(), 10, style);
        if (b.pawns != null || b.winPctWhite != null || b.expectedPctWhite != null) {
          scores[i] = graphValue(style, {
            scorePawns: b.pawns,
            winPctWhite: b.winPctWhite,
            expectedPctWhite: b.expectedPctWhite,
          });
        }
        if (a.pawns != null && b.pawns != null) {
          const mover = hist[i].color;
          const loss = mover === "w" ? a.pawns - b.pawns : b.pawns - a.pawns;
          const nag = classifySwing(loss);
          if (nag) {
            found.push({
              ply: i,
              nag,
              text: `${loss > 0 ? "−" : "+"}${Math.abs(loss).toFixed(2)}`,
            });
          }
        }
        setEvals(scores.slice());
        setPly(i);
      }
      setComments(found);
      flash(found.length ? `${found.length} annotations` : "No blunders found");
    } catch {
      flash("Blunder check stopped");
    } finally {
      setReviewing(false);
    }
  };

  const onMoreAction = (id: string) => {
    switch (id) {
      case "new":
        newGame();
        break;
      case "flip":
        setFlipped((f) => !f);
        break;
      case "takeback":
        takeback();
        break;
      case "copy":
        void copyPgn();
        break;
      case "import":
        setImportOpen(true);
        break;
      case "save":
        saveCurrent();
        break;
      case "games":
        setScreen("games");
        break;
      case "options":
        setScreen("options");
        break;
      case "analyze":
        void toggleAnalyze();
        break;
      case "blunder":
        void blunderCheck();
        break;
      case "engine":
        setSettings((s) => {
          const i = ENGINE_STYLES.indexOf(s.engineStyle);
          return { ...s, engineStyle: ENGINE_STYLES[(i + 1) % ENGINE_STYLES.length] };
        });
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== "play") return;
      if (e.key === "ArrowLeft") jump(ply - 1);
      if (e.key === "ArrowRight") jump(ply + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const displayEngine: EngineInfo = {
    ...engineInfo,
    error: friendlyEngineError(engineInfo.error),
  };

  const engineLabel =
    displayEngine.status === "error"
      ? "Unavailable"
      : displayEngine.identity || "Stockfish 18";

  return (
    <div className={`app ${dark ? "dark" : "light"}`}>
      <div className="phone">
        {screen === "play" && (
          <PlayScreen
            chess={view}
            flipped={flipped}
            lastFrom={lastMove?.from ?? null}
            lastTo={lastMove?.to ?? null}
            bestMove={analyzing || tab === "analysis" ? engineInfo.bestMove : null}
            showCoordinates={settings.showCoordinates}
            showLegalMoves={settings.showLegalMoves}
            showLastMove={settings.showLastMove}
            interactive={!engineTurn && !over && !reviewing}
            white={white}
            black={black}
            turn={view.turn()}
            whiteMs={whiteMs}
            blackMs={blackMs}
            showClocks={settings.timeControl !== "none"}
            tab={tab}
            onTab={(t) => {
              setTab(t);
              setAnalyzing(t === "analysis");
            }}
            ply={ply}
            moves={moves}
            comments={comments}
            evals={evals}
            engine={displayEngine}
            engineStyle={settings.engineStyle}
            banner={over ? reason : null}
            onMove={makeMove}
            onFlip={() => setFlipped((f) => !f)}
            onNeedPromotion={onNeedPromotion}
            onJump={jump}
            onMore={() => setMoreOpen(true)}
            onEngineStyle={(engineStyle) => {
              styleRef.current = engineStyle;
              setSettings((s) => ({ ...s, engineStyle }));
            }}
            onRetryEngine={() => void retryEngine()}
          />
        )}
        {screen === "games" && (
          <GameListScreen
            games={games}
            onBack={() => setScreen("play")}
            onLoad={(g, p) => {
              importPgn(g.pgn);
              setPly(p);
              setWhite(g.white);
              setBlack(g.black);
              setEvent(g.event);
            }}
            onDelete={(id) => setGames((list) => list.filter((x) => x.id !== id))}
          />
        )}
        {screen === "options" && (
          <OptionsScreen
            settings={settings}
            engineLabel={engineLabel}
            onChange={setSettings}
            onDone={() => setScreen("play")}
            onImport={() => {
              setScreen("play");
              setImportOpen(true);
            }}
            onExport={() => {
              void copyPgn();
              downloadPgn();
            }}
            onNewGame={() => newGame()}
            onResign={resign}
            onDraw={drawGame}
            engineError={displayEngine.status === "error"}
            onRetryEngine={() => void retryEngine()}
          />
        )}
      </div>
      <MoreMenu
        open={moreOpen}
        analyzing={analyzing}
        engineName={ENGINE_STYLE_LABEL[settings.engineStyle]}
        onClose={() => setMoreOpen(false)}
        onAction={onMoreAction}
      />
      {promo && (
        <PromotionPicker
          color={promo.color}
          onPick={(p: PieceSymbol) => {
            makeMove(promo.from, promo.to, p);
            setPromo(null);
          }}
          onCancel={() => setPromo(null)}
        />
      )}
      <ImportPgn
        open={importOpen}
        value={importText}
        onChange={setImportText}
        onClose={() => setImportOpen(false)}
        onImport={() => importPgn(importText)}
      />
      <Toast text={toast} />
    </div>
  );
}
