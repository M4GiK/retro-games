// Headless test symulacji — core/ jest czystym TS bez DOM, więc bundlujemy
// test przez esbuild i odpalamy w node. Weryfikacja dla ticketu A.
//   npm run test:sim
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(mkdtempSync(join(tmpdir(), 'jetman-test-')), 'case.mjs');
await esbuild.build({
  entryPoints: ['test/case.ts'],
  bundle: true,
  write: true,
  outfile: out,
  format: 'esm',
  platform: 'node',
  target: 'es2020',
  logLevel: 'warning',
});
await import(pathToFileURL(out).href);
