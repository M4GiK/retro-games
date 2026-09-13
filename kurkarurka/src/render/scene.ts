
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
import { gameState, activeEffects, eggs, enemies, fallingObstacles, powerups, particles, popups, grounds, platforms, levelState, ghost } from '../core/state';
import { physics } from '../engine/physics';
import {
  drawSprite, CHICKEN, CHICKEN_PAL, GHOST_PAL, FOX, FOX_PAL, EGG, HEART, HEART_PAL,
  ROCK, ROCK_PAL, BIRD, BIRD_PAL, SPIDER, SPIDER_PAL, ORB, POWERUP_COLORS, POWERUP_GLYPHS,
  CLOUD, BUSH, COOP, COOP_PAL, BASKET, BASKET_PAL, type Palette,
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
   * W przygodzie świat przewija się za graczem — warstwa świata jest
   * rysowana w transformacji kamery (HUD i ekrany pozostają na miejscu).
   */
  private draw(): void {
    const ctx = physics.render.context;
    const w = VIEW_W, h = VIEW_H;
    const ts = now();
    // Przygoda z zbudowanym poziomem albo arena koszmaru — świat szerszy
    // niż ekran przewija się za graczem; menu/demo stoi na jednym ekranie.
    const adventure = gameState.mode === 'normal' && grounds.length > 0;
    const wideWorld = adventure || gameState.mode === 'hard' || levelState.bossArena;
    const camX = wideWorld
      ? Math.max(0, Math.min(physics.player.position.x - 90, levelState.len - w))
      : 0;
    ctx.clearRect(0, 0, w, h);

    // Niebo — płaski kolor (brak gradientów, to 8-bit); arena bossa w mroku
    ctx.fillStyle = levelState.bossArena ? '#343860' : C.sky;
    ctx.fillRect(0, 0, w, h);

    // Pikselowe słońce — na arenie bossa blade jak księżyc
    ctx.fillStyle = levelState.bossArena ? '#d8d8f0' : '#f8d800';
    ctx.fillRect(w - 44, 16, 16, 16);
    ctx.fillStyle = levelState.bossArena ? '#fcfcfc' : '#f8f878';
    ctx.fillRect(w - 40, 20, 8, 8);

    // Chmury — powolny dryf + parallax kamery, wrap poza ekranem
    drawSprite(ctx, CLOUD, { C: C.cloud }, wrapX(30 + ts * 0.004 - camX * 0.35, w, 40), 34, 2);
    drawSprite(ctx, CLOUD, { C: C.cloud }, wrapX(150 + ts * 0.0025 - camX * 0.3, w, 40), 56, 1);

    // Wzgórza — schodkowe piramidy (jak w SMB), parallax kamery
    this.drawHill(ctx, wrapX(30 - camX * 0.45, w, 60), h - GROUND_H, 70, 22, C.hill);
    this.drawHill(ctx, wrapX(210 - camX * 0.45, w, 60), h - GROUND_H, 90, 30, C.hill);
    this.drawHill(ctx, wrapX(130 - camX * 0.55, w, 40), h - GROUND_H, 40, 14, C.hillDark);

    // ---- Warstwa świata (przesuwana kamerą w przygodzie) ----
    ctx.save();
    ctx.translate(-Math.round(camX), 0);

    if (adventure) {
      for (const g of grounds) this.drawGroundSeg(ctx, g);
      for (const p of platforms) this.drawPlatform(ctx, p);
      this.drawGoal(ctx);
      // Krzaki na szerszych segmentach
      for (const g of grounds) {
        if (g.bounds.max.x - g.bounds.min.x > 90) {
          drawSprite(ctx, BUSH, { G: C.hill }, g.bounds.min.x + 22, h - GROUND_H - 6, 1);
        }
      }
    } else {
      // Koszmar / arena bossa / demo: ciągła ziemia + krzaki po długości świata
      const groundLen = gameState.mode === 'hard' || levelState.bossArena ? levelState.len : w;
      this.drawGround(ctx, groundLen, h);
      for (let bx = 46; bx < groundLen - 30; bx += 144) {
        drawSprite(ctx, BUSH, { G: C.hill }, bx + (bx * 31) % 37, h - GROUND_H - 6, 1);
      }
    }

    // Encje
    for (const e of eggs) this.drawEgg(ctx, e);
    for (const p of powerups) this.drawPowerup(ctx, p);
    for (const o of fallingObstacles) this.drawFalling(ctx, o);
    for (const en of enemies) this.drawEnemy(ctx, en);
    // Po ostatnim zgonie kurkę zastępuje odlatujący duszek;
    // w trakcie rundy nietykalność po trafieniu — kurka mruga
    if (ghost.active) {
      this.drawGhost(ctx, ts);
    } else if (gameState.invulnUntil <= physics.now || Math.floor(ts / 90) % 2 === 0) {
      this.drawChicken(ctx, physics.player);
    }

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

    ctx.restore();

    // Demo attract-mode na ekranach menu
    if (this.demoOn) this.drawDemo(ctx, w, h, ts);

    // Pasek statusu NES — tylko w trakcie gry
    if (gameState.running) this.drawHUD(ctx, w);

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

    if (gameState.level > 0) {
      ctx.fillStyle = '#fcfcfc';
      ctx.fillText('LV' + gameState.level, 80, 4);
    }

    const heartsX = gameState.level > 0 ? 118 : 106;
    for (let i = 0; i < Math.max(0, Math.min(5, gameState.lives)); i++) {
      drawSprite(ctx, HEART, HEART_PAL, heartsX + i * 9, 7, 1);
    }

    drawSprite(ctx, EGG, { W: '#fcfcfc', S: '#b0b0b0' }, 174, 7, 1);
    ctx.fillStyle = '#fcfcfc';
    ctx.fillText('x' + gameState.collected, 182, 4);

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
   * Segment ziemi trybu przygody — te same kafelki co drawGround,
   * obcięte do [x0, x1], plus ciemne "klify" na końcach nad przepaścią.
   */
  private drawGroundSeg(ctx: CanvasRenderingContext2D, g: Matter.Body): void {
    const x0 = Math.round(g.bounds.min.x), x1 = Math.round(g.bounds.max.x);
    const top = VIEW_H - GROUND_H;

    ctx.fillStyle = C.dirt;
    ctx.fillRect(x0, top, x1 - x0, GROUND_H);

    // Dithering dirta — to samo ziarno co w drawGround, wycinane do segmentu
    ctx.fillStyle = C.dirtDark;
    for (let ty = top + 8; ty < VIEW_H; ty += 8) {
      for (let tx = Math.ceil(x0 / 8) * 8; tx + 6 <= x1; tx += 8) {
        const seed = (tx * 31 + ty * 17) % 5;
        if (seed === 0) ctx.fillRect(tx + 1, ty + 2, 3, 2);
        if (seed === 2) ctx.fillRect(tx + 4, ty + 5, 2, 2);
        if (seed === 4) ctx.fillRect(tx + 5, ty + 1, 2, 3);
      }
    }

    // Klify na końcach segmentu — optycznie oddzielają przepaść
    ctx.fillStyle = C.dirtDark;
    ctx.fillRect(x0, top + 4, 3, GROUND_H - 4);
    ctx.fillRect(x1 - 3, top + 4, 3, GROUND_H - 4);
    ctx.fillStyle = C.black;
    ctx.fillRect(x0, top, 1, GROUND_H);
    ctx.fillRect(x1 - 1, top, 1, GROUND_H);

    // Wierzch trawy
    ctx.fillStyle = C.black;
    ctx.fillRect(x0, top, x1 - x0, 1);
    ctx.fillStyle = C.grassLight;
    ctx.fillRect(x0, top + 1, x1 - x0, 3);
    ctx.fillStyle = C.grass;
    ctx.fillRect(x0, top + 4, x1 - x0, 4);
    for (let tx = Math.ceil(x0 / 16) * 16 + 4; tx < x1 - 2; tx += 16) {
      ctx.fillRect(tx, top - 3, 2, 3);
    }
  }

  /** Pływająca platforma — drewniana deska z jasnym wierzchem. */
  private drawPlatform(ctx: CanvasRenderingContext2D, p: Matter.Body): void {
    const x0 = Math.round(p.bounds.min.x), x1 = Math.round(p.bounds.max.x);
    const y0 = Math.round(p.bounds.min.y), y1 = Math.round(p.bounds.max.y);
    ctx.fillStyle = '#a05a18';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = '#f8b800';
    ctx.fillRect(x0, y0, x1 - x0, 2);
    ctx.fillStyle = '#5c2800';
    ctx.fillRect(x0, y1 - 2, x1 - x0, 2);
    ctx.fillRect(x0, y0, 1, y1 - y0);
    ctx.fillRect(x1 - 1, y0, 1, y1 - y0);
  }

  /** Meta poziomu przygody: kurnik + koszyczek ze złotymi jajkami. */
  private drawGoal(ctx: CanvasRenderingContext2D): void {
    const gx = Math.round(levelState.goalX);
    const top = VIEW_H - GROUND_H;
    drawSprite(ctx, COOP, COOP_PAL, gx + 22, top - COOP.length * 2, 4);
    // Koszyczek przed drzwiczkami kurnika
    drawSprite(ctx, BASKET, BASKET_PAL, gx + 24, top - BASKET.length, 2);
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

    // Paski HP dla tanków i bossa — węższe przy dużym HP wilków z aren
    if (d.hp > 1) {
      ctx.fillStyle = '#f83800';
      const pw = d.hp > 10 ? 3 : 6;
      for (let hp = 0; hp < d.hp - 1; hp++) {
        ctx.fillRect(x - d.r + hp * (pw + 2), y - d.r - 6, pw, 3);
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

  /**
   * Duszek kurki po ostatnim zgonie: sylwetka w bladej palecie unosi się
   * do nieba (lekkie kołysanie i machanie skrzydełkami), z aureolą nad
   * głową; pod koniec pauzy rozpływa się w powietrzu.
   */
  private drawGhost(ctx: CanvasRenderingContext2D, ts: number): void {
    const t = ts - ghost.startedAt;
    const x = Math.round(ghost.x + Math.sin(t * 0.004) * 6);
    const y = Math.round(ghost.y - t * 0.055);
    ctx.globalAlpha = t < 1500 ? 0.85 : Math.max(0, 0.85 * (1 - (t - 1500) / 700));

    // Aureola — złoty pierścień nad głową
    ctx.fillStyle = '#f8d800';
    ctx.fillRect(x - 5, y - 16, 10, 2);
    ctx.fillRect(x - 3, y - 17, 6, 1);

    drawSprite(ctx, CHICKEN, GHOST_PAL, x, y, 2);

    // Machające skrzydełka — po obu stronach tułowia
    const flap = Math.sin(ts * 0.02) > 0 ? 0 : 2;
    ctx.fillStyle = '#e0f4ff';
    ctx.fillRect(x - 16, y - 3 - flap, 4, 3);
    ctx.fillRect(x + 12, y - 3 - flap, 4, 3);
    ctx.globalAlpha = 1;
  }

  /** Przeszkoda spadająca: ptak z machaniem skrzydeł, pająk albo kamień. */
  private drawFalling(ctx: CanvasRenderingContext2D, o: Matter.Body): void {
    const d = o.gameData as FallingData;
    if (d.type === 'bird') {
      const flap = Math.sin(now() * 0.02) > 0 ? -2 : 0;
      drawSprite(ctx, BIRD, BIRD_PAL, o.position.x, o.position.y + flap, 2);
    } else if (d.type === 'spider') {
      drawSprite(ctx, SPIDER, SPIDER_PAL, o.position.x, o.position.y, 2);
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
