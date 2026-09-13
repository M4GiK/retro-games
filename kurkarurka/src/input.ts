// Wejście: klawiatura (PC) + ekranowy gamepad (mobile).
// Pad: ◀ ▶ — ruch (przytrzymaj), ⤒ — skok; multi-touch działa natywnie,
// bo każdy przycisk to osobny element. Dotknięcie ekranu poza padem = skok.
const keys = new Set<string>();
const pad = { left: false, right: false };

export interface InputHandlers {
  onJump: () => void;
}

// -1 lewo / 1 prawo / 0 brak; przeciwne kierunki się znoszą.
export function getMoveDir(): number {
  const l = keys.has('a') || keys.has('arrowleft') || pad.left;
  const r = keys.has('d') || keys.has('arrowright') || pad.right;
  return (r ? 1 : 0) - (l ? 1 : 0);
}

// Czyści całe wejście — wywoływać przy starcie/resecie gry.
export function clearInput() {
  keys.clear();
  pad.left = false;
  pad.right = false;
  document.querySelectorAll('#pad button.is-down').forEach(b => b.classList.remove('is-down'));
}

function bindHold(btn: HTMLElement, set: (v: boolean) => void) {
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

export function initInput(stage: HTMLElement, canAct: () => boolean, h: InputHandlers) {
  // ---- Klawiatura ----
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (k === 'w' || k === 'arrowup' || k === ' ') h.onJump();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  // Utrata fokusu okna (alt-tab) — inaczej wciśnięty klawisz "zawiesza" ruch.
  window.addEventListener('blur', clearInput);

  // ---- Pad dotykowy ----
  // Pokazuj pad na urządzeniach z grubym wskaźnikiem (telefon/tablet)
  // albo od razu po pierwszym dotknięciu ekranu.
  if (window.matchMedia('(pointer: coarse)').matches) {
    document.body.classList.add('touch');
  }
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') document.body.classList.add('touch');
  }, { passive: true });

  const padLeft = document.getElementById('padLeft');
  const padRight = document.getElementById('padRight');
  const padJump = document.getElementById('padJump');
  if (padLeft) bindHold(padLeft, v => { pad.left = v; });
  if (padRight) bindHold(padRight, v => { pad.right = v; });
  if (padJump) {
    padJump.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      padJump.classList.add('is-down');
      h.onJump();
    });
    const up = () => padJump.classList.remove('is-down');
    padJump.addEventListener('pointerup', up);
    padJump.addEventListener('pointerleave', up);
    padJump.addEventListener('pointercancel', up);
  }

  // Dotknięcie sceny POZA padem = skok (wygodne przy grze jedną ręką).
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !canAct()) return;
    if ((e.target as HTMLElement).closest('#pad')) return;
    h.onJump();
  });

  // Brak menu kontekstowego / zaznaczania przy dłuższym przytrzymaniu.
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
}
