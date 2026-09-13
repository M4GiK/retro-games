/**
 * HUD — pasek wyników + zasoby własnego jeta (ticket C).
 * Punkty + życia jako pipsy; paliwo i energia jako paski;
 * bronie i zapas rakiet pilota — tekst pod paskami.
 */

import {
  ENERGY_MAX, FUEL_MAX, PILOT_FUEL_MAX, START_LIVES, VIEW_W,
} from '../core/config';
import { WEAPONS } from '../core/weapons';
import type { SimState } from '../core/types';
import { PLAYER_COLORS } from './sprites';

export function drawHud(ctx: CanvasRenderingContext2D, sim: SimState, selfSlot: number): void {
  drawScores(ctx, sim, selfSlot);
  const self = sim.jets.find(j => j.slot === selfSlot);
  if (self && self.alive) drawBars(ctx, self);
}

function drawScores(ctx: CanvasRenderingContext2D, sim: SimState, selfSlot: number): void {
  const n = sim.jets.length;
  const w = Math.min(60, VIEW_W / Math.max(1, n));
  ctx.font = '6px monospace';
  ctx.textBaseline = 'top';
  sim.jets.forEach((jet, i) => {
    const x = 4 + i * w;
    ctx.fillStyle = PLAYER_COLORS[jet.slot] ?? '#fff';
    const tag = jet.mode === 'pilot' ? '▽' : '';
    ctx.fillText(`${jet.name}${tag} ${jet.score}`, x, 4);
    for (let l = 0; l < START_LIVES; l++) {
      ctx.fillStyle = l < jet.lives ? (PLAYER_COLORS[jet.slot] ?? '#fff') : '#2a2a44';
      ctx.fillRect(x + l * 5, 12, 3, 3);
    }
    if (jet.slot === selfSlot) {
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(x, 17, 8, 1);
    }
  });
}

function drawBars(ctx: CanvasRenderingContext2D, self: SimState['jets'][number]): void {
  const x = 4, y = 22;
  const fuelMax = self.mode === 'pilot' ? PILOT_FUEL_MAX : FUEL_MAX;
  bar(ctx, x, y, 40, self.fuel / fuelMax, '#7dff5a', 'P');
  if (self.mode === 'ship') {
    bar(ctx, x, y + 5, 40, self.energy / ENERGY_MAX, '#ffcc00', 'E');
  } else {
    ctx.fillStyle = '#7fa0c8';
    ctx.fillText(`RK:${self.rockets}`, x + 8, y + 4);
  }
  // Wybrane bronie (lub zestaw pilota).
  ctx.fillStyle = '#7fa0c8';
  const w1 = self.mode === 'pilot' ? WEAPONS.rifle.name : WEAPONS[self.w1].name;
  const w2 = self.mode === 'pilot' ? WEAPONS.homing.name : WEAPONS[self.w2].name;
  ctx.fillText(`${w1}|${w2}`, x + 46, y);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, v: number, col: string, label: string): void {
  ctx.fillStyle = '#2a2a44';
  ctx.fillRect(x + 8, y, w, 3);
  ctx.fillStyle = col;
  ctx.fillRect(x + 8, y, Math.max(0, Math.min(1, v)) * w, 3);
  ctx.fillStyle = '#7fa0c8';
  ctx.font = '6px monospace';
  ctx.fillText(label, x, y - 1);
}
