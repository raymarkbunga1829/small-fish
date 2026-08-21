import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules", "stockfish", "bin");
const destDir = join(root, "public", "engine");
const files = [
  "stockfish-18-lite-single.js",
  "stockfish-18-lite-single.wasm",
];

mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const from = join(srcDir, file);
  if (!existsSync(from)) {
    console.error(`Missing engine file: ${from}`);
    process.exit(1);
  }
  copyFileSync(from, join(destDir, file));
}

console.log("Copied Stockfish 18 lite-single engine to public/engine/");
