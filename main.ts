// Seven Skies Airline — the hand-in program (Node 22, standard library only).
//
// The game itself is plain static files under game/: one HTML page and its ES
// modules, no build step, no network request. This program stages the entry in
// the output directory and writes dossier.json there with the kit's vendored
// library, which is the summary the judge reads. It runs twice in grading and
// both runs must write the same bytes, so it does nothing time-dependent and
// never writes into the repository.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The scorer's own caps, from the kit: the dossier text is capped at 160 KiB,
// screenshots at 4 files of 256 KiB each, game/ at 993 files and 48 MiB with no
// path over 1,000 bytes. Anything over a cap is refused here first, so a bad
// entry fails loudly on my machine instead of silently at the gate.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Remove every entry inside dir, but never dir itself: the grader's /output
// is a bind mount, so deleting it fails with EBUSY ("Device or resource busy").
// Clearing only the contents keeps the "no stale files" guarantee while the
// mount point itself always survives.
function clearDirContents(dir) {
  mkdirSync(dir, { recursive: true });
  // Each child is removed individually (recursive, so a stale game/ or
  // screenshots/ directory from an earlier run goes too); dir itself is
  // never passed to rmSync.
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

function stageEntry(repoRoot, outDir) {
  // Start from an empty output directory so a stale file from an earlier run
  // can never survive into the entry (the scorer caps screenshots at four,
  // and a leftover fifth would fail the gate). The clear runs before any
  // copy below, so a stale screenshot is removed even if the new copy
  // writes fewer files than the previous run did.
  clearDirContents(outDir);
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  const shotsDir = join(repoRoot, 'screenshots');
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
  }
}

function writeDossier(outDir) {
  const dossier = buildDossier(outDir, DOSSIER_LIMITS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
}

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
stageEntry(repoRoot, outDir);
writeDossier(outDir);
