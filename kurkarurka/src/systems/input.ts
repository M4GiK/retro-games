/**
 * Menedżer wejścia — klawiatura (PC) + ekranowy gamepad (mobile).
 *
 * Wzorzec: enkapsulacja źródeł wejścia za jednym API. Reszta gry pyta
 * wyłącznie o getMoveDir() i reaguje na callback onJump — nie wie,
 * czy sterowanie pochodzi z klawiatury czy z dotyku.
 *
 * Pad: ◀ ▶ — ruch (przytrzymaj), ⤒ — skok; multi-touch działa natywnie,
 * bo każdy przycisk to osobny element. Dotknięcie ekranu poza padem = skok.
 */

/** Callbacki zdarzeń wejścia wstrzykiwane z zewnątrz (Dependency Injection). */
export interface InputHandlers {
  onJump: () => void;
  onExtraLife: () => void;
  onPause: () => void;
}

export class InputManager {
  /** Zbiór aktualnie wciśniętych klawiszy (normalizowane do małych liter). */
  private readonly keys = new Set<string>();
  /** Stan przycisków ekranowego pada (skok śledzony dla zmiennej wysokości skoku). */
  private readonly pad = { left: false, right: false, jump: false };
  /** Stuknięcie ekranu = krótki impuls "trzymanego" skoku (~160 ms = średni wyskok). */
  private tapJumpUntil = 0;
  /** Czy już weszliśmy w pełny ekran — po wyjściu usera nie wymuszamy go z powrotem. */
  private fullscreenDone = false;

  /**
   * @param stage   element sceny — na nim łapiemy dotknięcia "poza padem".
   * @param canAct  predykat: czy runda trwa (sterowanie aktywne tylko w grze).
   * @param handlers callbacki zdarzeń (skok).
   */
  constructor(
    private readonly stage: HTMLElement,
    private readonly canAct: () => boolean,
    private readonly handlers: InputHandlers,
  ) {}

  /**
   * Podpina wszystkie źródła wejścia: klawiaturę, detekcję dotyku,
   * przyciski pada i stuknięcia w scenę.
   */
  init(): void {
    this.bindKeyboard();
    this.bindTouchDetection();
    this.bindPad();
    this.bindStageTap();

    // Brak menu kontekstowego / zaznaczania przy dłuższym przytrzymaniu.
    this.stage.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Odczyt kierunku ruchu: -1 lewo / 1 prawo / 0 brak.
   * Przeciwne kierunki wciskane jednocześnie się znoszą.
   */
  getMoveDir(): number {
    const l = this.keys.has('a') || this.keys.has('arrowleft') || this.pad.left;
    const r = this.keys.has('d') || this.keys.has('arrowright') || this.pad.right;
    return (r ? 1 : 0) - (l ? 1 : 0);
  }

  /** Czy klawisz/przycisk skoku jest TRZYMANY — napędza cięcie skoku (fizyka à la Mario). */
  isJumpHeld(): boolean {
    return this.keys.has('w') || this.keys.has('arrowup') || this.keys.has(' ')
      || this.pad.jump || performance.now() < this.tapJumpUntil;
  }

  /** Czyści całe wejście — wywoływać przy starcie/resecie gry. */
  clear(): void {
    this.keys.clear();
    this.pad.left = false;
    this.pad.right = false;
    this.pad.jump = false;
    this.tapJumpUntil = 0;
    document.querySelectorAll('#pad button.is-down').forEach(b => b.classList.remove('is-down'));
  }

  /** Klawiatura: ruch A/D/strzałki, skok W/strzałka w górę/spacja. */
  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'w' || k === 'arrowup' || k === ' ') this.handlers.onJump();
      if (k === 'h') this.handlers.onExtraLife();
      if (k === 'p') this.handlers.onPause();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    // Utrata fokusu okna (alt-tab) — inaczej wciśnięty klawisz "zawiesza" ruch.
    window.addEventListener('blur', () => this.clear());
  }

  /**
   * Wykrywanie urządzeń dotykowych: pokazuj pad na urządzeniach z grubym
   * wskaźnikiem (telefon/tablet) albo od razu po pierwszym dotknięciu ekranu.
   */
  private bindTouchDetection(): void {
    if (window.matchMedia('(pointer: coarse)').matches) {
      document.body.classList.add('touch');
    }
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      document.body.classList.add('touch');
      this.tryFullscreen();
    }, { passive: true });
  }

  /**
   * Pierwszy dotyk = wejście w pełny ekran — na Androidzie chowa to pasek
   * URL i nawigację systemu. iOS nie wspiera Fullscreen API (fullscreenEnabled
   * = false), tam działa wyłącznie „Dodaj do ekranu początkowego" (hint
   * w menu — ui/fullscreen.ts). Gest może odrzucić żądanie — wtedy kolejny
   * dotyk spróbuje ponownie; po sukcesie już nigdy nie wymuszamy.
   */
  private tryFullscreen(): void {
    if (this.fullscreenDone || !document.fullscreenEnabled || document.fullscreenElement) return;
    void document.documentElement.requestFullscreen()
      .then(() => { this.fullscreenDone = true; })
      .catch(() => { /* odrzucone — następny dotyk spróbuje ponownie */ });
  }

  /** Ekranowy gamepad: ◀ ▶ przytrzymywane, ⤒ skok (przytrzymanie = wyższy skok). */
  private bindPad(): void {
    const padLeft = document.getElementById('padLeft');
    const padRight = document.getElementById('padRight');
    const padJump = document.getElementById('padJump');
    if (padLeft) this.bindHold(padLeft, v => { this.pad.left = v; });
    if (padRight) this.bindHold(padRight, v => { this.pad.right = v; });
    if (padJump) this.bindHold(padJump, v => { this.pad.jump = v; }, () => this.handlers.onJump());
  }

  /** Dotknięcie sceny POZA padem = skok (wygodne przy grze jedną ręką). */
  private bindStageTap(): void {
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !this.canAct()) return;
      if ((e.target as HTMLElement).closest('#pad')) return;
      this.tapJumpUntil = performance.now() + 160;
      this.handlers.onJump();
    });
  }

  /**
   * Podpina przycisk "przytrzymaj" — set(true) na wciśnięcie, set(false)
   * na puszczenie/odjęcie palca/anulowanie gestu; opcjonalny onDown.
   */
  private bindHold(btn: HTMLElement, set: (v: boolean) => void, onDown?: () => void): void {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      set(true);
      btn.classList.add('is-down');
      onDown?.();
    };
    const up = () => {
      set(false);
      btn.classList.remove('is-down');
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
  }
}
