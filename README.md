# SmallFish

A mobile-first chess PWA in the spirit of iOS SmallFish (Ted Wong / SmallChess).
Play against Stockfish or analyze games on a clean 2D board.
Uses full Stockfish 18 single-thread (NNUE). The wasm is loaded from jsDelivr (~108MB first visit).
Lite-single is an automatic fallback if the full engine fails to start or the WASM aborts.
No accounts, no database, no ads. Games live in localStorage.
## Run
Install deps then start the dev script on port 8080.
Open http://localhost:8080
## Engine files
copy-engine.mjs copies stockfish-18-single.js plus lite-single js/wasm into public/engine/.
The full stockfish-18-single.wasm is not copied (GitHub and Vercel Hobby cap files at 100MB); it is fetched from jsDelivr.
Served as static files, not bundled by Vite. Talks UCI in a worker.
## Features
- Play vs computer, two players, clocks, difficulty presets
- Analysis with MultiPV, eval, PV, best-move arrow, eval graph
- Engine styles: Stockfish (cp), AlphaZero (win%), Chess App (hybrid on Stockfish 18)
- Game list, PGN import/export, takeback, flip, dark mode, PWA
## Stack
Vite + React 19 + TypeScript. chess.js. vite-plugin-pwa. vercel.json.
