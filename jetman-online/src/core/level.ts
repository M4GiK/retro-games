/**
 * Poziomy — mutowalny teren TILE=4px (szczegółowe podłoże: pociski
 * wydrążają drobne kratery). Mapy ręczne są pisane znakami ×2
 * (jeden znak = 2×2 kafelki — zachowują skalę sprzed zmiany TILE).
 * Mapa "głębia" jest generowana proceduralnie (cellular automata +
 * korytarze + jeziora/klej/śnieg) — ma kilka ekranów wielkości.
 *
 * Znaki mapy (przed skalowaniem):
 *   '#'  skała niszczalna (tiles=1)
 *   'X'  skała twarda / ramka świata (tiles=2 — nie do zniszczenia)
 *   '.'  pusto
 *   'w'  woda   's' śnieg   'g' klej  (strefy, niesolidne)
 *   '0'-'3'  baza/spawn gracza na slocie N
 */

import { TILE } from './config';
import { makeRng, nextFloat } from './rng';
import { ZONE_GLUE, ZONE_NONE, ZONE_SNOW, ZONE_WATER, type ZoneId } from './types';

export interface LevelData {
  name: string;
  w: number;                    // szerokość w kafelkach
  h: number;                    // wysokość w kafelkach
  tiles: Uint8Array;            // 0 pusto, 1 skała, 2 skała twarda
  zones: Uint8Array;            // ZoneId per kafelek
  spawns: { x: number; y: number }[];  // środek bazy w px, per slot
  /** Oryginalne/zrekonstruowane rows — referencja/debug. */
  rows: string[];
}

const ZONE_CHAR: Record<string, ZoneId> = { w: ZONE_WATER, s: ZONE_SNOW, g: ZONE_GLUE };

/**
 * Parsuj mapę znakową; `scale` = ile kafelków na znak (2 = stara skala
 * 8px zapisywana przy TILE=4).
 */
function parse(rows: string[], name: string, scale = 2): LevelData {
  const w = rows[0].length * scale;
  const h = rows.length * scale;
  if (rows.some(r => r.length * scale !== w)) {
    throw new Error(`Poziom "${name}": nierówne wiersze`);
  }
  const tiles = new Uint8Array(w * h);
  const zones = new Uint8Array(w * h);
  const spawns: { x: number; y: number }[] = [];
  rows.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      const c = row[tx];
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const i = (ty * scale + sy) * w + tx * scale + sx;
          if (c === '#') tiles[i] = 1;
          else if (c === 'X') tiles[i] = 2;
          else {
            const z = ZONE_CHAR[c];
            if (z) zones[i] = z;
          }
        }
      }
      if (c >= '0' && c <= '3') {
        spawns[+c] = {
          x: (tx * scale + scale / 2) * TILE,
          y: (ty * scale + scale / 2) * TILE,
        };
      }
    }
  });
  return { name, w, h, tiles, zones, spawns, rows };
}

/** Czy piksel (px,py) jest w solidnym kafelku. Poza światem = solid. */
export function isSolid(level: LevelData, px: number, py: number): boolean {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return true;
  return level.tiles[ty * level.w + tx] > 0;
}

/** Strefa w pikselu (ZONE_NONE gdy brak / poza światem). */
export function zoneAt(level: LevelData, px: number, py: number): ZoneId {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return ZONE_NONE;
  return level.zones[ty * level.w + tx] as ZoneId;
}

/**
 * Wydrąż koło w skale (eksplozja/karabin). Zwraca indeksy zmienionych
 * komórek — idą w SimEvent 'terrain' do gości i do redrawu rendera.
 * Skała twarda (2) jest nieniszczalna.
 */
export function carveCircle(level: LevelData, px: number, py: number, r: number): number[] {
  const cells: number[] = [];
  const t0x = Math.max(0, Math.floor((px - r) / TILE));
  const t1x = Math.min(level.w - 1, Math.floor((px + r) / TILE));
  const t0y = Math.max(0, Math.floor((py - r) / TILE));
  const t1y = Math.min(level.h - 1, Math.floor((py + r) / TILE));
  for (let ty = t0y; ty <= t1y; ty++) {
    for (let tx = t0x; tx <= t1x; tx++) {
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      const dx = cx - px, dy = cy - py;
      if (dx * dx + dy * dy > r * r) continue;
      const i = ty * level.w + tx;
      if (level.tiles[i] === 1) {
        level.tiles[i] = 0;
        cells.push(i);
      }
    }
  }
  return cells;
}

/** Gość aplikuje diff terenu od hosta (te same indeksy co carveCircle). */
export function applyTerrain(level: LevelData, cells: number[]): void {
  for (const i of cells) level.tiles[i] = 0;
}

/** Punkt spawnu nad bazą gracza (kafelki wyżej, w powietrzu). */
export function spawnPoint(level: LevelData, slot: number): { x: number; y: number } {
  const s = level.spawns[slot] ?? { x: level.w * TILE / 2, y: level.h * TILE / 2 };
  return { x: s.x, y: s.y - TILE * 2 };
}

/** Rozmiar świata w px. */
export function worldSize(level: LevelData): { w: number; h: number } {
  return { w: level.w * TILE, h: level.h * TILE };
}

// ---- Generator dużej mapy (deterministyczny, seed) ----

/**
 * Jaskinie przez automat komórkowy: szum skały ~46% → 5 iteracji
 * wygładzania → komnaty baz w rogach → korytarze do środka →
 * jeziora/klej/śnieg na podłogach. Wynik: kilka ekranów terenu.
 */
function genCaves(seed: number, w: number, h: number, name: string): LevelData {
  const rngState = { rng: makeRng(seed) };
  const rnd = () => nextFloat(rngState);
  const at = (x: number, y: number) => y * w + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  let tiles = new Uint8Array(w * h);
  const zones = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x < 3 || y < 3 || x >= w - 3 || y >= h - 3;
      tiles[at(x, y)] = border ? 2 : rnd() < 0.48 ? 1 : 0;
    }
  }
  // Wygładzanie: >=5 solidnych w oknie 3×3 (łącznie z komórką) → skała.
  for (let it = 0; it < 5; it++) {
    const nt = tiles.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (tiles[at(x, y)] === 2) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!inb(x + dx, y + dy) || tiles[at(x + dx, y + dy)] > 0) n++;
          }
        }
        nt[at(x, y)] = n >= 5 ? 1 : 0;
      }
    }
    tiles = nt;
  }

  // Bazy: komnaty w 4 rogach (slot 0=LG, 1=PD, 2=PG, 3=LD).
  const spawns: { x: number; y: number }[] = [];
  const bases = [
    { tx: 14, ty: 10 }, { tx: w - 14, ty: h - 10 },
    { tx: w - 14, ty: 10 }, { tx: 14, ty: h - 10 },
  ];
  for (let s = 0; s < 4; s++) {
    const b = bases[s];
    for (let y = b.ty - 5; y <= b.ty + 4; y++) {
      for (let x = b.tx - 8; x <= b.tx + 8; x++) {
        if (inb(x, y) && tiles[at(x, y)] !== 2) tiles[at(x, y)] = 0;
      }
    }
    // Podłoga komnaty.
    for (let x = b.tx - 8; x <= b.tx + 8; x++) tiles[at(x, b.ty + 4)] = 1;
    spawns[s] = { x: b.tx * TILE, y: b.ty * TILE };
  }

  // Korytarze: baza → środek mapy, losowy marsz z wiertłem 3×3.
  const dig = (x0: number, y0: number, x1: number, y1: number) => {
    let x = x0, y = y0, guard = w * h;
    while ((Math.abs(x - x1) > 3 || Math.abs(y - y1) > 3) && guard-- > 0) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (inb(x + dx, y + dy) && tiles[at(x + dx, y + dy)] === 1) {
            tiles[at(x + dx, y + dy)] = 0;
          }
        }
      }
      const dx = Math.sign(x1 - x), dy = Math.sign(y1 - y);
      if (rnd() < 0.7) x += dx; else y += dy;
      if (rnd() < 0.15) { x += dx === 0 ? 1 : -dx; y += dy === 0 ? 1 : -dy; }
    }
  };
  for (const b of bases) dig(b.tx, b.ty, w >> 1, h >> 1);
  // Poprzeczne korytarze między bazami — alternatywne trasy.
  dig(bases[0].tx, bases[0].ty, bases[3].tx, bases[3].ty);
  dig(bases[2].tx, bases[2].ty, bases[1].tx, bases[1].ty);

  // Strefy: podłogi (pusto nad skałą) → jeziora/klej/śnieg.
  const floorRuns: { x0: number; x1: number; y: number }[] = [];
  for (let y = 4; y < h - 4; y++) {
    let run = -1;
    for (let x = 3; x < w - 3; x++) {
      const floor = tiles[at(x, y)] === 0 && tiles[at(x, y + 1)] > 0;
      if (floor && run < 0) run = x;
      if (!floor && run >= 0) {
        if (x - run >= 6) floorRuns.push({ x0: run, x1: x - 1, y });
        run = -1;
      }
    }
    if (run >= 0 && w - 3 - run >= 6) floorRuns.push({ x0: run, x1: w - 4, y });
  }
  const pickRun = (): { x0: number; x1: number; y: number } | undefined =>
    floorRuns.length ? floorRuns.splice((rnd() * floorRuns.length) | 0, 1)[0] : undefined;
  for (let i = 0; i < 8; i++) {          // jeziora: wypełnij rynienkę wodą
    const r = pickRun(); if (!r) break;
    for (let x = r.x0; x <= r.x1; x++) {
      for (let dy = 0; dy >= -3; dy--) {
        if (tiles[at(x, r.y + dy)] === 0) zones[at(x, r.y + dy)] = ZONE_WATER;
      }
    }
  }
  for (let i = 0; i < 6; i++) {          // klej: pasma na podłodze
    const r = pickRun(); if (!r) break;
    for (let x = r.x0; x <= Math.min(r.x1, r.x0 + 6); x++) zones[at(x, r.y)] = ZONE_GLUE;
  }
  for (let i = 0; i < 8; i++) {          // śnieg: płatki nad podłogą
    const r = pickRun(); if (!r) break;
    for (let x = r.x0; x <= r.x1; x++) {
      for (let dy = -1; dy >= -3; dy--) {
        if (tiles[at(x, r.y + dy)] === 0 && rnd() < 0.6) {
          zones[at(x, r.y + dy)] = ZONE_SNOW;
        }
      }
    }
  }

  // Zrekonstruowane rows (znak per kafelek) — referencja/debug.
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const t = tiles[at(x, y)];
      row += t === 2 ? 'X' : t === 1 ? '#' : '.';
    }
    rows.push(row);
  }
  return { name, w, h, tiles, zones, spawns, rows };
}

// ---- Poziomy ----

const CLASSIC = parse([
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '.0............................1.',
  '#####......................#####',
  '#####......................#####',
  '####........................####',
  '####........................####',
  '###..........######..........###',
  '###..........######..........###',
  '##...........######...........##',
  '##..........########..........##',
  '##..........########..........##',
  '##.........##########.........##',
  '#..........##########..........#',
  '#.........############.........#',
  '#.........############.........#',
  '#.........############.........#',
  '##.......##############.......##',
  '##......################......##',
  '###....##################....###',
  '################################',
  '################################',
  '.2............................3.',
  '................................',
  '................................',
  '................................',
], 'klasyk');

// Jaskinia 64×30 znaków ×2 = 128×60 kafelków = 512×240 px (2 ekrany
// w bok): jezioro wody pośrodku, klej i śnieg w niższych korytarzach.
const CAVES = parse([
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'X0.............................................................X',
  'X#####.........................................................X',
  'X#####......................######.............................X',
  'X####......................########.................####.......X',
  'X###......................##########......##.......######......X',
  'X##......................############....####.....########.....X',
  'X#.......................############....####....##########....X',
  'X........######..........##########......##......##########....X',
  'X.......########..........########...............##########....X',
  'X.......########...........######.................########.....X',
  'X......##########............####..........####....######......X',
  'X......##########.............##..........######....####.......X',
  'X.....############........................######.....##........X',
  'X.....############........wwwwww..........######...............X',
  'X.....############.......wwwwwwwww.........####.......######...X',
  'X.....############......wwwwwwwwwww.........##......########...X',
  'X......##########......wwwwwwwwwwwww...............##########..X',
  'X.......########.......wwwwwwwwwwwww........###....##########..X',
  'X........######........wwwwwwwwwwwww.......#####...##########..X',
  'X.......................wwwwwwwwwww.......#####....##########..X',
  'X........................wwwwwwwww........#####.....########...X',
  'X.....####................wwwwwww.........#####......######....X',
  'X....######................wwwww..........#####......gggg......X',
  'X...########................www...........#####.....ggggggg....X',
  'X...#########...............w.............#####....ggggggggg...X',
  'X3..##########..........................########...ggggggggg.1.X',
  'X##############################################################X',
  'X##############################################################X',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
], 'jaskinie');

// Wielka procedura: ~190×130 kafelków = ~760×520 px (~3×2 ekranu).
const DEEP = genCaves(20240, 190, 130, 'głębia');

export const LEVELS: LevelData[] = [CLASSIC, CAVES, DEEP];
