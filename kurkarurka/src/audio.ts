// Dźwięk: efekty syntezowane WebAudio + muzyka.
// Muzyka: "Quarter in the Slot" — mp3 osadzony w buildzie jako data URI
// (#bgMusic); gdy odtworzenie się nie powiedzie, odpala syntezowany chiptune.
let audioCtx: AudioContext | null = null;
let muted = false;
let musicEl: HTMLAudioElement | null = null;

// Leniwe tworzenie AudioContext (+ resume po zablokowanym autoplay).
// Współdzielony kontekst dla wszystkich efektów i muzyki.
function getCtx(): AudioContext {
  if (!audioCtx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AC() as AudioContext;
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

export function setMuted(v: boolean) { muted = v; }
export function isMuted() { return muted; }

const now = () => getCtx().currentTime;

// ---- Kanał szumu (NES noise channel) ----
let noiseBuf: AudioBuffer | null = null;

function getNoiseBuf(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// Impuls szumu przez filtr highpass — uderzenia, trzaski, perkusja.
// Obwiednia exp-down do ~0 na końcu (klasyczny dźwięk chiptune).
export function noise(duration: number, when: number, vol = 0.1, filterFreq = 4000) {
  if (muted) return;
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = getNoiseBuf(c);
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.setValueAtTime(filterFreq, when);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + duration);
  src.connect(f).connect(g).connect(c.destination);
  src.start(when);
  src.stop(when + duration);
}

// Pojedynczy ton oscylatora z obwiednią exp-down. slideTo != null daje
// portamento (narastanie/opadanie wysokości) — np. skok, przegrana.
export function tone(freq: number, type: OscillatorType, duration: number, when: number, vol = 0.08, slideTo: number | null = null) {
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

export function playJump() {
  tone(200, 'square', 0.12, now(), 0.08, 400);
}

export function playCollect() {
  const t = now();
  tone(600, 'square', 0.06, t, 0.08);
  tone(900, 'square', 0.12, t + 0.05, 0.08);
}

export function playGolden() {
  const t = now();
  tone(800, 'square', 0.06, t, 0.1);
  tone(1000, 'square', 0.08, t + 0.05, 0.1);
  tone(1200, 'square', 0.14, t + 0.12, 0.1);
}

export function playStomp() {
  const t = now();
  tone(150, 'square', 0.18, t, 0.12, 40);
  noise(0.15, t, 0.14, 500); // uderzenie — kanał szumu
}

export function playHurt() {
  const t = now();
  tone(300, 'square', 0.25, t, 0.12, 80);
  noise(0.2, t, 0.1, 1200);
}

export function playGameOver() {
  const t = now();
  tone(400, 'square', 0.8, t, 0.12, 40);
  noise(0.6, t + 0.1, 0.1, 400);
}

export function playLevelUp() {
  const t = now();
  tone(500, 'square', 0.1, t, 0.1);
  tone(700, 'square', 0.15, t + 0.1, 0.1);
  tone(1000, 'square', 0.3, t + 0.22, 0.1);
}

export function playPowerUp() {
  const t = now();
  tone(600, 'square', 0.08, t, 0.1);
  tone(800, 'square', 0.1, t + 0.08, 0.1);
  tone(1200, 'square', 0.25, t + 0.16, 0.12);
}

export function playBoss() {
  const t = now();
  tone(120, 'sawtooth', 0.6, t, 0.15, 50);
  tone(80, 'square', 0.5, t + 0.1, 0.12, 30);
  noise(0.5, t, 0.08, 300);
}

// ---- Muzyka: syntezowany chiptune (fallback offline) ----
let musicPlaying = false;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicStep = 0;

// Syntezowany chiptune: sekwenser 8-krokowy co 150 ms —
// bas na triangle, melodia na square, kick/snare/hat z szumu.
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
    // NES: bas na triangle, melodia na square, perkusja na szumie
    if (bass[s]) tone(bass[s], 'triangle', 0.24, t, 0.09);
    if (lead[s]) tone(lead[s], 'square', 0.14, t + 0.02, 0.045);
    if (kick[s]) tone(60, 'sine', 0.08, t, 0.14, 120);
    if (snare[s]) noise(0.06, t + 0.04, 0.09, 1800);
    if (hat[s]) noise(0.02, t + 0.04, 0.03, 8000);
    musicStep++;
  }, 150);
}

export function stopMusic() {
  musicPlaying = false;
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

// Zatrzymuje całą muzykę (chiptune + mp3) — np. przy game over.
export function stopAllMusic() {
  stopMusic();
  musicEl?.pause();
}

// Odpala fn z AudioContext, gdy dźwięk realnie zadziała (ctx w stanie running).
// isActive() — np. splash wciąż trwa; po skipie sekwencja się nie odpala.
// Przy zablokowanym autoplay resume() zostaje pending i nic nie gra.
export function runAudio(fn: (c: AudioContext) => void, isActive: () => boolean) {
  const c = getCtx();
  void c.resume().then(() => {
    if (muted || !isActive() || c.state !== 'running') return;
    fn(c);
  }, () => { /* autoplay zablokowany */ });
}

// true = AudioContext już gra (autoplay dozwolony, gest niepotrzebny).
export function audioUnlocked(): Promise<boolean> {
  const c = getCtx();
  return c.resume().then(() => c.state === 'running', () => false);
}

// ---- mp3 z fallbackiem na syntezator ----
// Rejestruje element <audio> z osadzonym mp3 (wywoływane z initLogic).
export function initMusic(el: HTMLAudioElement) {
  musicEl = el;
}

// Próbuje odpalić mp3; przy braku sieci/źródła przechodzi na chiptune.
export async function tryPlay() {
  if (muted) return;
  if (musicEl) {
    try {
      await musicEl.play();
      stopMusic();
      musicEl.muted = false;
      return;
    } catch {
      // offline / brak autoodtwarzania — fallback niżej
    }
  }
  startMusic();
}
