// Headless repro widoku gościa po śmierci — bundluje test/guest.ts
// przez esbuild i odpala w node. Weryfikacja bugu "player 2 nie widzi
// swojego statku po zginięciu".
//   npm run test:guest
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(mkdtempSync(join(tmpdir(), 'jetman-guest-')), 'guest.mjs');
await esbuild.build({
  entryPoints: ['test/guest.ts'],
  bundle: true,
  write: true,
  outfile: out,
  format: 'esm',
  platform: 'node',
  target: 'es2020',
  logLevel: 'warning',
  // Testy nie potrzebują TURN — wstrzyknij null (fallback STUN).
  define: { __TURN_ICE__: 'null' },
});
await import(pathToFileURL(out).href);
