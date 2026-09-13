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
}

export class InputManager {
  /** Zbiór aktualnie wciśniętych klawiszy (normalizowane do małych liter). */
  private readonly keys = new Set<string>();
  /** Stan przycisków kierunkowych ekranowego pada. */
  private readonly pad = { left: false, right: false };

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

  /** Czyści całe wejście — wywoływać przy starcie/resecie gry. */
  clear(): void {
    this.keys.clear();
    this.pad.left = false;
    this.pad.right = false;
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
      if (e.pointerType === 'touch') document.body.classList.add('touch');
    }, { passive: true });
  }

  /** Ekranowy gamepad: ◀ ▶ przytrzymywane, ⤒ odpala skok na wciśnięcie. */
  private bindPad(): void {
    const padLeft = document.getElementById('padLeft');
    const padRight = document.getElementById('padRight');
    const padJump = document.getElementById('padJump');
    if (padLeft) this.bindHold(padLeft, v => { this.pad.left = v; });
    if (padRight) this.bindHold(padRight, v => { this.pad.right = v; });
    if (padJump) {
      padJump.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        padJump.classList.add('is-down');
        this.handlers.onJump();
      });
      const up = () => padJump.classList.remove('is-down');
      padJump.addEventListener('pointerup', up);
      padJump.addEventListener('pointerleave', up);
      padJump.addEventListener('pointercancel', up);
    }
  }

  /** Dotknięcie sceny POZA padem = skok (wygodne przy grze jedną ręką). */
  private bindStageTap(): void {
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !this.canAct()) return;
      if ((e.target as HTMLElement).closest('#pad')) return;
      this.handlers.onJump();
    });
  }

  /**
   * Podpina przycisk "przytrzymaj" — set(true) na wciśnięcie, set(false)
   * na puszczenie/odjęcie palca/anulowanie gestu.
   */
  private bindHold(btn: HTMLElement, set: (v: boolean) => void): void {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      set(true);
      btn.classList.add('is-down');
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
