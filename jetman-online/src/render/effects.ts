/**
 * Efekty cząsteczkowe — czysto klienckie, NIE są częścią simu (ticket C).
 * Sim zwraca SimEvent[] → main.ts woła effects.spawn(ev) → rysowane co
 * frame. Pozycje cząsteczek są w KOORDYNATACH ŚWIATA — odejmujemy cam
 * z scene.ts przy rysowaniu.
 */

import type { SimEvent } from '../core/types';
import { TILE } from '../core/config';
import type { LevelData } from '../core/level';
import { IN_THRUST } from '../core/types';
import { cam } from './scene';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number;  // 1 → 0
  decay: number; // spadek życia na klatkę
  grav: number;  // własna grawitacja cząsteczki
  color: string;
}

interface Beam {
  x1: number; y1: number; x2: number; y2: number;
  life: number;
  color: string;
}

export class Effects {
  private parts: Particle[] = [];
  private beams: Beam[] = [];

  /** Mapowanie zdarzeń simu na cząsteczki/wiązki. */
  spawn(ev: SimEvent[]): void {
    for (const e of ev) {
      switch (e.t) {
        case 'explode':
          this.burst(e.x, e.y, 26, ['#ffcc00', '#f83800', '#fcfcfc'], 1.8);
          // Giby — krew rozpryskuje się i opada z grawitacją.
          this.burst(e.x, e.y, 18, ['#d82800', '#a01414', '#6e0c0c'], 2.0);
          break;
        case 'boom':
          this.burst(e.x, e.y, Math.min(40, 8 + e.r), ['#f83800', '#ffcc00', '#7a7a9e'], 2.4);
          // Gruby dym po eksplozji.
          for (let i = 0; i < 8; i++) {
            this.parts.push({
              x: e.x + (Math.random() - 0.5) * e.r, y: e.y + (Math.random() - 0.5) * e.r,
              vx: (Math.random() - 0.5) * 0.4, vy: -0.3 - Math.random() * 0.3,
              life: 1, decay: 0.012, grav: -0.005,
              color: i % 2 ? '#55556e' : '#3a3a5c',
            });
          }
          break;
        case 'bailout':
          this.burst(e.x, e.y, 14, ['#fcfcfc', '#7a7a9e'], 1.0);
          break;
        case 'fire':
          this.parts.push({
            x: e.x, y: e.y, vx: 0, vy: 0, life: 0.3, decay: 0.08, grav: 0, color: '#fcfcfc',
          });
          break;
        case 'laser':
          this.beams.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.25, color: '#f83800' });
          break;
        default:
          break;
      }
    }
  }

  /** Splash przy wejściu w wodę — pozycja przekazywana osobno (event nie niesie x/y). */
  splash(x: number, y: number): void {
    this.burst(x, y, 10, ['#1848dc', '#78beff'], 1.2);
  }

  /**
   * Smugi dymu — wołane co klatkę, pozycje z simu:
   *  - za rakietami (gęsty szary dym + odrobina ognia),
   *  - za silnikami jetów z włączonym ciągiem (statek i pilot —
   *    u pilota spaliny lecą w dół, bo jetpack ciągnie w górę).
   */
  trail(sim: {
    bullets: { kind: string; x: number; y: number; vx: number; vy: number }[];
    jets: { alive: boolean; mode: string; x: number; y: number; angle: number; lastBits: number }[];
  }): void {
    if (this.parts.length > 600) return;
    for (const b of sim.bullets) {
      if (b.kind !== 'rocket' && b.kind !== 'homing') continue;
      const back = Math.atan2(b.vy, b.vx) + Math.PI;
      this.parts.push({
        x: b.x + Math.cos(back) * 3 + (Math.random() - 0.5),
        y: b.y + Math.sin(back) * 3 + (Math.random() - 0.5),
        vx: Math.cos(back) * 0.3 + (Math.random() - 0.5) * 0.2,
        vy: Math.sin(back) * 0.3 - 0.12,
        life: 1, decay: 0.02, grav: -0.004,
        color: Math.random() < 0.25 ? '#f83800' : (Math.random() < 0.5 ? '#7a7a9e' : '#55556e'),
      });
    }
    for (const j of sim.jets) {
      if (!j.alive || !(j.lastBits & IN_THRUST)) continue;
      const pilot = j.mode === 'pilot';
      const back = pilot ? Math.PI / 2 : j.angle + Math.PI; // w dół / w tył
      const off = pilot ? 4 : 6;
      this.parts.push({
        x: j.x + Math.cos(back) * off + (Math.random() - 0.5) * 2,
        y: j.y + Math.sin(back) * off + (Math.random() - 0.5) * 2,
        vx: Math.cos(back) * 0.8 + (Math.random() - 0.5) * 0.3,
        vy: Math.sin(back) * 0.8 - 0.1,
        life: 0.6, decay: 0.045, grav: -0.003,
        color: Math.random() < 0.4 ? '#f83800' : (Math.random() < 0.5 ? '#8a8aa5' : '#55556e'),
      });
    }
  }

  /** Odłamki ziemi po wydrążeniu terenu — event 'terrain' (cells). */
  terrainDebris(level: LevelData, cells: number[]): void {
    // Losowo próbkuj kafelki — nie każdy musi wystrzelić.
    const step = Math.max(1, Math.floor(cells.length / 18));
    for (let i = 0; i < cells.length; i += step) {
      const tx = cells[i] % level.w, ty = (cells[i] / level.w) | 0;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 0.5 + Math.random() * 1.6;
      this.parts.push({
        x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 1, decay: 0.02, grav: 0.06,   // spada z powrotem — jak ziemia
        color: ['#2a2a44', '#3a3a5c', '#55557f', '#1c1c30'][i % 4],
      });
    }
  }

  private burst(x: number, y: number, n: number, colors: string[], v0: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.4;
      const v = 0.3 + Math.random() * v0;
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.7 + Math.random() * 0.3, decay: 0.025, grav: 0.03,
        color: colors[i % colors.length] ?? '#fff',
      });
    }
  }

  stepAndDraw(ctx: CanvasRenderingContext2D): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += p.grav;
      p.life -= p.decay;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fillRect(p.x - cam.x - 1, p.y - cam.y - 1, 2, 2);
      ctx.globalAlpha = 1;
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= 0.05;
      if (b.life <= 0) { this.beams.splice(i, 1); continue; }
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = Math.min(1, b.life * 4);
      ctx.beginPath();
      ctx.moveTo(b.x1 - cam.x, b.y1 - cam.y);
      ctx.lineTo(b.x2 - cam.x, b.y2 - cam.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  clear(): void {
    this.parts.length = 0;
    this.beams.length = 0;
  }
}
