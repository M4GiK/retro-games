/**
 * System dźwięku — efekty syntezowane WebAudio + muzyka.
 *
 * Klasa AudioSystem jest fasadą nad Web Audio API: syntezuje efekty
 * w kanałach w stylu NES (square/triangle/noise) i zarządza muzyką.
 *
 * Muzyka: mp3 osadzone w buildzie jako data URI — #bgMusic dla przygody
 * ("Quarter in the Slot"), #bgMusicHard dla koszmaru ("The Giant's
 * Pounce"); gdy odtworzenie się nie powiedzie, odpala syntezowany
 * chiptune (sekwenser 8-krokowy) jako fallback offline.
 */
import type { GameMode } from '../core/types';

export class AudioSystem {
  /** Współdzielony kontekst WebAudio dla wszystkich efektów i muzyki (leniwy). */
  private ctx: AudioContext | null = null;
  /** Wyciszenie muzyki — przycisk 🔇 odcina tylko muzykę, SFX grają dalej. */
  private musicMuted = false;
  /** Elementy <audio> z osadzonymi mp3 — rejestrowane przez konstruktor. */
  private musicEl: HTMLAudioElement | null;
  private musicHardEl: HTMLAudioElement | null;
  /** Bufor białego szumu — "kanał szumu" NES (uderzenia, trzaski, perkusja). */
  private noiseBuf: AudioBuffer | null = null;
  /** Szyna muzyki: lowpass -> gain -> wyjście. Przy 20 kHz filtr jest
   *  przezroczysty; pauza ścina go do ~650 Hz (efekt "za ścianą"). */
  private musicFilter: BiquadFilterNode | null = null;
  private musicGain: GainNode | null = null;
  /** Elementy mp3 już podpięte do szyny (źródło tworzy się raz na element). */
  private readonly routedEls = new Set<HTMLAudioElement>();

  // ---- Stan sekwencera chiptune (fallback) ----
  private musicPlaying = false;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;

  /** @param musicEl     element <audio> z utworem przygody (może być null).
   *  @param musicHardEl element <audio> z utworem koszmaru (może być null). */
  constructor(musicEl: HTMLAudioElement | null = null, musicHardEl: HTMLAudioElement | null = null) {
    this.musicEl = musicEl;
    this.musicHardEl = musicHardEl;
  }

  /** Bieżący czas zegara WebAudio — baza planowania nut i efektów. */
  private get now(): number {
    return this.getCtx().currentTime;
  }

  /**
   * Leniwe tworzenie AudioContext (+ resume po zablokowanym autoplay).
   * Współdzielony kontekst dla wszystkich efektów i muzyki.
   */
  private getCtx(): AudioContext {
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC() as AudioContext;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Wyciszenie muzyki — efekty SFX nie są objęte. */
  setMusicMuted(v: boolean): void {
    this.musicMuted = v;
  }

  isMusicMuted(): boolean {
    return this.musicMuted;
  }

  /**
   * Przełącza wyciszenie muzyki: synchronizuje elementy <audio>
   * i zatrzymuje sekwenser chiptune. SFX grają niezależnie.
   * @returns nowy stan wyciszenia muzyki (true = wyciszona).
   */
  toggleMusicMuted(): boolean {
    this.setMusicMuted(!this.musicMuted);
    if (this.musicEl) this.musicEl.muted = this.musicMuted;
    if (this.musicHardEl) this.musicHardEl.muted = this.musicMuted;
    if (this.musicMuted) this.stopMusic();
    return this.musicMuted;
  }

  /** Bufor białego szumu 0.5 s — tworzony raz, używany przez wszystkie trzaski. */
  private getNoiseBuf(c: AudioContext): AudioBuffer {
    if (!this.noiseBuf) {
      this.noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  /**
   * Impuls szumu przez filtr highpass — uderzenia, trzaski, perkusja.
   * Obwiednia exp-down do ~0 na końcu (klasyczny dźwięk chiptune).
   * `out` pozwala skierować dźwięk do szyny muzycznej (domyślnie wyjście).
   */
  noise(duration: number, when: number, vol = 0.1, filterFreq = 4000, out?: AudioNode): void {
    const c = this.getCtx();
    const src = c.createBufferSource();
    src.buffer = this.getNoiseBuf(c);
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(filterFreq, when);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + duration);
    src.connect(f).connect(g).connect(out ?? c.destination);
    src.start(when);
    src.stop(when + duration);
  }

  /**
   * Pojedynczy ton oscylatora z obwiednią exp-down. slideTo != null daje
   * portamento (narastanie/opadanie wysokości) — np. skok, przegrana.
   * `out` pozwala skierować dźwięk do szyny muzycznej (domyślnie wyjście).
   */
  tone(freq: number, type: OscillatorType, duration: number, when: number, vol = 0.08, slideTo: number | null = null, out?: AudioNode): void {
    const c = this.getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), when + duration);
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain).connect(out ?? c.destination);
    osc.start(when);
    osc.stop(when + duration);
  }

  /** Wspólna szyna muzyki (mp3 + chiptune): wejście = filtr lowpass. */
  private musicBus(): AudioNode {
    const c = this.getCtx();
    if (!this.musicFilter) {
      this.musicFilter = c.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 20000;
      this.musicGain = c.createGain();
      this.musicFilter.connect(this.musicGain).connect(c.destination);
    }
    return this.musicFilter;
  }

  /** Podpina element mp3 do szyny — raz na element; bez tego gra wprost. */
  private routeMusic(el: HTMLAudioElement): void {
    if (this.routedEls.has(el)) return;
    try {
      this.getCtx().createMediaElementSource(el).connect(this.musicBus());
      this.routedEls.add(el);
    } catch { /* element zostaje bez szyny — muzyka gra normalnie */ }
  }

  /** Tłumienie muzyki na czas pauzy — lowpass ~650 Hz + przyciszenie. */
  setMusicMuffled(m: boolean): void {
    if (!this.ctx || !this.musicFilter || !this.musicGain) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(m ? 650 : 20000, t, 0.05);
    this.musicGain.gain.setTargetAtTime(m ? 0.5 : 1, t, 0.05);
  }

  // ---- Efekty grywalnościowe (SFX) ----

  /** Ruch kursora w menu — krótki "blip" kursora w stylu NES. */
  playMove(): void {
    this.tone(1100, 'square', 0.05, this.now, 0.08);
  }

  /** Skok kurki — narastający kwadrat. */
  playJump(): void {
    this.tone(200, 'square', 0.12, this.now, 0.08, 400);
  }

  /** Zebranie zwykłego jajka — dwa krótkie tony. */
  playCollect(): void {
    const t = this.now;
    this.tone(600, 'square', 0.06, t, 0.08);
    this.tone(900, 'square', 0.12, t + 0.05, 0.08);
  }

  /** Zebranie złotego jajka — trzy tonowa fanfara. */
  playGolden(): void {
    const t = this.now;
    this.tone(800, 'square', 0.06, t, 0.1);
    this.tone(1000, 'square', 0.08, t + 0.05, 0.1);
    this.tone(1200, 'square', 0.14, t + 0.12, 0.1);
  }

  /** Stratowanie wroga — uderzenie: niski ton + kanał szumu. */
  playStomp(): void {
    const t = this.now;
    this.tone(150, 'square', 0.18, t, 0.12, 40);
    this.noise(0.15, t, 0.14, 500);
  }

  /** Zgon kurki — lament: pisk trafienia, opadający ton i trzask. */
  playDeath(): void {
    const t = this.now;
    this.tone(700, 'square', 0.08, t, 0.1, 480);
    this.tone(320, 'square', 0.22, t + 0.08, 0.12, 120);
    this.noise(0.15, t, 0.09, 1500);
  }

  /** Duszek kurki wznosi się do nieba — łagodny, wznoszący się ton. */
  playSoul(): void {
    const t = this.now;
    this.tone(300, 'sine', 1.4, t, 0.07, 1200);
    this.tone(600, 'sine', 1.4, t + 0.15, 0.05, 2400);
  }

  /** Koniec gry — długi zstępujący ton + szum. */
  playGameOver(): void {
    const t = this.now;
    this.tone(400, 'square', 0.8, t, 0.12, 40);
    this.noise(0.6, t + 0.1, 0.1, 400);
  }

  /** Awans poziomu trudności — wznosząca się trójka tonów. */
  playLevelUp(): void {
    const t = this.now;
    this.tone(500, 'square', 0.1, t, 0.1);
    this.tone(700, 'square', 0.15, t + 0.1, 0.1);
    this.tone(1000, 'square', 0.3, t + 0.22, 0.1);
  }

  /** Zebranie power-upa — radosny arpeggio. */
  playPowerUp(): void {
    const t = this.now;
    this.tone(600, 'square', 0.08, t, 0.1);
    this.tone(800, 'square', 0.1, t + 0.08, 0.1);
    this.tone(1200, 'square', 0.25, t + 0.16, 0.12);
  }

  /** Wejście bossa — niski pomruk sawtooth + uderzenie. */
  playBoss(): void {
    const t = this.now;
    this.tone(120, 'sawtooth', 0.6, t, 0.15, 50);
    this.tone(80, 'square', 0.5, t + 0.1, 0.12, 30);
    this.noise(0.5, t, 0.08, 300);
  }

  /** Pulsowanie bossa przed szarżą — narastający pomruk ostrzeżenia. */
  playCharge(): void {
    const t = this.now;
    this.tone(90, 'sawtooth', 0.7, t, 0.1, 420);
    this.noise(0.6, t, 0.03, 900);
  }

  /** Wystrzał szarży — świst szumu + opadający ton rozpędu. */
  playDash(): void {
    const t = this.now;
    this.noise(0.35, t, 0.13, 2600);
    this.tone(320, 'square', 0.3, t, 0.07, 70);
  }

  /** Fanfara po pokonaniu bossa — wznoszące arpeggio z finałowym akordem. */
  playVictory(): void {
    const t = this.now;
    const notes = [392.0, 523.25, 659.25, 783.99, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this.tone(f, 'square', i === notes.length - 1 ? 0.8 : 0.12, t + i * 0.12, 0.09);
    });
    // Akord finałowy: bas + piąta na triangle, iskierki z szumu.
    this.tone(196.0, 'triangle', 0.9, t + 0.72, 0.11);
    this.tone(261.63, 'triangle', 0.9, t + 0.72, 0.08);
    this.noise(0.3, t + 0.72, 0.04, 7000);
  }

  // ---- Muzyka: syntezowany chiptune (fallback offline) ----

  /**
   * Syntezowany chiptune: sekwenser 8-krokowy co 150 ms —
   * bas na triangle, melodia na square, kick/snare/hat z szumu.
   */
  private startMusic(): void {
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    const bass = [65.41, 65.41, 98.00, 73.42, 65.41, 73.42, 98.00, 82.41];
    const lead = [261.63, 0, 329.63, 392.00, 523.25, 0, 392.00, 329.63];
    const kick = [1, 0, 0, 0, 1, 0, 1, 0];
    const snare = [0, 0, 0, 0, 1, 0, 0, 0];
    const hat = [0, 1, 0, 1, 0, 1, 0, 1];
    this.musicTimer = setInterval(() => {
      if (!this.musicPlaying) return;
      const t = this.now + 0.06;
      const s = this.musicStep % 8;
      const out = this.musicBus();
      // NES: bas na triangle, melodia na square, perkusja na szumie
      if (bass[s]) this.tone(bass[s], 'triangle', 0.24, t, 0.09, null, out);
      if (lead[s]) this.tone(lead[s], 'square', 0.14, t + 0.02, 0.045, null, out);
      if (kick[s]) this.tone(60, 'sine', 0.08, t, 0.14, 120, out);
      if (snare[s]) this.noise(0.06, t + 0.04, 0.09, 1800, out);
      if (hat[s]) this.noise(0.02, t + 0.04, 0.03, 8000, out);
      this.musicStep++;
    }, 150);
  }

  /** Zatrzymuje sekwenser chiptune. */
  private stopMusic(): void {
    this.musicPlaying = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  /** Zatrzymuje całą muzykę (chiptune + oba mp3) — np. przy game over. */
  stopAllMusic(): void {
    this.stopMusic();
    this.musicEl?.pause();
    this.musicHardEl?.pause();
    this.setMusicMuffled(false);
  }

  /**
   * Odpala fn z AudioContext, gdy dźwięk realnie zadziała (ctx w stanie
   * running). isActive() — np. splash wciąż trwa; po skipie sekwencja
   * się nie odpala. Przy zablokowanym autoplay resume() zostaje pending
   * i nic nie gra.
   */
  runAudio(fn: (c: AudioContext) => void, isActive: () => boolean): void {
    const c = this.getCtx();
    void c.resume().then(() => {
      if (!isActive() || c.state !== 'running') return;
      fn(c);
    }, () => { /* autoplay zablokowany */ });
  }

  /** true = AudioContext już gra (autoplay dozwolony, gest niepotrzebny). */
  audioUnlocked(): Promise<boolean> {
    const c = this.getCtx();
    return c.resume().then(() => c.state === 'running', () => false);
  }

  /**
   * Odpala mp3 właściwe dla trybu gry; przy braku źródła próbuje drugą
   * ścieżkę, a gdy i to się nie powiedzie — przechodzi na chiptune.
   */
  async tryPlay(mode: GameMode = 'normal'): Promise<void> {
    if (this.musicMuted) return;
    const [first, second] = mode === 'hard'
      ? [this.musicHardEl, this.musicEl]
      : [this.musicEl, this.musicHardEl];
    second?.pause();
    for (const el of [first, second]) {
      if (!el) continue;
      this.routeMusic(el);
      try {
        await el.play();
        this.stopMusic();
        el.muted = false;
        return;
      } catch {
        // brak pliku / zablokowane autoodtwarzanie — próbujemy dalej
      }
    }
    this.startMusic();
  }
}
