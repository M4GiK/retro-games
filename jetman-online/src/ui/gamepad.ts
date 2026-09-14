/**
 * RetroPad — ekranowy gamepad w stylu lat 90. (NES): krzyżak kierunkowy,
 * okrągłe przyciski A/B i paski SELECT/START. Samodzielny komponent:
 * własny DOM + wstrzykiwany CSS, zero zależności od gry — mapę bitów
 * dostaje w konstruktorze, więc da się go przenieść 1:1 do innych gier.
 *
 * Dwa kanały wyjścia:
 *  - `bits`     — OR bitów aktualnie wciśniętych przycisków; gra czyta
 *                 go co tick/klatkę jak stan klawiatury,
 *  - `onAction` — zbocza do nawigacji menu: kierunki z krzyżaka
 *                 ('up'/'down'/'left'/'right'), A/START = 'ok',
 *                 B/SELECT = 'back'. Zbocze leci raz na zmianę dominującego
 *                 kierunku — bujanie palcem po krzyżaku nie spamuje.
 *
 * Multi-touch: każdy pointerId śledzony osobno (ciąg + ogień naraz),
 * pointer capture utrzymuje zdarzenia po zjechaniu palcem z przycisku.
 */

export interface PadBitMap {
  left: number;
  right: number;
  up: number;
  down: number;
  a: number;
  b: number;
}

export type PadAction = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back';

/** Strefa martwa środka krzyżaka — ułamek połowy jego szerokości. */
const DEAD = 0.3;

export class RetroPad {
  /** Stan wciśniętych przycisków — OR bitów z mapy. */
  bits = 0;
  /** Zbocza dla menu; null = menu nie słucha. */
  onAction: ((a: PadAction) => void) | null = null;

  private readonly root: HTMLElement;
  private readonly dpad: HTMLElement;
  /** pointerId → bity kierunków z krzyżaka (mogą być ukośne). */
  private readonly dirs = new Map<number, number>();
  /** pointerId → ostatni dominujący kierunek (zbocza akcji). */
  private readonly prim = new Map<number, PadAction>();
  /** pointerId → wciśnięty przycisk (bit + element) — A/B/SELECT/START. */
  private readonly held = new Map<number, { el: HTMLElement; bit: number }>();

  /**
   * @param mount element, do którego doklejany jest pad (np. document.body)
   * @param map   wartości bitów pod przyciski — zależne od gry
   */
  constructor(mount: HTMLElement, private readonly map: PadBitMap) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.className = 'rpad';
    this.root.hidden = true;
    this.root.innerHTML =
      '<div class="rp-dpad">' +
      '<i class="u">▲</i><i class="l">◀</i><i class="r">▶</i><i class="d">▼</i><b></b></div>' +
      '<div class="rp-mid">' +
      '<button type="button" class="rp-pill" data-act="back">SELECT</button>' +
      '<button type="button" class="rp-pill" data-act="ok">START</button></div>' +
      '<div class="rp-btns">' +
      '<button type="button" class="rp-btn" data-btn="b">B</button>' +
      '<button type="button" class="rp-btn a" data-btn="a">A</button></div>';
    mount.appendChild(this.root);
    this.dpad = this.root.querySelector('.rp-dpad') as HTMLElement;

    this.dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.dpad.setPointerCapture(e.pointerId);
      this.dirEval(e);
    });
    this.dpad.addEventListener('pointermove', (e) => {
      if (this.dirs.has(e.pointerId)) this.dirEval(e);
    });
    const dirEnd = (e: PointerEvent) => {
      this.dirs.delete(e.pointerId);
      this.prim.delete(e.pointerId);
      this.sync();
    };
    this.dpad.addEventListener('pointerup', dirEnd);
    this.dpad.addEventListener('pointercancel', dirEnd);

    for (const el of this.root.querySelectorAll<HTMLElement>('[data-btn],[data-act]')) {
      const bit = el.dataset.btn ? this.map[el.dataset.btn as 'a' | 'b'] : 0;
      const act = (el.dataset.act ??
        (el.dataset.btn === 'a' ? 'ok' : 'back')) as PadAction;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        // Zbocze tylko przy pierwszym palcu na przycisku.
        if (![...this.held.values()].some(h => h.el === el)) this.fire(act);
        this.held.set(e.pointerId, { el, bit });
        el.classList.add('on');
        this.sync();
      });
      const up = (e: PointerEvent) => {
        if (!this.held.delete(e.pointerId)) return;
        if (![...this.held.values()].some(h => h.el === el)) el.classList.remove('on');
        this.sync();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
    // Długi przytrzymanie palca nie wolno zamieniać w menu kontekstowe.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.clear());
  }

  /** Pokaż/ukryj pad; przy chowaniu puszcza wszystkie przyciski. */
  show(v: boolean): void {
    this.root.hidden = !v;
    if (!v) this.clear();
  }

  /** Puszcza wszystko — przy blurze okna, chowaniu i starcie rundy. */
  clear(): void {
    this.dirs.clear();
    this.prim.clear();
    this.held.clear();
    for (const el of this.root.querySelectorAll('.on')) el.classList.remove('on');
    this.sync();
  }

  /** Odpina pad z DOM-u. */
  destroy(): void {
    this.root.remove();
  }

  /** Pozycja dotknięcia na krzyżaku → bity kierunków + zbocze akcji. */
  private dirEval(e: PointerEvent): void {
    const r = this.dpad.getBoundingClientRect();
    const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    let b = 0;
    let p: PadAction | null = null;
    if (Math.max(Math.abs(nx), Math.abs(ny)) >= DEAD) {
      const m = this.map;
      if (nx <= -DEAD) b |= m.left;
      if (nx >= DEAD) b |= m.right;
      if (ny <= -DEAD) b |= m.up;
      if (ny >= DEAD) b |= m.down;
      p = Math.abs(nx) > Math.abs(ny)
        ? (nx < 0 ? 'left' : 'right')
        : (ny < 0 ? 'up' : 'down');
    }
    this.dirs.set(e.pointerId, b);
    if (p && this.prim.get(e.pointerId) !== p) {
      this.prim.set(e.pointerId, p);
      this.fire(p);
    }
    this.sync();
  }

  /** Przelicza bits z map dotknięć + podświetla ramiona krzyżaka. */
  private sync(): void {
    let b = 0;
    for (const v of this.dirs.values()) b |= v;
    for (const h of this.held.values()) b |= h.bit;
    this.bits = b;
    const m = this.map;
    this.dpad.classList.toggle('u', !!(b & m.up));
    this.dpad.classList.toggle('d', !!(b & m.down));
    this.dpad.classList.toggle('l', !!(b & m.left));
    this.dpad.classList.toggle('r', !!(b & m.right));
  }

  /** Zbocze akcji + krótka wibracja — dotykowy "klik" jak plastik pada. */
  private fire(a: PadAction): void {
    this.onAction?.(a);
    try { navigator.vibrate?.(10); } catch { /* brak wsparcia */ }
  }
}

let cssDone = false;
/** CSS pada wstrzykiwany raz — komponent samowystarczalny między grami. */
function ensureStyle(): void {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
/* RetroPad — ekranowy pad NES: krzyżak + A/B + SELECT/START (ui/gamepad.ts) */
.rpad{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;
  align-items:flex-end;justify-content:space-between;gap:10px;
  padding:0 14px calc(12px + env(safe-area-inset-bottom,0px));
  pointer-events:none;opacity:.94;touch-action:none;
  -webkit-user-select:none;user-select:none}
.rpad[hidden]{display:none}
.rp-dpad{position:relative;width:116px;height:116px;flex:none;
  pointer-events:auto;touch-action:none;
  filter:drop-shadow(0 4px 0 rgba(0,0,0,.5))}
.rp-dpad::before,.rp-dpad::after{content:'';position:absolute;
  background:linear-gradient(180deg,#3a3a44,#17171f);border:2px solid #06060b}
.rp-dpad::before{left:33.5%;top:3%;width:33%;height:94%}
.rp-dpad::after{left:3%;top:33.5%;width:94%;height:33%}
.rp-dpad b{position:absolute;left:37%;top:37%;width:26%;height:26%;
  background:radial-gradient(circle at 40% 35%,#33333e,#15151c 70%);
  border-radius:50%;pointer-events:none}
.rp-dpad i{position:absolute;display:flex;align-items:center;
  justify-content:center;font-style:normal;font-size:10px;color:#7f7f92;
  text-shadow:0 -1px 0 #000;pointer-events:none;border-radius:3px}
.rp-dpad i.u{left:33.5%;top:4%;width:33%;height:28%}
.rp-dpad i.d{left:33.5%;bottom:4%;width:33%;height:28%}
.rp-dpad i.l{left:4%;top:33.5%;width:28%;height:33%}
.rp-dpad i.r{right:4%;top:33.5%;width:28%;height:33%}
.rp-dpad.u i.u,.rp-dpad.d i.d,.rp-dpad.l i.l,.rp-dpad.r i.r{
  color:#ffe6b0;background:rgba(255,190,74,.16)}
.rp-mid{display:flex;gap:8px;padding-bottom:8px;pointer-events:auto}
.rp-pill{font-family:inherit;font-size:7px;letter-spacing:1px;
  color:#dadae4;background:linear-gradient(180deg,#4c4c58,#22222b);
  border:2px solid #08080d;border-radius:9px;padding:8px 13px;
  box-shadow:0 3px 0 #08080d,inset 0 1px 0 #6a6a7a;text-shadow:0 -1px 0 #000;
  cursor:pointer;touch-action:none}
.rp-pill.on{transform:translateY(2px);
  box-shadow:0 1px 0 #08080d,inset 0 1px 0 #6a6a7a}
.rp-btns{display:flex;gap:13px;align-items:flex-end;pointer-events:auto}
.rp-btn{width:56px;height:56px;border-radius:50%;cursor:pointer;
  border:2px solid #2c0606;font-family:inherit;font-size:12px;
  letter-spacing:1px;color:#ffd9c8;text-shadow:0 -1px 0 #500;
  background:radial-gradient(circle at 35% 30%,#ff7a62,#c81e14 62%,#7a0d08);
  box-shadow:0 4px 0 #2c0606,inset 0 2px 2px rgba(255,255,255,.35);
  touch-action:none}
.rp-btn.a{transform:translateY(-13px)}
.rp-btn.on{transform:translateY(3px);
  background:radial-gradient(circle at 35% 30%,#e0503f,#a01510 62%,#5e0a06);
  box-shadow:0 1px 0 #2c0606,inset 0 2px 4px rgba(0,0,0,.45)}
.rp-btn.a.on{transform:translateY(-10px)}
@media (max-height:460px){
  .rp-dpad{width:92px;height:92px}
  .rp-btn{width:46px;height:46px;font-size:10px}
  .rp-btn.a{transform:translateY(-10px)}
  .rp-btn.a.on{transform:translateY(-7px)}
  .rp-mid{padding-bottom:5px}
  .rp-pill{font-size:6px;padding:6px 10px}
}
`;
  document.head.appendChild(s);
}
