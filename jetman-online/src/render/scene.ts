/**
 * Render sceny — SimState → canvas 256×240 (ticket C).
 *
 * Świat jest WIĘKSZY niż widok: kamera podąża za własnym jetem
 * (clamp do granic). Teren renderowany raz na offscreen canvas
 * (skala z ditheringiem + strefy) — eksplozje dziurawią go przez
 * invalidateTerrain() wywoływane z eventów 'terrain'. Radar w rogu.
 */

import { JET_R, TILE, VIEW_H, VIEW_W } from '../core/config';
import { worldSize, type LevelData } from '../core/level';
import {
  ZONE_GLUE, ZONE_SNOW, ZONE_WATER, type SimState,
} from '../core/types';
import { PLAYER_COLORS, pilotSprite, shipSprite } from './sprites';

/** Pozycja kamery — effects/hud czytają ją do przesuwania warstw. */
export const cam = { x: 0, y: 0 };

/** Screen shake: trauma 0..1 rośnie z eventów, wygasa w drawScene. */
let trauma = 0;
export function addShake(amount: number): void {
  trauma = Math.min(1, trauma + amount);
}

// ---- Warstwa terenu (offscreen, dziurawiona eksplozjami) ----

const terrainCache = new WeakMap<LevelData, HTMLCanvasElement>();

/** Narysuj jeden kafelek terenu na warstwie (start i redraw po dziurach). */
function drawTile(c: CanvasRenderingContext2D, level: LevelData, tx: number, ty: number): void {
  const i = ty * level.w + tx;
  const px = tx * TILE, py = ty * TILE;
  c.clearRect(px, py, TILE, TILE);
  const t = level.tiles[i];
  if (t === 1) {
    // Skała: warstwy osadowe (strata co 6 kafelków) + dithering +
    // "żyłki" minerału + jasna krawędź gdy nad kafelkiem jest luka.
    const strata = ((ty / 6) | 0) % 2 === 0;
    c.fillStyle = strata ? '#2a2a44' : '#272740';
    c.fillRect(px, py, TILE, TILE);
    const noise = (tx * 7 + ty * 13) % 5;
    if (noise === 0) {
      c.fillStyle = '#3a3a5c';
      c.fillRect(px + 1, py + 1, 1, 1);
    } else if (noise === 1) {
      c.fillStyle = '#1c1c30';
      c.fillRect(px + 2, py + 2, 1, 1);
    } else if (noise === 2) {
      c.fillStyle = '#4a4a6e';               // "żyłka" minerału
      c.fillRect(px + (tx % 3), py + (ty % 2), 1, 1);
    }
    const above = ty > 0 ? level.tiles[i - level.w] : 1;
    if (above === 0) {                       // odsłonięta górna krawędź
      c.fillStyle = '#55557f';
      c.fillRect(px, py, TILE, 1);
    }
    const below = ty < level.h - 1 ? level.tiles[i + level.w] : 1;
    if (below === 0) {                       // spód w cieniu
      c.fillStyle = '#161624';
      c.fillRect(px, py + TILE - 1, TILE, 1);
    }
  } else if (t === 2) {
    // Skała twarda: ciemna cegła — wyraźnie "nie do zniszczenia".
    c.fillStyle = '#14141f';
    c.fillRect(px, py, TILE, TILE);
    c.fillStyle = '#2a2a44';
    c.fillRect(px, py, TILE, 1);
  }
  const z = level.zones[i];
  if (z === ZONE_WATER) {
    c.fillStyle = 'rgba(24,72,220,.55)';
    c.fillRect(px, py, TILE, TILE);
    if ((tx + ty) % 2 === 0) {
      c.fillStyle = 'rgba(120,190,255,.4)';
      c.fillRect(px, py, 2, 1);
    }
  } else if (z === ZONE_SNOW) {
    if ((tx * 5 + ty * 3) % 4 === 0) {
      c.fillStyle = 'rgba(220,235,255,.7)';
      c.fillRect(px + 1, py + 1, 1, 1);
    }
  } else if (z === ZONE_GLUE) {
    c.fillStyle = 'rgba(90,200,80,.5)';
    c.fillRect(px, py, TILE, TILE);
    c.fillStyle = 'rgba(40,120,30,.6)';
    c.fillRect(px + 1, py + 2, 2, 1);
  }
}

function terrainCanvas(level: LevelData): HTMLCanvasElement {
  let cv = terrainCache.get(level);
  if (cv) return cv;
  const { w, h } = worldSize(level);
  cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  for (let ty = 0; ty < level.h; ty++) {
    for (let tx = 0; tx < level.w; tx++) drawTile(c, level, tx, ty);
  }
  terrainCache.set(level, cv);
  return cv;
}

/**
 * Kafelki wydrążone eksplozją — wyczyść je w warstwie i PRZERYSUJ
 * sąsiadów (nowo odsłonięte krawędzie dostają podświetlenie/cień).
 */
export function invalidateTerrain(level: LevelData, cells: number[]): void {
  const cv = terrainCache.get(level);
  if (!cv) return;
  const c = cv.getContext('2d')!;
  for (const i of cells) {
    const tx = i % level.w, ty = (i / level.w) | 0;
    c.clearRect(tx * TILE, ty * TILE, TILE, TILE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (nx >= 0 && ny >= 0 && nx < level.w && ny < level.h) {
          drawTile(c, level, nx, ny);
        }
      }
    }
  }
}

// ---- Scena ----

export function drawScene(ctx: CanvasRenderingContext2D, sim: SimState, selfSlot: number): void {
  const { w: worldW, h: worldH } = worldSize(sim.level);
  const self = sim.jets.find(j => j.slot === selfSlot) ?? sim.jets[0];
  // Kamera śledzi gracza z lookahead w stronę lotu (nowoczesny feel);
  // na mapie mniejszej niż widok — centruj.
  if (self) {
    const tx = self.x + self.vx * 6 - VIEW_W / 2;
    const ty = self.y + self.vy * 5 - VIEW_H / 2;
    cam.x = clamp(tx, 0, Math.max(0, worldW - VIEW_W));
    cam.y = clamp(ty, 0, Math.max(0, worldH - VIEW_H));
  }
  if (worldW <= VIEW_W) cam.x = (worldW - VIEW_W) / 2;
  if (worldH <= VIEW_H) cam.y = (worldH - VIEW_H) / 2;
  // Screen shake po eksplozjach — trauma wygasza wykładniczo.
  if (trauma > 0.01) {
    cam.x += (Math.random() - 0.5) * trauma * 8;
    cam.y += (Math.random() - 0.5) * trauma * 8;
    trauma *= 0.88;
  } else {
    trauma = 0;
  }

  // Tło — nocne niebo + odrobina paralaksy (gwiazdy siatka).
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#141428';
  for (let i = 0; i < 40; i++) {
    const sx = (i * 67) % (worldW + VIEW_W) - cam.x * 0.4;
    const sy = (i * 41) % (worldH + VIEW_H) - cam.y * 0.4;
    if (sx >= 0 && sx < VIEW_W && sy >= 0 && sy < VIEW_H) {
      ctx.fillRect(sx | 0, sy | 0, 1, 1);
    }
  }

  ctx.drawImage(terrainCanvas(sim.level), -cam.x | 0, -cam.y | 0);
  drawBases(ctx, sim);
  drawTethersAndFlags(ctx, sim);
  drawJets(ctx, sim, selfSlot);
  drawBullets(ctx, sim);
  drawRadar(ctx, sim);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function drawBases(ctx: CanvasRenderingContext2D, sim: SimState): void {
  for (const f of sim.flags) {
    const x = f.homeX - cam.x, y = f.homeY - cam.y;
    if (x < -16 || x > VIEW_W + 16 || y < -16 || y > VIEW_H + 16) continue;
    const col = PLAYER_COLORS[f.slot] ?? '#fff';
    ctx.strokeStyle = col;
    ctx.strokeRect(x - 7, y - 5, 14, 9);
    ctx.fillStyle = col;
    ctx.fillRect(x - 7, y + 4, 14, 1);
  }
}

/** Lina nosiciel↔flaga + chorągiew. */
function drawTethersAndFlags(ctx: CanvasRenderingContext2D, sim: SimState): void {
  for (const f of sim.flags) {
    const fx = f.x - cam.x, fy = f.y - cam.y;
    if (f.carrier >= 0) {
      const c = sim.jets.find(j => j.slot === f.carrier);
      if (c) {
        ctx.strokeStyle = '#7a7a9e';
        ctx.beginPath();
        ctx.moveTo(c.x - cam.x, c.y - cam.y);
        ctx.lineTo(fx, fy);
        ctx.stroke();
      }
    }
    if (fx < -8 || fx > VIEW_W + 8 || fy < -8 || fy > VIEW_H + 8) continue;
    ctx.fillStyle = PLAYER_COLORS[f.slot] ?? '#fff';
    ctx.fillRect(fx - 1, fy - 4, 2, 8);
    ctx.fillRect(fx + 1, fy - 4, 4, 3);
  }
}

function drawJets(ctx: CanvasRenderingContext2D, sim: SimState, selfSlot: number): void {
  for (const jet of sim.jets) {
    if (!jet.alive) continue;
    const x = jet.x - cam.x, y = jet.y - cam.y;
    if (x < -16 || x > VIEW_W + 16 || y < -16 || y > VIEW_H + 16) continue;
    const blink = sim.tick < jet.invulnUntil && Math.floor(sim.tick / 4) % 2 === 0;
    if (blink) continue;

    const pilot = jet.mode === 'pilot';
    ctx.save();
    ctx.translate(x | 0, y | 0);
    if (pilot) {
      // Pilot: głowa ZAWSZE do góry — sprite pionowy, lustrzany
      // wg kierunku (angle 0 = w prawo, π = w lewo), lufa na wprost.
      const face = Math.cos(jet.angle) >= 0 ? 1 : -1;
      ctx.scale(face, 1);
      if (jet.lastBits & 4) {
        // Płomień jetpacka pod plecakiem (ciąg pionowy).
        const len = 2 + (sim.tick % 3);
        ctx.fillStyle = '#f83800';
        ctx.fillRect(-2, 3, 4, len);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(-1, 3, 2, len - 1);
      }
      const spr = pilotSprite(jet.slot);
      ctx.drawImage(spr, -spr.width / 2 | 0, -spr.height / 2 | 0);
      // Karabinek: lufa poziomo w stronę celowania.
      ctx.fillStyle = '#3a3a5c';
      ctx.fillRect(2, -1, 4, 2);
    } else {
      ctx.rotate(jet.angle + Math.PI / 2);
      if (jet.lastBits & 4) {
        const len = 3 + (sim.tick % 3);
        ctx.fillStyle = '#f83800';
        ctx.fillRect(-2, JET_R - 1, 4, len);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(-1, JET_R - 1, 2, len - 1);
      }
      const spr = shipSprite(jet.slot);
      ctx.drawImage(spr, -spr.width / 2 | 0, -spr.height / 2 | 0);
    }
    ctx.restore();

    // Własny jet: marker nad głową (jak w oryginale strzałka "TY").
    if (jet.slot === selfSlot) {
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(x - 1, y - 12, 2, 2);
      ctx.fillRect(x - 2, y - 11, 4, 1);
    }
  }
}

/** Pociski wg typu: kulka, rakieta z płomieniem, mina. */
function drawBullets(ctx: CanvasRenderingContext2D, sim: SimState): void {
  for (const b of sim.bullets) {
    const x = b.x - cam.x, y = b.y - cam.y;
    if (x < -8 || x > VIEW_W + 8 || y < -8 || y > VIEW_H + 8) continue;
    switch (b.kind) {
      case 'rocket':
      case 'homing':
        ctx.fillStyle = b.kind === 'homing' ? '#f83800' : '#ffcc00';
        ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.fillStyle = '#f83800';
        ctx.fillRect(x - 1, y + (sim.tick % 2), 1, 2);
        break;
      case 'mine':
        ctx.fillStyle = '#7a7a9e';
        ctx.fillRect(x - 2, y - 2, 5, 5);
        ctx.fillStyle = '#f83800';
        if (Math.floor(sim.tick / 8) % 2) ctx.fillRect(x - 1, y - 1, 2, 2);
        break;
      default:
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
}

/** Radar: miniaturowa mapa świata + kropki graczy i flag. */
function drawRadar(ctx: CanvasRenderingContext2D, sim: SimState): void {
  const { w: worldW, h: worldH } = worldSize(sim.level);
  const RW = 46, RH = Math.max(16, Math.round(RW * worldH / worldW));
  const rx = VIEW_W - RW - 3, ry = VIEW_H - RH - 3;
  const kx = RW / worldW, ky = RH / worldH;
  ctx.fillStyle = 'rgba(4,4,12,.75)';
  ctx.fillRect(rx - 1, ry - 1, RW + 2, RH + 2);
  // Teren jako gęstość: co 2. kafelek wystarczy na miniaturce.
  ctx.fillStyle = '#2a2a44';
  for (let ty = 0; ty < sim.level.h; ty += 2) {
    for (let tx = 0; tx < sim.level.w; tx += 2) {
      if (sim.level.tiles[ty * sim.level.w + tx] > 0) {
        ctx.fillRect(rx + tx * TILE * kx, ry + ty * TILE * ky, 1, 1);
      }
    }
  }
  for (const f of sim.flags) {
    ctx.fillStyle = PLAYER_COLORS[f.slot] ?? '#fff';
    ctx.fillRect(rx + f.x * kx, ry + f.y * ky, 2, 2);
  }
  for (const j of sim.jets) {
    if (!j.alive) continue;
    ctx.fillStyle = PLAYER_COLORS[j.slot] ?? '#fff';
    ctx.fillRect(rx + j.x * kx - 1, ry + j.y * ky - 1, 2, 2);
  }
  // Viewport kamery.
  ctx.strokeStyle = 'rgba(252,252,252,.4)';
  ctx.strokeRect(rx + cam.x * kx, ry + cam.y * ky, VIEW_W * kx, VIEW_H * ky);
}
