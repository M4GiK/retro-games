/**
 * Atlas sprite'ów pixel-art + rasteryzer.
 *
 * Sprite'y są zdefiniowane jako mapy znakowe — każdy znak wiersza
 * to jeden "piksel" sprite'a, a paleta tłumaczy znak na kolor.
 * Rasteryzer drawSprite() maluje je po siatce fillRect-ów
 * (wzorzec: sprite atlas + dane zamiast kodu).
 */
import type { PowerupType } from '../core/types';

/** Paleta sprite'a: znak -> kolor CSS. Brak wpisu = piksel przezroczysty. */
export type Palette = Record<string, string>;

/**
 * Rasteryzuje sprite'a z mapy znakowej na canvasie.
 *
 * @param ctx  kontekst 2D
 * @param rows wiersze sprite'a (znaki kluczy palety)
 * @param pal  paleta znak -> kolor
 * @param cx   środek sprite'a X
 * @param cy   środek sprite'a Y
 * @param px   skala piksela sprite'a (2 = standard, 3 = duże encje)
 * @param flip odbicie w poziomie (zmiana kierunku patrzenia)
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  pal: Palette,
  cx: number, cy: number,
  px = 2, flip = false,
): void {
  const hgt = rows.length;
  const wid = rows[0].length;
  const ox = Math.round(cx - (wid * px) / 2);
  const oy = Math.round(cy - (hgt * px) / 2);
  for (let r = 0; r < hgt; r++) {
    for (let c = 0; c < wid; c++) {
      const col = pal[rows[r][c]];
      if (!col) continue;
      const dx = flip ? wid - 1 - c : c;
      ctx.fillStyle = col;
      ctx.fillRect(ox + dx * px, oy + r * px, px, px);
    }
  }
}

// ---- Sprite'y ----

/** Kurka gracza (Robcio). */
export const CHICKEN = [
  '.....RRR.......',
  '....WWWWW......',
  '...WWWWWWW.....',
  '..WWWEWWWWWO...',
  '..WWWWWWWWWO...',
  '.WWWWWWWWWWW...',
  '.WWSSWWWWWWW...',
  '..WSSWWWWWW....',
  '...WWWWWWWW....',
  '....WWWWWW.....',
  '.....WWWW......',
];
export const CHICKEN_PAL: Palette = {
  W: '#fcfcfc', S: '#b0b0b0', R: '#f83800', O: '#f8b800', E: '#000000',
};

/** Duszek kurki — ta sama sylwetka (CHICKEN) w eterycznej, błękitnej palecie. */
export const GHOST_PAL: Palette = {
  W: '#e0f4ff', S: '#a0d0e8', R: '#f8b0b0', O: '#f8e0b0', E: '#405060',
};

/** Lis zwrócony w LEWO: spiczaste uszy z czarnymi końcami, nosek (N),
 *  biały policzek i puszysty ogon z białym koniuszkiem uniesiony nad zad. */
export const FOX = [
  '.N....N.........TTT',
  '.ND...ND.......TTT.',
  '.DDD.DDD.......TTD.',
  '.DDDDDDDD......TDD.',
  'NDDDNDDDDDD..DDDDD.',
  '.DDTTDDDDDDDDDDDDD.',
  '..DTDDDDDDDDDDDDD..',
  '...DDDDDDDDDDDDD...',
  '....DD..DD...DD....',
  '....BB..BB...BB....',
];
export const FOX_PAL: Palette = { D: '#f87858', T: '#fcfcfc', N: '#000000', B: '#000000' };

/** Jajko do zebrania. */
export const EGG = [
  '..WWWW..',
  '.WWWWWW.',
  'WWWWWWWW',
  'WWWWWWWW',
  'WSWWWWWW',
  'WWWWWWWW',
  '.WWWWWW.',
  '..WWWW..',
];

/** Mini-serce 7x6 — ikona żyć na pasku statusu. */
export const HEART = [
  '.RR.RR.',
  'RRRRRRR',
  'RRRRRRR',
  '.RRRRR.',
  '..RRR..',
  '...R...',
];
export const HEART_PAL: Palette = { R: '#ff0055' };

/** Spadający kamień. */
export const ROCK = [
  '..GGGGGG..',
  '.GGGGGGGG.',
  'GGgGGGGGGG',
  'GGGGGGgGGG',
  'GgGGGGGGGG',
  'GGGGGGGGGG',
  '.GGgGGGGg.',
  '..GGGGGG..',
];
export const ROCK_PAL: Palette = { G: '#a8a8a8', g: '#686868' };

/** Spadający ptak (wariacja przeszkody). */
export const BIRD = [
  '...BB.BB..',
  '..BBBBBB..',
  '.BBBBBBBB.',
  '..BBBBB...',
  '...B...B..',
];
export const BIRD_PAL: Palette = { B: '#302838' };

/** Pająk — wariacja przeszkody na arenie bossa. */
export const SPIDER = [
  '..SSSSSS..',
  '.SSSSSSSS.',
  'SSSSSSSSSS',
  'S.SSSSSS.S',
  'S..SSSS..S',
  '..S.SS.S..',
  '.S..SS..S.',
];
export const SPIDER_PAL: Palette = { S: '#483858' };

/** Kulka power-upa + glif 5×5 w środku. */
export const ORB = [
  '....PPPP....',
  '..PPPPPPPP..',
  '.PPPPPPPPPP.',
  '.PPPPPPPPPP.',
  'PPPPPPPPPPPP',
  'PPPPPPPPPPPP',
  'PPPPPPPPPPPP',
  '.PPPPPPPPPP.',
  '.PPPPPPPPPP.',
  '..PPPPPPPP..',
  '....PPPP....',
];

/** Kolory kulki power-upa per typ bonusu. */
export const POWERUP_COLORS: Record<PowerupType, string> = {
  life: '#f83800', shield: '#3cbcfc', magnet: '#f8d800', slow: '#a838f8', double: '#f8b800',
};

/** Glify 5×5 rysowane w środku kulki — piktogram rodzaju bonusu. */
export const POWERUP_GLYPHS: Record<PowerupType, string[]> = {
  life:   ['XX.XX', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
  shield: ['XXXXX', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
  magnet: ['XX.XX', 'XX.XX', 'X...X', 'X...X', 'XXXXX'],
  slow:   ['XXXXX', '.XXX.', '..X..', '.XXX.', 'XXXXX'],
  double: ['..X..', '.XXX.', '..X..', '.XXX.', 'XXXXX'],
};

/** Chmura tła. */
export const CLOUD = [
  '....CCCCCC....',
  '..CCCCCCCCCC..',
  'CCCCCCCCCCCCCC',
];

/** Krzak dekoracyjny na ziemi. */
export const BUSH = [
  '...GG.GG...',
  '..GGGGGGG..',
  '.GGGGGGGGG.',
  'GGGGGGGGGGG',
];

/** Kurnik — meta poziomu przygody (kurka wraca do kurnika). */
export const COOP = [
  '..........RRRR..........',
  '........RRRRRRRR........',
  '......RRRRRRRRRRRR......',
  '....RRRRRRRRRRRRRRRR....',
  '..RRRRRRRRRRRRRRRRRRRR..',
  '..WWWWWWWWWWWWWWWWWWWW..',
  '..WwWwWwWwWwWwWwWwWwWw..',
  '..WwWwWwWwWwWwWwWwWwWw..',
  '..WwWwWwWDDDDWwWwWwWwW..',
  '..WwWwWwWDDDDWwWwWwWwW..',
  '..WwWwWwWDDDDWwWwWwWwW..',
  '..WwWwWwWDDDDWwWwWwWwW..',
  '..WWWWWWWWDDDDWWWWWWWW..',
  '..WWWWWWWWDDDDWWWWWWWW..',
];
export const COOP_PAL: Palette = {
  R: '#f83800', W: '#f8b800', w: '#a05a18', D: '#302010',
};

/** Koszyczek ze złotymi jajkami — stoi przy kurniku na mecie. */
export const BASKET = [
  '..GG...GG...GG..',
  '.GGGG.GGGG.GGGG.',
  'KKKKKKKKKKKKKKKK',
  'KkKkKkKkKkKkKkKk',
  'KkKkKkKkKkKkKkKk',
  '.KKKKKKKKKKKKKK.',
  '..KKKKKKKKKKKK..',
];
export const BASKET_PAL: Palette = { G: '#f8d800', K: '#c84c0c', k: '#7c2800' };
