// Splash "M4GIK SOFTWARE" — 8-bit / CRT w klimacie automatów Namco.
// Fazy: idle ("INSERT COIN" — bramka odblokowująca dźwięk gestem)
//   -> play (power-on CRT, pac-man wygryza kropki z duchami na karku,
//      litery logo wskakują po kolei, napisy prawne) -> power-off -> boot.
// runSplash zwraca handleInput: w idle input odpala animację, w play — skipuje.
import { runAudio, audioUnlocked, tone, noise } from './audio';

const W = 256;
const H = 240;

const COL = {
  bg: '#000000',
  white: '#fcfcfc',
  yellow: '#ffcc00',
  cyan: '#00e5ff',
  cyanDark: '#005566',
  pink: '#ff0055',
  dim: '#7fa0c8',
  led: '#f83800',
};

// Oś czasu fazy "play" (ms)
const T_ON = 480;
const T_DOTS = 560;
const T_PAC0 = 700;
const PAC_SPEED = 0.11;        // px/ms
const T_SOFT = 3400;
const T_LEGAL = 3700;
const T_OFF = 5000;
const T_END = 5550;

const LOGO = 'M4GIK';
const LOGO_SIZE = 24;
const LOGO_Y = 72;
const LANE_Y = 150;

// Kropki na torze pac-mana — co 10 px od x=10 do x=240
const DOTS: number[] = [];
for (let x = 10; x <= 240; x += 10) DOTS.push(x);

// Duchy goniące pac-mana — kolory jak Blinky/Pinky/Inky/Clyde
const GHOST_COLORS = ['#f83800', '#ff9de2', '#00e5ff', '#f8b800'];

const PAC_OPEN = [
  '..YYYY...',
  '.YYYYYY..',
  'YYYYYY...',
  'YYYYY....',
  'YYYY.....',
  'YYYYY....',
  'YYYYYY...',
  '.YYYYYY..',
  '..YYYY...',
];
const PAC_SHUT = [
  '..YYYY...',
  '.YYYYYY..',
  'YYYYYYYY.',
  'YYYYYYYYY',
  'YYYYYYYYY',
  'YYYYYYYYY',
  'YYYYYYYY.',
  '.YYYYYY..',
  '..YYYY...',
];
const GHOST = [
  '.GGGGGG.',
  'GGGGGGGG',
  'GEGGGEGG',
  'GGGGGGGG',
  'GGGGGGGG',
  'GGGGGGGG',
  'G.GG.G.G',
];

// Deterministyczny "szum" — glitchy bez Math.random w pętli.
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function pacX(t: number): number {
  return t < T_PAC0 ? -20 : -20 + (t - T_PAC0) * PAC_SPEED;
}

// Moment zjedzenia kropki na pozycji x (usta pac-mana ~5 px przed środkiem).
function dotEatenAt(dotX: number): number {
  return T_PAC0 + (dotX + 20 - 5) / PAC_SPEED;
}

export function runSplash(canvas: HTMLCanvasElement, onDone: () => void): () => void {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) { onDone(); return () => {}; }
  ctx.imageSmoothingEnabled = false;

  const buf = document.createElement('canvas');
  buf.width = W;
  buf.height = H;
  const bctx = buf.getContext('2d')!;
  bctx.imageSmoothingEnabled = false;

  bctxForMeasure = bctx;
  isActiveRef = () => !finished && phase === 'play';

  let raf = 0;
  let finished = false;
  let phase: 'idle' | 'play' = 'idle';
  let fontsReady = false;
  let pendingBegin = false;
  let t0 = 0;
  const idleT0 = performance.now();

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    onDone();
  };

  const begin = () => {
    if (finished || phase === 'play') return;
    if (!fontsReady) { pendingBegin = true; return; }
    phase = 'play';
    t0 = performance.now();
    startJingle();
  };

  const frame = () => {
    if (finished) return;
    const now = performance.now();
    if (phase === 'idle') {
      drawIdle(ctx, now - idleT0);
    } else {
      const t = now - t0;
      if (t >= T_END) { finish(); return; }
      drawFrame(bctx, t);
      composite(ctx, buf, t);
    }
    raf = requestAnimationFrame(frame);
  };

  // Pixel-font musi być gotowy zanim wstąpią litery logo (max 350 ms czekania).
  const fontReady = Promise.all([
    document.fonts.load(`${LOGO_SIZE}px "Press Start 2P"`),
    document.fonts.load('16px "Press Start 2P"'),
    document.fonts.load('8px "Press Start 2P"'),
  ]);
  Promise.race([fontReady, new Promise(r => setTimeout(r, 350))]).then(() => {
    fontsReady = true;
    if (pendingBegin) begin();
  }, () => { fontsReady = true; if (pendingBegin) begin(); });

  raf = requestAnimationFrame(frame);

  // Autoplay dozwolony? -> autostart po chwili standby. W przeciwnym razie
  // czekamy na gest (gwarantowany dźwięk); po 8 s odpalamy i tak (ew. cisza).
  void audioUnlocked().then(ok => {
    if (ok) setTimeout(begin, 900);
  });
  setTimeout(begin, 8000);

  // Input: idle -> begin (gest odblokowuje audio); play -> skip do boot.
  return () => {
    if (finished) return;
    if (phase === 'idle') begin();
    else finish();
  };
}

// ---- Dźwięk sekwencji (oszacowany na osi "play") ----
function startJingle() {
  runAudio((c) => {
    const t0 = c.currentTime + 0.05;
    // wrzut monety — klasyczny dwudźwięk automatów
    tone(988, 'square', 0.06, t0, 0.09);
    tone(1319, 'square', 0.12, t0 + 0.06, 0.09);
    // power-on kineskopu: syk + narastający przydźwięk
    noise(0.2, t0 + 0.2, 0.12, 2400);
    tone(48, 'sawtooth', 0.4, t0 + 0.2, 0.06, 96);
    // waka-waka — naprzemienne dwa tony przy każdej zjedzonej kropce
    DOTS.forEach((dx, i) => {
      const t = t0 + dotEatenAt(dx) / 1000;
      const hi = i % 2 === 0;
      tone(hi ? 480 : 290, 'square', 0.06, t, 0.05, hi ? 380 : 340);
    });
    // litery logo wskakują — krótki pop przy każdej
    logoCenters(bctxCtx()).forEach(cx => {
      const tp = t0 + (T_PAC0 + (cx + 20) / PAC_SPEED) / 1000;
      tone(520, 'square', 0.07, tp, 0.08, 980);
    });
    // SOFTWARE — ding
    tone(784, 'square', 0.09, t0 + T_SOFT / 1000, 0.07);
    tone(1175, 'square', 0.16, t0 + (T_SOFT + 100) / 1000, 0.07);
    // power-off: schodzący ton + trzask kineskopu
    tone(620, 'square', 0.3, t0 + T_OFF / 1000, 0.1, 55);
    noise(0.25, t0 + T_OFF / 1000, 0.1, 900);
  }, isActiveRef);
}

// Kontekst bufora dla pomiarów tekstu w jingle (wstrzykiwany z runSplash).
let bctxForMeasure: CanvasRenderingContext2D | null = null;
let isActiveRef: () => boolean = () => false;
function bctxCtx(): CanvasRenderingContext2D { return bctxForMeasure!; }

function logoCenters(g: CanvasRenderingContext2D): number[] {
  g.font = `${LOGO_SIZE}px "Press Start 2P", monospace`;
  const centers: number[] = [];
  let acc = 0;
  for (const ch of LOGO) { const w = g.measureText(ch).width; centers.push(acc + w / 2); acc += w; }
  const lx = (W - acc) / 2;
  return centers.map(c => c + lx);
}

// ---- Ekran standby: martwy automat czekający na monetę ----
function drawIdle(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  pxText(ctx, 'INSERT COIN', W / 2, 96, 16, COL.white);
  if (Math.floor(t / 530) % 2 === 0) {
    pxText(ctx, 'PUSH START BUTTON', W / 2, 128, 8, COL.yellow);
  }
  pxText(ctx, 'CREDIT 00', W / 2, 200, 8, COL.dim);

  // Dioda standby w rogu — mruga jak w sprzęcie CRT
  if (Math.floor(t / 800) % 2 === 0) {
    ctx.fillStyle = COL.led;
    ctx.fillRect(W - 10, H - 10, 3, 3);
  }

  drawCrtOverlay(ctx, t);
}

// ---- Klatka fazy "play" do bufora ----
function drawFrame(g: CanvasRenderingContext2D, t: number) {
  g.fillStyle = COL.bg;
  g.fillRect(0, 0, W, H);

  drawDots(g, t);
  drawPac(g, t);
  drawGhosts(g, t);
  drawLogo(g, t);

  if (t > T_SOFT) {
    const flash = t - T_SOFT < 90;
    pxText(g, 'SOFTWARE', W / 2, 118, 16, flash ? COL.white : COL.cyan, flash ? undefined : COL.cyanDark);
  }
  if (t > T_LEGAL) {
    pxText(g, '© 2026 M4GIK SOFTWARE', W / 2, 196, 8, COL.white);
    pxText(g, 'ALL RIGHTS RESERVED', W / 2, 210, 8, COL.dim);
  }

  // Glitch — przesunięty pasek obrazu + sporadyczny śnieg
  if (t > 1200 && t < T_OFF && t % 700 < 70) {
    const seed = Math.floor(t / 700);
    const gy = Math.floor(hash(seed) * (H - 10));
    const gh = 2 + Math.floor(hash(seed + 1) * 4);
    const dx = (hash(seed + 2) > 0.5 ? 1 : -1) * (2 + Math.floor(hash(seed + 3) * 6));
    g.drawImage(g.canvas, 0, gy, W, gh, dx, gy, W, gh);
    if (hash(seed + 4) > 0.55) {
      const ny = Math.floor(hash(seed + 5) * H);
      for (let x = 0; x < W; x += 4) {
        if (hash(seed + x) > 0.5) {
          g.fillStyle = hash(seed + x + 9) > 0.5 ? COL.white : COL.cyan;
          g.fillRect(x, ny, 3, 1);
        }
      }
    }
  }

  drawCrtOverlay(g, t);
}

// Scanliny + pasek odchylania + winieta — wspólne dla idle i play.
function drawCrtOverlay(g: CanvasRenderingContext2D, t: number) {
  const roll = (t * 0.03) % (H + 48) - 24;
  g.fillStyle = 'rgba(255,255,255,0.03)';
  g.fillRect(0, Math.round(roll), W, 24);

  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 1; y < H; y += 2) g.fillRect(0, y, W, 1);

  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.fillRect(0, 0, W, 3); g.fillRect(0, H - 3, W, 3);
  g.fillRect(0, 0, 3, H); g.fillRect(W - 3, 0, 3, H);
  g.fillStyle = 'rgba(0,0,0,0.14)';
  g.fillRect(3, 3, W - 6, 5); g.fillRect(3, H - 8, W - 6, 5);
  g.fillRect(3, 3, 5, H - 6); g.fillRect(W - 8, 3, 5, H - 6);
}

function drawDots(g: CanvasRenderingContext2D, t: number) {
  if (t < T_DOTS) return;
  const px = pacX(t);
  g.fillStyle = COL.white;
  for (const dx of DOTS) {
    if (dx < px + 5) continue; // zjedzona
    g.fillRect(dx - 1, LANE_Y - 1, 2, 2);
  }
}

function blit(g: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, cx: number, cy: number, px: number) {
  const hgt = rows.length;
  const wid = rows[0].length;
  const ox = Math.round(cx - (wid * px) / 2);
  const oy = Math.round(cy - (hgt * px) / 2);
  for (let r = 0; r < hgt; r++) {
    for (let c = 0; c < wid; c++) {
      const col = pal[rows[r][c]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(ox + c * px, oy + r * px, px, px);
    }
  }
}

function drawPac(g: CanvasRenderingContext2D, t: number) {
  if (t < T_DOTS) return;
  const px = pacX(t);
  if (px > W + 20) return;
  const open = Math.floor(t / 110) % 2 === 0;
  blit(g, open ? PAC_OPEN : PAC_SHUT, { Y: COL.yellow }, Math.round(px), LANE_Y, 2);
}

function drawGhosts(g: CanvasRenderingContext2D, t: number) {
  const px = pacX(t);
  for (let i = 0; i < GHOST_COLORS.length; i++) {
    const gx = px - 30 - i * 18;
    if (gx < -10) continue;
    if (gx > W + 10) continue;
    const bob = Math.round(Math.sin(t * 0.015 + i * 1.7) * 2);
    blit(g, GHOST, { G: GHOST_COLORS[i], E: COL.white }, Math.round(gx), LANE_Y + bob, 2);
  }
}

function drawLogo(g: CanvasRenderingContext2D, t: number) {
  g.font = `${LOGO_SIZE}px "Press Start 2P", monospace`;
  g.textBaseline = 'top';
  const widths: number[] = [];
  let acc = 0;
  for (const ch of LOGO) { widths.push(acc); acc += g.measureText(ch).width; }
  const lx = Math.round((W - acc) / 2);
  const px = pacX(t);

  for (let i = 0; i < LOGO.length; i++) {
    // litera wskakuje, gdy pac-man ją "odkryje" — mija jej środek
    const center = lx + widths[i] + g.measureText(LOGO[i]).width / 2;
    if (px < center) break;
    const age = t - (T_PAC0 + (center + 20) / PAC_SPEED);
    const drop = age < 160 ? -Math.round((1 - age / 160) * 10 / 2) * 2 : 0;
    const flash = age < 90;
    const color = LOGO[i] === '4' ? COL.yellow : COL.white;
    const x = Math.round(lx + widths[i]);
    if (!flash) {
      g.fillStyle = COL.pink;
      g.fillText(LOGO[i], x + 2, LOGO_Y + drop + 2);
    }
    g.fillStyle = color;
    g.fillText(LOGO[i], x, LOGO_Y + drop);
  }
}

function pxText(g: CanvasRenderingContext2D, txt: string, cx: number, y: number, size: number, color: string, shadow?: string) {
  g.font = `${size}px "Press Start 2P", monospace`;
  g.textBaseline = 'top';
  g.textAlign = 'center';
  if (shadow) { g.fillStyle = shadow; g.fillText(txt, cx + 2, y + 2); }
  g.fillStyle = color;
  g.fillText(txt, cx, y);
  g.textAlign = 'left';
}

// ---- Kompozycja: power-on (linia -> ekran) i power-off (ekran -> kreska) ----
function composite(ctx: CanvasRenderingContext2D, buf: HTMLCanvasElement, t: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  if (t < T_ON) {
    const p = t / T_ON;
    const lw = Math.max(4, Math.round(W * Math.min(1, p / 0.3) / 2) * 2);
    const s = Math.max(0, (p - 0.15) / 0.85);
    const hh = Math.max(2, Math.round(H * s * s * (3 - 2 * s) / 2) * 2);
    const dx = (W - lw) / 2;
    const dy = (H - hh) / 2;
    ctx.drawImage(buf, 0, 0, W, H, dx, dy, lw, hh);
    ctx.fillStyle = COL.white;
    ctx.fillRect(dx, dy, lw, 2);
    ctx.fillRect(dx, dy + hh - 2, lw, 2);
    return;
  }

  if (t >= T_OFF) {
    const p = Math.min(1, (t - T_OFF) / (T_END - T_OFF));
    const hh = Math.max(2, Math.round(H * (1 - p * p) / 2) * 2);
    const lw = p > 0.75 ? Math.max(2, Math.round(W * (1 - (p - 0.75) / 0.25) / 2) * 2) : W;
    const dx = (W - lw) / 2;
    const dy = (H - hh) / 2;
    ctx.drawImage(buf, 0, 0, W, H, dx, dy, lw, hh);
    ctx.fillStyle = `rgba(252,252,252,${0.5 + p * 0.5})`;
    ctx.fillRect(dx, dy, lw, 2);
    ctx.fillRect(dx, dy + hh - 2, lw, 2);
    return;
  }

  ctx.drawImage(buf, 0, 0);
  if (hash(Math.floor(t / 90)) > 0.93) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, 0, W, H);
  }
}
