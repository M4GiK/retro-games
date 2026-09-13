/**
 * Renderer sceny — warstwa prezentacji gry.
 *
 * Klasa SceneRenderer rysuje całą klatkę w estetyce NES/Pegasus:
 * stała rozdzielczość 256×240, sprite'y pixel-art z atlasu (sprites.ts),
 * kafelkowe tło, dithering, scanliny CRT — zero antyaliasingu.
 *
 * Wzorzec Obserwator: rysowanie jest podpięte pod zdarzenie afterRender
 * renderera Matter — fizyka jest niewidzialna, my rysujemy na wierzchu.
 * Renderer czyta stan z core/state.ts, ale nigdy go nie modyfikuje
 * (jednokierunkowy przepływ danych).
 */
import * as Matter from 'matter-js';
import { GROUND_H, VIEW_W, VIEW_H } from '../core/config';
import { gameState, activeEffects, eggs, enemies, fallingObstacles, powerups, particles, popups } from '../core/state';
import { physics } from '../engine/physics';
import {
  drawSprite, CHICKEN, CHICKEN_PAL, FOX, FOX_PAL, EGG, HEART, HEART_PAL,
  ROCK, ROCK_PAL, BIRD, BIRD_PAL, ORB, POWERUP_COLORS, POWERUP_GLYPHS,
  CLOUD, BUSH, type Palette,
} from './sprites';
import type { PlayerData, EggData, EnemyData, FallingData, PowerupData } from '../core/types';

const { Events } = Matter;

/** Paleta sceny (zbliżona do NES). */
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

/** Zapętla x w przedziale [-margin, w+margin] — dryf chmur i lisów w demo. */
function wrapX(x: number, w: number, margin: number): number {
  const span = w + margin * 2;
  return ((x % span) + span) % span - margin;
}

export class SceneRenderer {
  /** Demo/attract mode — animowane sprite'y na tle ekranów tytułu/menu. */
  private demoOn = false;

  /**
   * Wyłącza wygładzanie (ostre piksele) i podpina rysowanie sceny
   * pod afterRender Matter.Render.
   */
  init(): void {
    const ctx = physics.render.context;
    ctx.imageSmoothingEnabled = false;
    Events.on(physics.render, 'afterRender', () => this.draw());
  }

  /** Włącza/wyłącza animowane demo w tle (attract mode ekranów menu). */
  setDemo(on: boolean): void {
    this.demoOn = on;
  }

  /**
   * Pełna klatka: niebo, parallax, ziemia, encje, demo/HUD, cząsteczki,
   * popupy, efekty power-upów i na końcu scanliny CRT.
   */
  private draw(): void {
    const ctx = physics.render.context;
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
    this.drawHill(ctx, 30, h - GROUND_H, 70, 22, C.hill);
    this.drawHill(ctx, 210, h - GROUND_H, 90, 30, C.hill);
    this.drawHill(ctx, 130, h - GROUND_H, 40, 14, C.hillDark);

    // Ziemia — kafelki 16px: wierzch trawy + ditheringowany dirt
    this.drawGround(ctx, w, h);

    // Krzaki
    drawSprite(ctx, BUSH, { G: C.hill }, 46, h - GROUND_H - 6, 1);
    drawSprite(ctx, BUSH, { G: C.hill }, 190, h - GROUND_H - 6, 1);

    // Encje
    for (const e of eggs) this.drawEgg(ctx, e);
    for (const p of powerups) this.drawPowerup(ctx, p);
    for (const o of fallingObstacles) this.drawFalling(ctx, o);
    for (const en of enemies) this.drawEnemy(ctx, en);
    this.drawChicken(ctx, physics.player);

    // Demo attract-mode na ekranach menu
    if (this.demoOn) this.drawDemo(ctx, w, h, ts);

    // Pasek statusu NES — tylko w trakcie gry
    if (gameState.running) this.drawHUD(ctx, w);

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
      const px = Math.round(physics.player.position.x), py = Math.round(physics.player.position.y);
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
      const px = Math.round(physics.player.position.x), py = Math.round(physics.player.position.y);
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

  /** Animowane demo: kurka biegnie i podskakuje, lisy przechodzą, złote jajko. */
  private drawDemo(ctx: CanvasRenderingContext2D, w: number, h: number, ts: number): void {
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

  /** Pasek statusu NES na górze obrazu: SC, serca, jajka, combo. */
  private drawHUD(ctx: CanvasRenderingContext2D, w: number): void {
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

  /** Schodkowa piramida (wzgórze w stylu SMB). */
  private drawHill(ctx: CanvasRenderingContext2D, cx: number, baseY: number, w: number, h: number, color: string): void {
    const step = 4;
    ctx.fillStyle = color;
    for (let y = 0; y < h; y += step) {
      const inset = Math.round(((y / h) * w) / 4);
      ctx.fillRect(cx - Math.round(w / 2) + inset, baseY - y - step, w - inset * 2, step);
    }
  }

  /** Kafelki ziemi: trawa + dirt z deterministycznym ditheringiem. */
  private drawGround(ctx: CanvasRenderingContext2D, w: number, h: number): void {
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

  /**
   * Jajko — stały sprite (rotację fizyczną pomijamy); złote ma własną
   * paletę i mrugający błysk.
   */
  private drawEgg(ctx: CanvasRenderingContext2D, e: Matter.Body): void {
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

  /**
   * Lis: sprite flipowany wg facing, nogi animowane 2 klatkami, większa
   * skala dla tanka/bossa, korona bossa i paski HP dla wielożyciowych.
   */
  private drawEnemy(ctx: CanvasRenderingContext2D, e: Matter.Body): void {
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

  /**
   * Kurka gracza: flip wg kierunku ruchu, nogi chodu na ziemi / skulenie
   * w locie i machające skrzydło podczas skoku.
   */
  private drawChicken(ctx: CanvasRenderingContext2D, p: Matter.Body): void {
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

  /** Przeszkoda spadająca: ptak z machaniem skrzydeł albo kamień. */
  private drawFalling(ctx: CanvasRenderingContext2D, o: Matter.Body): void {
    const d = o.gameData as FallingData;
    if (d.type === 'bird') {
      const flap = Math.sin(now() * 0.02) > 0 ? -2 : 0;
      drawSprite(ctx, BIRD, BIRD_PAL, o.position.x, o.position.y + flap, 2);
    } else {
      drawSprite(ctx, ROCK, ROCK_PAL, o.position.x, o.position.y, 2);
    }
  }

  /** Kulka bonusu w kolorze typu + glif w środku; lekko pulsuje w pionie. */
  private drawPowerup(ctx: CanvasRenderingContext2D, p: Matter.Body): void {
    const t = (p.gameData as PowerupData).type;
    const pulse = Math.sin(now() * 0.008) > 0 ? 2 : 0;
    drawSprite(ctx, ORB, { P: POWERUP_COLORS[t] }, p.position.x, p.position.y + pulse, 1);
    // glif w środku (orb 12px, glif 5px -> offset na środek)
    drawSprite(ctx, POWERUP_GLYPHS[t], { X: '#101018' }, p.position.x, p.position.y + pulse, 1);
  }
}
