/**
 * Sprite'y — mapy znakowe + paleta (konwencja z kurkarurki).
 *
 * Każdy sprite to wiersze znaków → fillRect per piksel na offscreen
 * canvas. Cache: jeden canvas per (sprite, kolor slota); obrót robi
 * ctx.rotate przy rysowaniu (imageSmoothing off = chunky, NES-owo).
 */

export const PLAYER_COLORS = ['#00e5ff', '#ffcc00', '#f83800', '#7dff5a'];

const SHIP = [
  '....W....',
  '...CWC...',
  '...CCC...',
  '..CCCCC..',
  '.CCECECC.',
  '.CCCCCCC.',
  'WC.....CW',
  'W.......W',
];

const PILOT = [
  '..HHH..',
  '.HHHHH.',
  '..HHH..',
  'JBBBBBJ',
  'J.BBB.J',
  'J.BLB.J',
  '...L...',
  '..L.L..',
];

const PAL_SHIP: Record<string, string> = {
  W: '#fcfcfc',   // biel: nos/skrzydła
  C: '',          // kolor gracza — podstawiany
  E: '#f83800',   // kokpit
};

const PAL_PILOT: Record<string, string> = {
  H: '#ffcc00',   // hełm
  B: '',          // skafander — kolor gracza
  J: '#7a7a9e',   // jetpack (boki)
  L: '#3a3a5c',   // nogi
};

const cache = new Map<string, HTMLCanvasElement>();

function raster(rows: string[], pal: Record<string, string>, color: string): HTMLCanvasElement {
  const w = rows[0].length, h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const p = pal[ch];
      c.fillStyle = p === '' ? color : p;
      c.fillRect(x, y, 1, 1);
    }
  });
  return cv;
}

/** Sprite statku w kolorze gracza (pivot = środek, "patrzy" w górę). */
export function shipSprite(slot: number): HTMLCanvasElement {
  const key = `ship:${slot}`;
  let cv = cache.get(key);
  if (!cv) {
    cv = raster(SHIP, PAL_SHIP, PLAYER_COLORS[slot] ?? '#fcfcfc');
    cache.set(key, cv);
  }
  return cv;
}

/** Sprite pilota na jetpacku (pivot = środek, "patrzy" w górę). */
export function pilotSprite(slot: number): HTMLCanvasElement {
  const key = `pilot:${slot}`;
  let cv = cache.get(key);
  if (!cv) {
    cv = raster(PILOT, PAL_PILOT, PLAYER_COLORS[slot] ?? '#fcfcfc');
    cache.set(key, cv);
  }
  return cv;
}
