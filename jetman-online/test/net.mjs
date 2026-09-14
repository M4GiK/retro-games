// Headless test netcode'u — dwóch graczy przez transport lokalny
// (BroadcastChannel, ten sam kod co w przeglądarce). Weryfikuje:
//   1. Host tworzy pokój, gość dołącza kodem
//   2. Gość dostaje slot 1, obaj widzą 2 graczy w lobby
//   3. Loadout gościa propaguje się do hosta
//   4. Host startuje rundę — obaj dostają onStart
//   5. Input gościa dociera do hosta (ack/seq)
//   6. Wyjście gościa zwalnia slot
//   npm run test:net
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(mkdtempSync(join(tmpdir(), 'jetman-net-')), 'net.mjs');
await esbuild.build({
  entryPoints: ['test/net.ts'],
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
