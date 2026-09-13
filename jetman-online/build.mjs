// Buduje grę do JEDNEGO pliku HTML w dist/ (JS zbundlowany i wstawiony inline).
//   node build.mjs          -> produkcyjny, zminifikowany: dist/jetman.html
//   node build.mjs --watch  -> dev, bez minifikacji + sourcemap: dist/jetman-dev.html
import esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');
const outName = dev ? 'jetman-dev.html' : 'jetman.html';
const MARKER = '<!-- GAME_BUNDLE -->';
// Muzyka osadzana w pliku wynikowym (offline) — mp3 jako data URI, per ekran.
const MUSIC_FILES = {
  __MUSIC_SRC_MENU__: 'assets/Last_Frame_of_Glory.mp3',    // menu/lobby
  __MUSIC_SRC_GAME__: 'assets/Thrusters_at_Maximum.mp3',   // runda
};

async function writeHtml(js) {
  let html = await readFile('src/index.html', 'utf8');
  for (const [marker, file] of Object.entries(MUSIC_FILES)) {
    let src = '';
    try {
      const mp3 = await readFile(file);
      src = 'data:audio/mpeg;base64,' + mp3.toString('base64');
    } catch {
      console.warn(`[build] brak ${file} — gra wystartuje bez muzyki`);
    }
    html = html.replace(marker, () => src);
  }
  html = html.replace(MARKER, () => `<script>\n${js}</script>`);
  if (html.includes(MARKER)) throw new Error(`Brak znacznika ${MARKER} w src/index.html`);
  await mkdir('dist', { recursive: true });
  await writeFile(`dist/${outName}`, html);
  // index.html = ta sama gra — serwowanie dist/ pokazuje ją od razu na /
  if (!dev) await writeFile('dist/index.html', html);
  console.log(`[build] dist/${outName} (${(html.length / 1024).toFixed(0)} KB)`);
}

const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  logLevel: 'warning',
};

if (watch) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{
      name: 'inline-html',
      setup(b) {
        b.onEnd(async (result) => {
          if (!result.errors.length) await writeHtml(result.outputFiles[0].text);
        });
      },
    }],
  });
  await ctx.watch();
  console.log('[watch] obserwuję src/ — otwórz dist/jetman-dev.html w przeglądarce');
} else {
  const result = await esbuild.build(options);
  await writeHtml(result.outputFiles[0].text);
}
