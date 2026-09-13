let audioCtx = null;
let muted = false;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function setMuted(v) { muted = v; }
export function isMuted() { return muted; }

function now() { return getCtx().currentTime; }

function tone(freq, type, duration, when, vol = 0.08, slideTo = null) {
  if (muted) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), when + duration);
  gain.gain.setValueAtTime(vol, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(when);
  osc.stop(when + duration);
}

function note(freq, type, duration, when, vol = 0.08) {
  tone(freq, type, duration, when, vol);
}

export function playJump() {
  const t = now();
  tone(200, 'square', 0.12, t, 0.08, 400);
}

export function playCollect() {
  const t = now();
  note(600, 'square', 0.06, t, 0.08);
  note(900, 'square', 0.12, t + 0.05, 0.08);
}

export function playGolden() {
  const t = now();
  note(800, 'square', 0.06, t, 0.1);
  note(1000, 'square', 0.08, t + 0.05, 0.1);
  note(1200, 'square', 0.14, t + 0.12, 0.1);
}

export function playStomp() {
  const t = now();
  tone(150, 'sawtooth', 0.18, t, 0.12, 40);
  tone(80, 'square', 0.12, t, 0.1, 30);
}

export function playHurt() {
  const t = now();
  tone(300, 'sawtooth', 0.25, t, 0.12, 80);
}

export function playGameOver() {
  const t = now();
  tone(400, 'sawtooth', 0.8, t, 0.12, 40);
}

export function playLevelUp() {
  const t = now();
  note(500, 'square', 0.1, t, 0.1);
  note(700, 'square', 0.15, t + 0.1, 0.1);
  note(1000, 'square', 0.3, t + 0.22, 0.1);
}

export function playPowerUp() {
  const t = now();
  note(600, 'square', 0.08, t, 0.1);
  note(800, 'square', 0.1, t + 0.08, 0.1);
  note(1200, 'square', 0.25, t + 0.16, 0.12);
}

export function playBoss() {
  const t = now();
  tone(120, 'sawtooth', 0.6, t, 0.15, 50);
  tone(80, 'square', 0.5, t + 0.1, 0.12, 30);
}

export function playShoot() {
  const t = now();
  tone(900, 'square', 0.05, t, 0.06, 1200);
  tone(600, 'square', 0.08, t + 0.03, 0.04, 300);
}

export function playExplosion() {
  const t = now();
  tone(200, 'sawtooth', 0.15, t, 0.1, 40);
  tone(100, 'square', 0.25, t, 0.12, 30);
  tone(50, 'sawtooth', 0.35, t + 0.05, 0.1, 20);
}

let musicPlaying = false;
let musicTimer = null;
let musicStep = 0;

export function startMusic() {
  if (musicPlaying) return;
  musicPlaying = true;
  const bass = [65.41, 65.41, 98.00, 73.42, 65.41, 73.42, 98.00, 82.41];
  const lead = [261.63, 0, 329.63, 392.00, 523.25, 0, 392.00, 329.63];
  const kick = [1, 0, 0, 0, 1, 0, 1, 0];
  const snare = [0, 0, 0, 0, 1, 0, 0, 0];
  const hat = [0, 1, 0, 1, 0, 1, 0, 1];
  musicTimer = setInterval(() => {
    if (!musicPlaying) return;
    const t = now() + 0.06;
    const s = musicStep % 8;
    if (bass[s]) note(bass[s], 'square', 0.24, t, 0.055);
    if (lead[s]) note(lead[s], 'square', 0.14, t + 0.02, 0.045);
    if (kick[s]) tone(60, 'sine', 0.08, t, 0.14, 120);
    if (snare[s]) tone(180, 'square', 0.05, t + 0.04, 0.08, 2500);
    if (hat[s]) tone(12000, 'square', 0.02, t + 0.04, 0.02);
    musicStep++;
  }, 150);
}

export function stopMusic() {
  musicPlaying = false;
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
