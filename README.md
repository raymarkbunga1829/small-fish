# SmallFish

A mobile-first chess PWA in the spirit of iOS SmallFish (Ted Wong / SmallChess).
Play against Stockfish or analyze games on a clean 2D board.
Uses Stockfish 18 lite single-thread by default.
Lite is still Stockfish 18. The large wasm is optional later.
No accounts, no database, no ads. Games live in localStorage.
## Run
Install deps then start the dev script on port 8080.
Open http://localhost:8080
## Engine files
copy-engine.mjs copies lite-single js and wasm into public/engine/
Served as static files, not bundled by Vite. Talks UCI in a worker.
## Features
- Play vs computer, two players, clocks, difficulty presets
- Analysis with MultiPV, eval, PV, best-move arrow, eval graph
- Engine styles: Stockfish (cp), AlphaZero (win%), Chess App (hybrid on Stockfish 18)
- Game list, PGN import/export, takeback, flip, dark mode, PWA
## Stack
Vite + React 19 + TypeScript. chess.js. vite-plugin-pwa. vercel.json.
