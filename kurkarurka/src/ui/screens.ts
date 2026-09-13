/**
 * Menedżer ekranów — maszyna stanów UI gry.
 *
 * Klasa ScreenManager steruje przepływem:
 *   splash -> boot -> tytuł (demo w tle) -> menu -> gra / ranking / wpis rekordu.
 *
 * Wzorce:
 *  - Maszyna stanów (State Machine): `current` trzyma aktywny ekran,
 *    a onKey dispatchuje wejście per stan — reguły przejść w jednym miejscu.
 *  - Dependency Injection: akcje gry (onStart), audio i renderer
 *    są wstrzykiwane przez konstruktor — UI nie importuje logiki gry.
 *  - Repozytorium: ranking przez klasę Leaderboard (localStorage).
 */
import { physics } from '../engine/physics';
import type { SceneRenderer } from '../render/scene';
import type { AudioSystem } from '../audio/audio';
import { Leaderboard } from './leaderboard';
import { SplashScreen } from './splash';
import type { GameMode } from '../core/types';

/** Identyfikatory ekranów maszyny stanów ('game' = runda bez nakładki DOM). */
type Screen = 'splash' | 'boot' | 'title' | 'menu' | 'rank' | 'hs' | 'over' | 'game';

/** Callbacki zewnętrzne UI — start rundy delegowany do warstwy gry. */
export interface ScreenDeps {
  onStart: (mode: GameMode) => void;
}

/** Skrót do getElementById z rzutowaniem na konkretny typ elementu. */
function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export class ScreenManager {
  // ---- Stan maszyny ----
  private current: Screen = 'splash';
  private menuSel = 0;
  private currentMode: GameMode = 'normal';
  private splash: SplashScreen | null = null;
  private splashDone = false;

  // ---- Stan wpisu rekordu ----
  private pendingScore = 0;
  private pendingEggs = 0;
  private readonly hsLetters = ['A', 'A', 'A'];
  private hsPos = 0;

  /** Repozytorium rekordów (localStorage). */
  private readonly leaderboard = new Leaderboard();

  // ---- Referencje DOM (rozwiązywane w init) ----
  private screens!: Record<Exclude<Screen, 'game'>, HTMLElement>;
  private menuItems!: HTMLElement[];
  private rankList!: HTMLOListElement;
  private overText!: HTMLElement;
  private hsScoreEl!: HTMLElement;
  private hsLets!: HTMLElement[];
  private splashCanvas!: HTMLCanvasElement;

  constructor(
    private readonly deps: ScreenDeps,
    private readonly audio: AudioSystem,
    private readonly renderer: SceneRenderer,
  ) {}

  /**
   * Rozwiązuje referencje DOM, podpina nawigację klawiaturową i dotykową
   * oraz odpala sekwencję startową: splash -> boot -> tytuł.
   */
  init(): void {
    this.screens = {
      splash: el('splash'),
      boot: el('boot'),
      title: el('title'),
      menu: el('menu'),
      rank: el('rank'),
      hs: el('hs'),
      over: el('over'),
    };
    this.menuItems = Array.from(document.querySelectorAll<HTMLElement>('#menuList li'));
    this.rankList = el<HTMLOListElement>('rankList');
    this.overText = el('overText');
    this.hsScoreEl = el('hsScore');
    this.hsLets = Array.from(document.querySelectorAll<HTMLElement>('.hsLet'));
    this.splashCanvas = el<HTMLCanvasElement>('splashFx');

    window.addEventListener('keydown', this.onKey);

    // Dotyk/klik na ekranach
    this.screens.splash.addEventListener('pointerdown', () => this.skipSplash());
    this.screens.boot.addEventListener('pointerdown', () => this.goTitle());
    this.screens.title.addEventListener('pointerdown', () => this.show('menu'));
    this.screens.rank.addEventListener('pointerdown', () => this.show('menu'));

    // Dotyk/mysz: jedno dotknięcie pozycji = wybór + start.
    // (preventDefault na pointerdown tłumi 'click' na iOS — dlatego
    //  aktywujemy bezpośrednio w pointerdown, a nie w click).
    this.menuItems.forEach((li, i) => {
      li.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.menuSel = i;
        this.menuItems.forEach((l, j) => l.classList.toggle('sel', j === this.menuSel));
        this.activateMenuItem();
      });
    });

    this.hsLets.forEach((s, i) => {
      s.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.hsPos = i;
        this.hsCycle(1);
      });
    });
    el<HTMLButtonElement>('hsOk').addEventListener('click', () => this.hsConfirm());

    el<HTMLButtonElement>('retry').addEventListener('click', () => this.activateRetry());
    el<HTMLButtonElement>('toTitle').addEventListener('click', () => this.goTitle());

    // Splash M4GIK -> boot -> tytuł
    this.show('splash');
    this.splashDone = false;
    this.splash = new SplashScreen(this.splashCanvas, this.audio, () => this.enterBoot());
    this.splash.start();
  }

  /**
   * Przejście maszyny stanów: pokazuje ekran i steruje demem w tle.
   * Demo attract-mode gra tylko pod ekranami menu — nigdy w trakcie
   * gry ani na ekranie "over".
   */
  private show(name: Screen): void {
    this.current = name;
    for (const key of Object.keys(this.screens) as (keyof typeof this.screens)[]) {
      this.screens[key].classList.toggle('show', key === name);
    }
    const ghost = name === 'boot' || name === 'title' || name === 'menu' || name === 'rank' || name === 'hs';
    this.renderer.setDemo(ghost);
    if (ghost) { physics.clearEntities(); physics.resetPlayer(); }
  }

  /** Skrót do ekranu tytułowego. */
  private goTitle(): void {
    this.show('title');
  }

  /**
   * Boot = prawdziwa bramka ładowania: czekamy na fonty i bufor muzyki.
   * Pasek pokazuje realny postęp; limity czasu pilnują, by gra nie stanęła.
   */
  private async loadResources(): Promise<void> {
    const startedAt = performance.now();
    const fill = el<HTMLElement>('bootFill');
    const setFill = (p: number) => {
      fill.style.animation = 'none';
      fill.style.width = p + '%';
    };

    // Krok 1: font pixel-art (menu/splash rysują nim tekst na canvasie)
    setFill(15);
    try {
      await Promise.race([document.fonts?.ready ?? Promise.resolve(), delay(2000)]);
    } catch { /* fonty niedostępne — fallback monospace */ }
    setFill(45);

    // Krok 2: muzyka — bufory mp3 obu trybów gotowe do grania
    // (canplaythrough), max 8 s na wszystkie razem.
    const tracks = ['bgMusic', 'bgMusicHard']
      .map(id => document.getElementById(id) as HTMLAudioElement | null)
      .filter((a): a is HTMLAudioElement => a !== null);
    await Promise.race([
      Promise.all(tracks.map(a => {
        if (a.readyState >= 3) return Promise.resolve();
        a.load();
        return new Promise<void>(r => {
          a.addEventListener('canplaythrough', () => r(), { once: true });
          a.addEventListener('error', () => r(), { once: true });
        });
      })),
      delay(8000),
    ]);
    setFill(100);

    // Minimum 1.6 s — logo i pasek mają się "wyświetlić", nie mignąć.
    const elapsed = performance.now() - startedAt;
    if (elapsed < 1600) await delay(1600 - elapsed);
  }

  /** Splash skończony (animacja dobiegła końca) -> boot -> tytuł. */
  private enterBoot(): void {
    this.splashDone = true;
    this.splash = null;
    this.show('boot');
    // Po załadowaniu przechodzimy do tytułu — chyba że user już skipnął
    // i zdążył pójść dalej (menu/gra).
    void this.loadResources().then(() => { if (this.current === 'boot') this.goTitle(); });
  }

  /**
   * Input w trakcie splasha: na "INSERT COIN" odpala animację (gest
   * odblokowuje dźwięk), w trakcie animacji — skipuje do boot.
   */
  private skipSplash(): void {
    if (this.splashDone) return;
    this.splash?.handleInput();
  }

  /** Aktywuje zaznaczoną pozycję menu: start gry albo ekran rankingu. */
  private activateMenuItem(): void {
    if (this.current !== 'menu') return;
    const mode = this.menuItems[this.menuSel].dataset.mode;
    this.audio.playCollect();
    if (mode === 'rank') {
      this.renderRank();
      this.show('rank');
    } else {
      this.currentMode = mode as GameMode;
      this.show('game');
      this.deps.onStart(this.currentMode);
    }
  }

  /** Renderuje tabelę rekordów z repozytorium. */
  private renderRank(): void {
    const scores = this.leaderboard.load();
    if (scores.length === 0) {
      this.rankList.innerHTML = '<li class="empty">Brak rekordów — bądź pierwszy!</li>';
      return;
    }
    this.rankList.innerHTML = scores.map((s, i) =>
      `<li><span>${i + 1}. <b>${s.name}</b></span><span>${s.score} · 🥚${s.eggs} <span class="m">${s.mode}</span></span></li>`
    ).join('');
  }

  // ---- Wpis rekordu ----

  /** Odświeża trzy litery inicjałów i podświetlenie kursora. */
  private hsRender(): void {
    this.hsLets.forEach((s, i) => {
      s.textContent = this.hsLetters[i];
      s.classList.toggle('cur', i === this.hsPos);
    });
  }

  /** Cyklicznie zmienia literę na bieżącej pozycji (A-Z w kółko). */
  private hsCycle(d: number): void {
    const c = this.hsLetters[this.hsPos].charCodeAt(0);
    this.hsLetters[this.hsPos] = String.fromCharCode(65 + ((c - 65 + d + 26) % 26));
    this.hsRender();
  }

  /** Zatwierdza wpis rekordu i pokazuje ranking. */
  private hsConfirm(): void {
    this.leaderboard.add({ name: this.hsLetters.join(''), score: this.pendingScore, eggs: this.pendingEggs, mode: this.currentMode === 'hard' ? 'H' : 'N' });
    this.renderRank();
    this.show('rank');
  }

  /**
   * Wywoływane przez Game po zakończeniu rundy. Wynik kwalifikujący się
   * do top 5 otwiera ekran wpisu inicjałów, słabszy — zwykły game over.
   */
  handleGameOver(score: number, eggsCollected: number): void {
    if (this.leaderboard.qualifies(score)) {
      this.pendingScore = score;
      this.pendingEggs = eggsCollected;
      this.hsScoreEl.textContent = String(score);
      this.hsLetters[0] = 'A'; this.hsLetters[1] = 'A'; this.hsLetters[2] = 'A';
      this.hsPos = 0;
      this.hsRender();
      this.show('hs');
    } else {
      this.overText.textContent = 'Twój wynik: ' + score + '  ·  Jajka: ' + eggsCollected;
      this.show('over');
    }
  }

  /** Ponowna runda po ekranie game over (ten sam tryb gry). */
  private activateRetry(): void {
    if (this.current !== 'over') return;
    this.show('game');
    this.deps.onStart(this.currentMode);
  }

  /**
   * Nawigacja klawiaturowa — dispatch wejścia per stan maszyny.
   * (↑↓ Enter Esc + WASD jako alternatywa)
   */
  private readonly onKey = (e: KeyboardEvent): void => {
    const k = e.key;
    switch (this.current) {
      case 'splash':
        this.skipSplash();
        break;
      case 'boot':
        this.goTitle(); // skip — zasoby dokończą się w tle
        break;
      case 'title':
        if (k === 'Enter' || k === ' ') this.show('menu');
        break;
      case 'menu':
        if (k === 'ArrowUp' || k === 'w' || k === 'W') {
          this.menuSel = (this.menuSel - 1 + this.menuItems.length) % this.menuItems.length;
          this.menuItems.forEach((li, i) => li.classList.toggle('sel', i === this.menuSel));
          this.audio.playJump();
        } else if (k === 'ArrowDown' || k === 's' || k === 'S') {
          this.menuSel = (this.menuSel + 1) % this.menuItems.length;
          this.menuItems.forEach((li, i) => li.classList.toggle('sel', i === this.menuSel));
          this.audio.playJump();
        } else if (k === 'Enter' || k === ' ') {
          this.activateMenuItem();
        }
        break;
      case 'rank':
        if (k === 'Escape' || k === 'Enter' || k === ' ') this.show('menu');
        break;
      case 'hs':
        if (k === 'ArrowUp' || k === 'w' || k === 'W') this.hsCycle(1);
        else if (k === 'ArrowDown' || k === 's' || k === 'S') this.hsCycle(-1);
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') { this.hsPos = Math.min(2, this.hsPos + 1); this.hsRender(); }
        else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { this.hsPos = Math.max(0, this.hsPos - 1); this.hsRender(); }
        else if (k === 'Enter') this.hsConfirm();
        break;
      case 'over':
        if (k === 'Enter') this.activateRetry();
        else if (k === 'Escape') this.goTitle();
        break;
      default:
        break;
    }
  };
}
