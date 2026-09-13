/**
 * SFX — WebAudio square/noise, zero assetów (ticket E).
 *
 * Mapowanie SimEvent → dźwięk: main.ts karmi playEvents() zdarzeniami
 * simu (u gościa przychodzą w snapshocie). Wszystko syntezowane —
 * bez plików, zgodnie z zasadą offline z AGENTS.md.
 */

import type { SimEvent, ZoneId } from '../core/types';
import { ZONE_GLUE, ZONE_SNOW, ZONE_WATER } from '../core/types';

let ac: AudioContext | null = null;
let muted = false;

function ctx(): AudioContext {
  if (!ac) ac = new AudioContext();
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

function tone(f: number, type: OscillatorType, dur: number, vol = 0.07, slide?: number): void {
  if (muted) return;
  try {
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur);
  } catch { /* audio zablokowane */ }
}

/** Biały szum — eksplozje i splash. `lowTo` = sweep filtra w dół. */
function noise(dur: number, vol = 0.08, low = 400, lowTo?: number): void {
  if (muted) return;
  try {
    const c = ctx();
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(low, c.currentTime);
    if (lowTo != null) {
      f.frequency.exponentialRampToValueAtTime(Math.max(40, lowTo), c.currentTime + dur);
    }
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(c.destination);
    src.start();
  } catch { /* audio zablokowane */ }
}

/** Start rakiety: whoosh szumu w górę + narastający bas silnika. */
function rocketLaunch(): void {
  noise(0.4, 0.07, 3000, 400);
  tone(120, 'sawtooth', 0.35, 0.06, 320);
}

/** Eksplozja rakiety: niski uder + trzask szumu. */
function bigBoom(): void {
  tone(90, 'sawtooth', 0.5, 0.12, 28);
  noise(0.45, 0.11, 500, 120);
  setTimeout(() => noise(0.2, 0.06, 1800), 60);
}

export function setMuted(m: boolean): void {
  muted = m;
  if (m) setThrust(false);
}

// ---- Planowanie na zegarze AudioContext (jingle splasha) ----

/** Ton zaplanowany na `when` (c.currentTime + offset) — sekwencje z góry. */
export function toneAt(freq: number, type: OscillatorType, dur: number, when: number, vol = 0.07, slide?: number): void {
  if (muted || !ac) return;
  try {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    if (slide != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), when + dur);
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g).connect(ac.destination);
    o.start(when);
    o.stop(when + dur);
  } catch { /* audio zablokowane */ }
}

/** Szum highpass zaplanowany na `when` — syk/trzask kineskopu w splashu. */
export function noiseAt(dur: number, when: number, vol = 0.08, highFreq = 4000): void {
  if (muted || !ac) return;
  try {
    const c = ac;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(highFreq, when);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(when);
    src.stop(when + dur);
  } catch { /* audio zablokowane */ }
}

/**
 * Odpala fn z AudioContext, gdy dźwięk realnie zadziała (ctx running).
 * isActive() — np. splash wciąż trwa; po skipie sekwencja się nie odpala.
 */
export function runAudio(fn: (c: AudioContext) => void, isActive: () => boolean): void {
  const c = ctx();
  void c.resume().then(() => {
    if (!isActive() || c.state !== 'running') return;
    fn(c);
  }, () => { /* autoplay zablokowany */ });
}

/** true = AudioContext już gra (autoplay dozwolony, gest niepotrzebny). */
export function audioUnlocked(): Promise<boolean> {
  const c = ctx();
  return c.resume().then(() => c.state === 'running', () => false);
}

// ---- Blipy UI (kursor menu) ----

/** Ruch kursora w menu — krótki "blip" w stylu NES. */
export function uiMove(): void {
  tone(1100, 'square', 0.05, 0.08);
}

/** Potwierdzenie wyboru w menu — dwa tony w górę. */
export function uiOk(): void {
  tone(660, 'square', 0.06, 0.08);
  setTimeout(() => tone(990, 'square', 0.1, 0.08), 60);
}

// ---- Pętla silnika (ciąg trzymany) ----

let engine: { stop(): void; gain: GainNode } | null = null;

/** Włącz/wyłącz buczenie silnika (wołane co klatkę z lastBits własnego jeta). */
export function setThrust(on: boolean): void {
  if (on && !engine && !muted) {
    try {
      const c = ctx();
      // Szumowy spaliny + niski bas silnika.
      const n = c.sampleRate;
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 240;
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = 55;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.045, c.currentTime + 0.08);
      src.connect(f).connect(g);
      o.connect(g);
      g.connect(c.destination);
      src.start(); o.start();
      engine = {
        gain: g,
        stop() { src.stop(); o.stop(); g.disconnect(); },
      };
    } catch { /* audio zablokowane */ }
  } else if (!on && engine) {
    const e = engine;
    engine = null;
    try {
      const c = ctx();
      e.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.05);
      setTimeout(() => e.stop(), 200);
    } catch { e.stop(); }
  }
}

function zoneSfx(zone: ZoneId): void {
  if (zone === ZONE_WATER) noise(0.25, 0.09, 900);
  else if (zone === ZONE_SNOW) noise(0.1, 0.03, 2400);
  else if (zone === ZONE_GLUE) tone(140, 'triangle', 0.15, 0.05, 70);
}

/** Zdarzenia simu → dźwięki. Wołać z eventami z każdego ticka/snapshota. */
export function playEvents(ev: SimEvent[]): void {
  for (const e of ev) {
    switch (e.t) {
      case 'fire':
        if (e.kind === 'rocket' || e.kind === 'homing') rocketLaunch();
        else if (e.kind === 'shotgun') noise(0.12, 0.09, 800);
        else if (e.kind === 'mine') tone(330, 'square', 0.1, 0.05, 160);
        else tone(880, 'square', 0.06, 0.045, 220);
        break;
      case 'laser':     tone(1400, 'sawtooth', 0.12, 0.05, 300); break;
      case 'boom':      bigBoom(); break;
      case 'explode':   noise(0.4, 0.1, 500); tone(160, 'sawtooth', 0.4, 0.08, 40); break;
      case 'bailout':   tone(700, 'square', 0.08, 0.06, 1200); setTimeout(() => tone(500, 'square', 0.12, 0.05, 900), 90); break;
      case 'respawn':   tone(440, 'square', 0.1, 0.05, 880); break;
      case 'flagTake':  tone(660, 'square', 0.1, 0.06, 990); break;
      case 'flagScore': tone(988, 'square', 0.08, 0.07); setTimeout(() => tone(1319, 'square', 0.15, 0.07), 80); break;
      case 'flagHome':  tone(550, 'square', 0.08, 0.05, 440); break;
      case 'score':     tone(988, 'square', 0.1, 0.05, 1400); break;
      case 'over':      tone(220, 'sawtooth', 0.8, 0.08, 110); break;
      case 'zone':      zoneSfx(e.zone); break;
      default:          break;
    }
  }
}
