import type { Chess, Square } from "chess.js";
import type { EngineInfo, MoveComment, Tab } from "../types";
import { Board } from "../components/Board";
import { PlayerRow } from "../components/PlayerRow";
import { GameTab } from "../components/GameTab";
import { AnalysisTab } from "../components/AnalysisTab";
import { GraphTab } from "../components/GraphTab";
import { BottomChrome } from "../components/BottomChrome";
import { GameOverBanner } from "../components/Overlays";

interface Props {
  chess: Chess;
  flipped: boolean;
  lastFrom: string | null;
  lastTo: string | null;
  bestMove: string | null;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  showLastMove: boolean;
  interactive: boolean;
  white: string;
  black: string;
  turn: "w" | "b";
  whiteMs: number;
  blackMs: number;
  showClocks: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  ply: number;
  moves: import("chess.js").Move[];
  comments: MoveComment[];
  evals: Array<number | null>;
  engine: EngineInfo;
  banner: string | null;
  onMove: (from: Square, to: Square, promotion?: string) => boolean;
  onFlip: () => void;
  onNeedPromotion: (from: Square, to: Square, color: "w" | "b") => void;
  onJump: (ply: number) => void;
  onMore: () => void;
}

export function PlayScreen(props: Props) {
  return (
    <div className="play">
      <Board
        chess={props.chess}
        flipped={props.flipped}
        lastFrom={props.lastFrom}
        lastTo={props.lastTo}
        bestMove={props.bestMove}
        showCoordinates={props.showCoordinates}
        showLegalMoves={props.showLegalMoves}
        showLastMove={props.showLastMove}
        interactive={props.interactive}
        onMove={props.onMove}
        onFlip={props.onFlip}
        onNeedPromotion={props.onNeedPromotion}
      />
      <PlayerRow
        white={props.white}
        black={props.black}
        turn={props.turn}
        whiteMs={props.whiteMs}
        blackMs={props.blackMs}
        showClocks={props.showClocks}
      />
      <GameOverBanner text={props.banner} />
      <div className="panel">
        {props.tab === "game" && (
          <GameTab
            moves={props.moves}
            ply={props.ply}
            comments={props.comments}
            onJump={props.onJump}
          />
        )}
        {props.tab === "analysis" && (
          <AnalysisTab info={props.engine} onMore={props.onMore} />
        )}
        {props.tab === "graph" && (
          <GraphTab
            evals={props.evals}
            ply={props.ply}
            totalPlies={props.moves.length}
            comments={props.comments}
            onJump={props.onJump}
          />
        )}
      </div>
      <BottomChrome
        tab={props.tab}
        onTab={props.onTab}
        ply={props.ply}
        total={props.moves.length}
        onJump={props.onJump}
        onMore={props.onMore}
      />
    </div>
  );
}
