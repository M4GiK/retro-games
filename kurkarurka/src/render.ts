// Renderowanie w estetyce NES/Pegasus: stała rozdzielczość 256×240,
// sprite'y pixel-art, kafelkowe tło, dithering, scanliny CRT, zero AA.
import * as Matter from 'matter-js';
import {
  GROUND_H, VIEW_W, VIEW_H, world, gameState, activeEffects,
  eggs, enemies, fallingObstacles, powerups, particles, popups,
} from './state';
import type { PlayerData, EggData, EnemyData, FallingData, PowerupData, PowerupType } from './types';

const { Events } = Matter;

// ---- Paleta (zbliżona do NES) ----
const C = {
  sky: '#5c94fc',
  cloud: '#fcfcfc',
  hill: '#00a800',
  hillDark: '#005800',
  grass: '#00a800',
  grassLight: '#80d010',
  dirt: '#c84c0c',
  dirtDark: '#7c2800',
  black: '#000000',
  white: '#fcfcfc',
  dust: '#b8a888',
};

const now = () => performance.now();

// Demo/attract mode — animowane sprite'y na tle ekranów tytułu/menu.
let demoOn = false;
export function setDemo(on: boolean) { demoOn = on; }

// Wyłącza wygładzanie (ostre piksele) i podpina rysowanie sceny
// pod afterRender Matter.Render — fizyka jest niewidzialna, my rysujemy.
export function initRender() {
  const ctx = world.render.context;
  ctx.imageSmoothingEnabled = false;
  Events.on(world.render, 'afterRender', drawScene);
}

// ---- Renderer sprite'ów: mapa znaków -> fillRect po siatce ----
type Palette = Record<string, string>;

function drawSprite(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  pal: Palette,
  cx: number, cy: number,
  px = 2, flip = false,
) {
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
const CHICKEN = [
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
const CHICKEN_PAL: Palette = {
  W: '#fcfcfc', S: '#b0b0b0', R: '#f83800', O: '#f8b800', E: '#000000',
};

// Lis zwrócony w LEWO: spiczaste uszy z czarnymi końcami, nosek (N),
// biały policzek i puszysty ogon z białym koniuszkiem uniesiony nad zad.
const FOX = [
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
const FOX_PAL: Palette = { D: '#f87858', T: '#fcfcfc', N: '#000000', B: '#000000' };

const EGG = [
  '..WWWW..',
  '.WWWWWW.',
  'WWWWWWWW',
  'WWWWWWWW',
  'WSWWWWWW',
  'WWWWWWWW',
  '.WWWWWW.',
  '..WWWW..',
];

// Mini-serce 7x6 — ikona żyć na pasku statusu
const HEART = [
  '.RR.RR.',
  'RRRRRRR',
  'RRRRRRR',
  '.RRRRR.',
  '..RRR..',
  '...R...',
];
const HEART_PAL: Palette = { R: '#ff0055' };

const ROCK = [
  '..GGGGGG..',
  '.GGGGGGGG.',
  'GGgGGGGGGG',
  'GGGGGGgGGG',
  'GgGGGGGGGG',
  'GGGGGGGGGG',
  '.GGgGGGGg.',
  '..GGGGGG..',
];
const ROCK_PAL: Palette = { G: '#a8a8a8', g: '#686868' };

const BIRD = [
  '...BB.BB..',
  '..BBBBBB..',
  '.BBBBBBBB.',
  '..BBBBB...',
  '...B...B..',
];
const BIRD_PAL: Palette = { B: '#302838' };

// Kulka power-upa + glif 5×5
const ORB = [
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
const POWERUP_COLORS: Record<PowerupType, string> = {
  life: '#f83800', shield: '#3cbcfc', magnet: '#f8d800', slow: '#a838f8', double: '#f8b800',
};
const POWERUP_GLYPHS: Record<PowerupType, string[]> = {
  life:   ['XX.XX', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
  shield: ['XXXXX', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
  magnet: ['XX.XX', 'XX.XX', 'X...X', 'X...X', 'XXXXX'],
  slow:   ['XXXXX', '.XXX.', '..X..', '.XXX.', 'XXXXX'],
  double: ['..X..', '.XXX.', '..X..', '.XXX.', 'XXXXX'],
};

const CLOUD = [
  '....CCCCCC....',
  '..CCCCCCCCCC..',
  'CCCCCCCCCCCCCC',
];
const BUSH = [
  '...GG.GG...',
  '..GGGGGGG..',
  '.GGGGGGGGG.',
  'GGGGGGGGGGG',
];

// Zapętla x w przedziale [-margin, w+margin] — dryf chmur i lisów w demo.
function wrapX(x: number, w: number, margin: number): number {
  const span = w + margin * 2;
  return ((x % span) + span) % span - margin;
}

// ---- Scena ----
// Pełna klatka: niebo, parallax, ziemia, encje, demo/HUD, cząsteczki,
// popupy, efekty power-upów i na końcu scanliny CRT.
function drawScene() {
  const ctx = world.render.context;
  const w = VIEW_W, h = VIEW_H;
  const ts = now();
  ctx.clearRect(0, 0, w, h);

  // Niebo — płaski kolor (brak gradientów, to 8-bit)
  ctx.fillStyle = C.sky;
  ctx.fillRect(0, 0, w, h);

  // Pikselowe słońce
  ctx.fillStyle = '#f8d800';
  ctx.fillRect(w - 44, 16, 16, 16);
  ctx.fillStyle = '#f8f878';
  ctx.fillRect(w - 40, 20, 8, 8);

  // Chmury — powolny dryf, wrap poza ekranem
  drawSprite(ctx, CLOUD, { C: C.cloud }, wrapX(30 + ts * 0.004, w, 40), 34, 2);
  drawSprite(ctx, CLOUD, { C: C.cloud }, wrapX(150 + ts * 0.0025, w, 40), 56, 1);

  // Wzgórza — schodkowe piramidy (jak w SMB), statyczne
  drawHill(ctx, 30, h - GROUND_H, 70, 22, C.hill);
  drawHill(ctx, 210, h - GROUND_H, 90, 30, C.hill);
  drawHill(ctx, 130, h - GROUND_H, 40, 14, C.hillDark);

  // Ziemia — kafelki 16px: wierzch trawy + ditheringowany dirt
  drawGround(ctx, w, h);

  // Krzaki
  drawSprite(ctx, BUSH, { G: C.hill }, 46, h - GROUND_H - 6, 1);
  drawSprite(ctx, BUSH, { G: C.hill }, 190, h - GROUND_H - 6, 1);

  // Encje
  for (const e of eggs) drawEgg(ctx, e);
  for (const p of powerups) drawPowerup(ctx, p);
  for (const o of fallingObstacles) drawFalling(ctx, o);
  for (const en of enemies) drawEnemy(ctx, en);
  drawChicken(ctx, world.player);

  // Demo attract-mode na ekranach menu
  if (demoOn) drawDemo(ctx, w, h, ts);

  // Pasek statusu NES — tylko w trakcie gry
  if (gameState.running) drawHUD(ctx, w);

  // Cząsteczki — kwadratowe piksele
  for (const p of particles) {
    const r = Math.max(1, Math.round((p.body.circleRadius || 2) * p.life));
    ctx.fillStyle = p.color === '#dust' ? C.dust : p.color;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillRect(Math.round(p.body.position.x) - r, Math.round(p.body.position.y) - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // Popupy — mała czcionka pikselowa
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.font = 'bold 8px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(p.text, Math.round(p.x) + 1, Math.round(p.y) + 1);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, Math.round(p.x), Math.round(p.y));
    ctx.globalAlpha = 1;
  }

  // Wizualizacja aktywnych efektów (pikselowe obramowania)
  if (activeEffects.shield > 0) {
    const px = Math.round(world.player.position.x), py = Math.round(world.player.position.y);
    ctx.fillStyle = '#3cbcfc';
    const blink = Math.sin(ts * 0.02) > 0;
    if (blink) {
      const r = 20;
      ctx.fillRect(px - r, py - r, r * 2, 1);
      ctx.fillRect(px - r, py + r, r * 2, 1);
      ctx.fillRect(px - r, py - r, 1, r * 2);
      ctx.fillRect(px + r, py - r, 1, r * 2);
    }
  }
  if (activeEffects.magnet > 0) {
    ctx.fillStyle = '#f83800';
    const px = Math.round(world.player.position.x), py = Math.round(world.player.position.y);
    const r = 34;
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.fillRect(px + cx * r - 2, py + cy * r - 2, 4, 1);
      ctx.fillRect(px + cx * r - 2, py + cy * r - 2, 1, 4);
    }
  }
  if (activeEffects.slowTime > 0) {
    ctx.fillStyle = 'rgba(168, 56, 248, 0.15)';
    ctx.fillRect(0, 0, w, h);
  }

  // Scanliny CRT + ramka
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 1; y < h; y += 2) ctx.fillRect(0, y, w, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, h - 1, w, 1);
  ctx.fillRect(0, 0, 1, h); ctx.fillRect(w - 1, 0, 1, h);
}

// Animowane demo: kurka biegnie i podskakuje, lisy przechodzą, złote jajko.
function drawDemo(ctx: CanvasRenderingContext2D, w: number, h: number, ts: number) {
  const gy = h - GROUND_H;

  // Lisy idące w lewo w różnych odstępach
  for (let i = 0; i < 3; i++) {
    const fx = wrapX(300 - ts * 0.028 + i * 95, w, 30);
    const fb = Math.round(Math.sin(ts * 0.012 + i * 2) * 1);
    drawSprite(ctx, FOX, FOX_PAL, fx, gy - 11 + fb, 2, false);
    ctx.fillStyle = '#302010';
    const lp = Math.sin(ts * 0.012 + i) > 0 ? 1 : -1;
    ctx.fillRect(Math.round(fx) - 12, Math.round(gy) - 6, 2, 4 + lp);
    ctx.fillRect(Math.round(fx) + 4, Math.round(gy) - 6, 2, 4 - lp);
  }

  // Kurka biegnie w prawo, co ~2.2 s podskakuje (łuk paraboliczny)
  const cx = wrapX(ts * 0.05, w, 24);
  const cyc = (ts % 2200) / 2200;
  const jumpY = cyc < 0.28 ? -Math.sin((cyc / 0.28) * Math.PI) * 20 : 0;
  const cy = gy - 12 + Math.round(jumpY);
  const walking = jumpY === 0;
  drawSprite(ctx, CHICKEN, CHICKEN_PAL, cx, cy, 2, false);
  ctx.fillStyle = '#f8b800';
  const lp = walking ? (Math.sin(ts * 0.02) > 0 ? 1 : -1) : 0;
  ctx.fillRect(Math.round(cx) - 5, Math.round(cy) + 11, 2, 4 + lp);
  ctx.fillRect(Math.round(cx) + 3, Math.round(cy) + 11, 2, 4 - lp);

  // Złote jajko unoszące się nad ziemią
  const ey = gy - 30 + Math.round(Math.sin(ts * 0.004) * 4);
  drawSprite(ctx, EGG, { W: '#f8d800', S: '#b08800' }, w * 0.7, ey, 2);
}

// Pasek statusu NES na górze obrazu: SC, serca, jajka, combo.
function drawHUD(ctx: CanvasRenderingContext2D, w: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, 15);
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(0, 15, w, 1);

  ctx.font = '8px "Press Start 2P", monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fcfcfc';
  ctx.fillText('SC' + String(gameState.score).padStart(6, '0'), 4, 4);

  for (let i = 0; i < Math.max(0, Math.min(5, gameState.lives)); i++) {
    drawSprite(ctx, HEART, HEART_PAL, 106 + i * 9, 7, 1);
  }

  drawSprite(ctx, EGG, { W: '#fcfcfc', S: '#b0b0b0' }, 170, 7, 1);
  ctx.fillStyle = '#fcfcfc';
  ctx.fillText('x' + gameState.collected, 178, 4);

  ctx.textAlign = 'right';
  ctx.fillStyle = gameState.combo > 1 ? '#ffcc00' : '#4a5a78';
  ctx.fillText('x' + gameState.combo, w - 4, 4);
  ctx.textAlign = 'left';
}

// Schodkowa piramida (wzgórze w stylu SMB)
function drawHill(ctx: CanvasRenderingContext2D, cx: number, baseY: number, w: number, h: number, color: string) {
  const step = 4;
  ctx.fillStyle = color;
  for (let y = 0; y < h; y += step) {
    const inset = Math.round(((y / h) * w) / 4);
    ctx.fillRect(cx - Math.round(w / 2) + inset, baseY - y - step, w - inset * 2, step);
  }
}

// Kafelki ziemi: trawa + dirt z deterministycznym ditheringiem
function drawGround(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const top = h - GROUND_H;
  ctx.fillStyle = C.dirt;
  ctx.fillRect(0, top, w, GROUND_H);

  // Dithering dirta — deterministyczne ziarno per kafelek 8px
  ctx.fillStyle = C.dirtDark;
  for (let ty = top + 8; ty < h; ty += 8) {
    for (let tx = 0; tx < w; tx += 8) {
      const seed = (tx * 31 + ty * 17) % 5;
      if (seed === 0) ctx.fillRect(tx + 1, ty + 2, 3, 2);
      if (seed === 2) ctx.fillRect(tx + 4, ty + 5, 2, 2);
      if (seed === 4) ctx.fillRect(tx + 5, ty + 1, 2, 3);
    }
  }

  // Wierzch trawy
  ctx.fillStyle = C.black;
  ctx.fillRect(0, top, w, 1);
  ctx.fillStyle = C.grassLight;
  ctx.fillRect(0, top + 1, w, 3);
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, top + 4, w, 4);
  // Źdźbła — co drugi kafelek 8px
  ctx.fillStyle = C.grass;
  for (let tx = 4; tx < w; tx += 16) {
    ctx.fillRect(tx, top - 3, 2, 3);
  }
}

// Jajko — stały sprite (rotację fizyczną pomijamy); złote ma własną
// paletę i mrugający błysk.
function drawEgg(ctx: CanvasRenderingContext2D, e: Matter.Body) {
  const golden = (e.gameData as EggData).golden;
  const pal: Palette = golden
    ? { W: '#f8d800', S: '#b08800' }
    : { W: C.white, S: '#c8c8c8' };
  drawSprite(ctx, EGG, pal, e.position.x, e.position.y, 2);
  if (golden) {
    // błysk złotego jajka
    if (Math.sin(now() * 0.01) > 0) {
      ctx.fillStyle = C.white;
      ctx.fillRect(Math.round(e.position.x) + 8, Math.round(e.position.y) - 10, 2, 2);
    }
  }
}

// Lis: sprite flipowany wg facing, nogi animowane 2 klatkami, większa
// skala dla tanka/bossa, korona bossa i paski HP dla wielożyciowych.
function drawEnemy(ctx: CanvasRenderingContext2D, e: Matter.Body) {
  const d = e.gameData as EnemyData;
  const px = d.r >= 24 ? 3 : 2;
  const bob = d.onGround ? Math.round(Math.sin(d.walkPhase) * 1) : 0;
  const pal: Palette = { ...FOX_PAL, D: d.color };

  const x = Math.round(e.position.x);
  const y = Math.round(e.position.y) + bob;
  drawSprite(ctx, FOX, pal, x, y, px, d.facing > 0);

  // Nogi — animacja 2-klatkowa
  const legH = px + 2;
  const phase = Math.sin(d.walkPhase) > 0 ? 1 : -1;
  ctx.fillStyle = '#302010';
  ctx.fillRect(x - 6 * px, y + 5 * px, px, legH + phase);
  ctx.fillRect(x + 2 * px, y + 5 * px, px, legH - phase);

  // Korona bossa
  if (d.type === 'boss') {
    ctx.fillStyle = '#f8d800';
    const cx = x - 5, cy = y - 10 * px;
    ctx.fillRect(cx, cy, 10, 3);
    ctx.fillRect(cx, cy - 3, 2, 3);
    ctx.fillRect(cx + 4, cy - 3, 2, 3);
    ctx.fillRect(cx + 8, cy - 3, 2, 3);
  }

  // Paski HP dla tanków i bossa
  if (d.hp > 1) {
    ctx.fillStyle = '#f83800';
    for (let hp = 0; hp < d.hp - 1; hp++) {
      ctx.fillRect(x - d.r + hp * 8, y - d.r - 6, 6, 3);
    }
  }
}

// Kurka gracza: flip wg kierunku ruchu, nogi chodu na ziemi / skulenie
// w locie i machające skrzydło podczas skoku.
function drawChicken(ctx: CanvasRenderingContext2D, p: Matter.Body) {
  const d = p.gameData as PlayerData;
  const x = Math.round(p.position.x);
  const y = Math.round(p.position.y);
  const flip = d.facing < 0;

  drawSprite(ctx, CHICKEN, CHICKEN_PAL, x, y, 2, flip);

  // Nogi — 2-klatkowa animacja chodzenia / skulenie w locie
  const ly = y + 11;
  ctx.fillStyle = '#f8b800';
  if (d.onGround) {
    const phase = Math.sin(d.walkPhase) > 0 ? 1 : -1;
    ctx.fillRect(x - 5, ly, 2, 4 + phase);
    ctx.fillRect(x + 3, ly, 2, 4 - phase);
  } else {
    ctx.fillRect(x - 5, ly, 2, 3);
    ctx.fillRect(x + 3, ly, 2, 3);
  }
  // Machanie skrzydłem w locie — piksel nad tułowiem
  if (!d.onGround && Math.sin(now() * 0.03) > 0) {
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(x - (flip ? -12 : 12), y - 2, 3, 4);
  }
}

// Przeszkoda spadająca: ptak z machaniem skrzydeł albo kamień.
function drawFalling(ctx: CanvasRenderingContext2D, o: Matter.Body) {
  const d = o.gameData as FallingData;
  if (d.type === 'bird') {
    const flap = Math.sin(now() * 0.02) > 0 ? -2 : 0;
    drawSprite(ctx, BIRD, BIRD_PAL, o.position.x, o.position.y + flap, 2);
  } else {
    drawSprite(ctx, ROCK, ROCK_PAL, o.position.x, o.position.y, 2);
  }
}

// Kulka bonusu w kolorze typu + glif w środku; lekko pulsuje w pionie.
function drawPowerup(ctx: CanvasRenderingContext2D, p: Matter.Body) {
  const t = (p.gameData as PowerupData).type;
  const pulse = Math.sin(now() * 0.008) > 0 ? 2 : 0;
  drawSprite(ctx, ORB, { P: POWERUP_COLORS[t] }, p.position.x, p.position.y + pulse, 1);
  // glif w środku (orb 12px, glif 5px -> offset na środek)
  drawSprite(ctx, POWERUP_GLYPHS[t], { X: '#101018' }, p.position.x, p.position.y + pulse, 1);
}
