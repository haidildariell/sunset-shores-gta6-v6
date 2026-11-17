// Sunset Shores — entry program (Node 22, standard library only).
// Hands the game in: copies game/ and screenshots/ from this repository
// into /output and writes /output/dossier.json with the kit's own library,
// vendor/makefun-game.ts. Run it as:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output; the grader
// runs it twice and both runs must write the same bytes.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's caps for this competition (reference/gate.json): game/ at
// most 993 files and directories and 48 MiB, index.html at most 1 MiB, 3-4
// screenshots at most 256 KiB each, dossier at most 1.5 MiB. Refuse early
// here, before the grader does, with a readable error.
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 48 * 1024 * 1024;
const SHOT_MAX = 4;
const SHOT_MAX_BYTES = 256 * 1024;

function walk(dir) {
  let files = 0, bytes = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      files += 1;
      const sub = walk(p);
      files += sub.files; bytes += sub.bytes;
    } else if (st.isFile()) {
      files += 1; bytes += st.size;
    }
  }
  return { files, bytes };
}

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

const gameSize = walk(gameDir);
if (gameSize.files > GAME_MAX_FILES) throw new Error(`game/ has ${gameSize.files} entries, cap ${GAME_MAX_FILES}`);
if (gameSize.bytes > GAME_MAX_BYTES) throw new Error(`game/ is ${gameSize.bytes} bytes, cap ${GAME_MAX_BYTES}`);
if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing');
if (statSync(join(gameDir, 'index.html')).size > 1024 * 1024) throw new Error('game/index.html is over 1 MiB');

const shots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')) : [];
if (shots.length < 3 || shots.length > SHOT_MAX) throw new Error(`screenshots/ holds ${shots.length} images, need 3 or 4`);
for (const s of shots) {
  const size = statSync(join(shotsDir, s)).size;
  if (size > SHOT_MAX_BYTES) throw new Error(`screenshots/${s} is ${size} bytes, cap ${SHOT_MAX_BYTES}`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
