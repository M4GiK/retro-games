/**
 * Menu / lobby / ekran końcowy — nakładki DOM nad canvasem (ticket D).
 *
 * Ekrany zdefiniowane w src/index.html: #menu #join #lobby #over.
 * Każdy ekran obsługuje wspólną nawigację nav(PadAction) — strzałki
 * z klawiatury i RetroPada wpadają w ten sam lejek:
 *  - menu: ↑↓/←→ kursor po kartach, ok = wybór,
 *  - join: siatka klawiszy ekranowych (8 kolumn jak w CSS .pad) +
 *    rząd przycisków; fizyczne znaki/Backspace działają niezależnie,
 *  - lobby/over: liniowy fokus (selecty + przyciski); ←→ na selekcie
 *    przewija opcje bez otwierania listy, back = wyjście do menu.
 * Dotyk/mysz: dotknięcie elementu przesuwa na niego fokus i klika.
 * Lobby ma wybór broni (primary/secondary) i mapy (host); zmiana broni
 * emituje onLoadout → session.setLoadout → 'loadout' do hosta.
 * Deep-link: ?room=KOD — main.ts odpala join po splashu.
 */

import type { PlayerSlot } from '../core/protocol';
import { LOBBY_WEAPONS, WEAPONS } from '../core/weapons';
import { LEVELS } from '../core/level';
import { ROOM_CODE_CHARS, ROOM_CODE_LEN } from '../core/config';
import { uiMove, uiOk } from '../audio/sfx';
import type { WeaponId } from '../core/types';
import type { PadAction } from './gamepad';

export interface MenuHandlers {
  onCreate(w1: WeaponId, w2: WeaponId): void;
  onJoin(code: string, w1: WeaponId, w2: WeaponId): void;
  onStart(mapIdx: number): void;         // host wcisnął START
  onDemo(): void;
  onLeave(): void;                       // wyjście z lobby/końca do menu
  onAgain(mapIdx: number): void;         // host: rewanż
  onLoadout(w1: WeaponId, w2: WeaponId): void; // zmiana broni w lobby
}

const $ = (s: string) => document.querySelector(s) as HTMLElement;

type ScreenId = 'menu' | 'join' | 'lobby' | 'over' | 'none';

/** Klawisz → akcja nawigacji (wspólna dla klawiatury i RetroPada). */
const KEY_ACTION: Record<string, PadAction> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  Enter: 'ok', ' ': 'ok',
  Escape: 'back',
};

export class Menu {
  /** Aktywny ekran — dispatch nawigacji działa poza grą ('none'). */
  private cur: ScreenId = 'none';
  private menuSel = 0;
  private readonly menuItems: HTMLElement[];
  /** Kod wpisywany na ekranie DOŁĄCZ (klawiatura ekranowa + fizyczna). */
  private code = '';
  private readonly slotEls: HTMLElement[] = [];
  /** Klawisze ekranowe DOŁĄCZ — kolejność = ROOM_CODE_CHARS. */
  private readonly keyEls: HTMLElement[] = [];
  /** Przyciski DOŁĄCZ: WSTECZ / SKASUJ / DOŁĄCZ. */
  private readonly joinBtns: HTMLElement[] = [];
  /** Fokus na 'join': siatka klawiszy albo rząd przycisków. */
  private joinZone: 'grid' | 'btns' = 'grid';
  private keyIdx = 0;
  private btnIdx = 0;
  /** Liniowy fokus dla lobby/over — elementy ustawiane per ekran. */
  private navEls: HTMLElement[] = [];
  private navIdx = 0;

  constructor(private readonly h: MenuHandlers) {
    this.fillWeapons();
    this.fillMaps();
    this.menuItems = Array.from(document.querySelectorAll<HTMLElement>('#menuList li'));
    // Dotyk/mysz: jedno dotknięcie pozycji = wybór + aktywacja.
    this.menuItems.forEach((li, i) => {
      li.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.menuSel = i;
        this.renderSel();
        this.activate();
      });
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    $('#btnGo').addEventListener('click', () => this.submitCode());
    $('#btnBack1').addEventListener('click', () => this.show('menu'));
    $('#btnBack2').addEventListener('click', () => { h.onLeave(); this.show('menu'); });
    $('#btnBack3').addEventListener('click', () => { h.onLeave(); this.show('menu'); });
    $('#btnStart').addEventListener('click', () => h.onStart(this.mapIdx()));
    $('#btnAgain').addEventListener('click', () => h.onAgain(this.mapIdx()));
    $('#btnDel').addEventListener('click', () => this.keyDel());
    // Klawiatura ekranowa: klawisze z alfabetu kodów + sloty kodu.
    const pad = $('#pad');
    for (const ch of ROOM_CODE_CHARS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key';
      b.textContent = ch;
      const i = this.keyEls.length;
      this.keyEls.push(b);
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.joinZone = 'grid';
        this.keyIdx = i;
        this.renderFocus();
        this.keyChar(ch);
      });
      pad.appendChild(b);
    }
    this.joinBtns.push($('#btnBack1'), $('#btnDel'), $('#btnGo'));
    this.joinBtns.forEach((b, i) =>
      b.addEventListener('pointerdown', () => {
        this.joinZone = 'btns';
        this.btnIdx = i;
        this.renderFocus();
      }));
    const slots = $('#joinSlots');
    for (let i = 0; i < ROOM_CODE_LEN; i++) {
      const s = document.createElement('span');
      slots.appendChild(s);
      this.slotEls.push(s);
    }
    // Dotyk elementu nawigacji (select/przycisk) = fokus na nim.
    for (const id of ['selW1', 'selW2', 'selMap', 'btnStart', 'btnBack2', 'btnAgain', 'btnBack3']) {
      const el = $(`#${id}`);
      el.addEventListener('pointerdown', () => {
        const i = this.navEls.indexOf(el);
        if (i >= 0) { this.navIdx = i; this.renderFocus(); }
      });
    }
    for (const id of ['selW1', 'selW2']) {
      $(`#${id}`).addEventListener('change', () => {
        const [w1, w2] = this.loadout();
        h.onLoadout(w1, w2);
      });
    }
  }

  /** Wybrane bronie z selectów (w1, w2). */
  loadout(): [WeaponId, WeaponId] {
    return [
      ($('#selW1') as HTMLSelectElement).value as WeaponId,
      ($('#selW2') as HTMLSelectElement).value as WeaponId,
    ];
  }

  /** Wybrana mapa (tylko host widzi select; gość dostaje idx w 'start'). */
  mapIdx(): number {
    return Math.max(0, Math.min(LEVELS.length - 1, +($('#selMap') as HTMLSelectElement).value || 0));
  }

  private fillWeapons(): void {
    const opts = LOBBY_WEAPONS
      .map(w => `<option value="${w}">${WEAPONS[w].name}</option>`).join('');
    for (const id of ['selW1', 'selW2']) {
      const sel = $(`#${id}`) as HTMLSelectElement;
      sel.innerHTML = opts;
    }
    ($('#selW1') as HTMLSelectElement).value = 'minigun';
    ($('#selW2') as HTMLSelectElement).value = 'rocket';
  }

  private fillMaps(): void {
    ($('#selMap') as HTMLSelectElement).innerHTML = LEVELS
      .map((l, i) => `<option value="${i}">${l.name.toUpperCase()}</option>`).join('');
  }

  private submitCode(): void {
    if (this.code.length !== ROOM_CODE_LEN) { this.error('join', 'KOD MA 4 ZNAKI'); return; }
    // Łączenie przez nostr+TURN trwa kilkanaście sekund — pokaż status.
    this.error('join', 'ŁĄCZENIE…');
    const [w1, w2] = this.loadout();
    this.h.onJoin(this.code, w1, w2);
  }

  /** Klawisz ekranowy: dopisuje znak do kodu (max ROOM_CODE_LEN). */
  private keyChar(ch: string): void {
    if (this.code.length >= ROOM_CODE_LEN) return;
    this.code += ch;
    this.renderCode();
    uiMove();
  }

  /** SKASUJ / Backspace — zdejmuje ostatni znak kodu. */
  private keyDel(): void {
    if (!this.code) return;
    this.code = this.code.slice(0, -1);
    this.renderCode();
    uiMove();
  }

  /** Sloty kodu + odblokowanie DOŁĄCZ, gdy kod kompletny. */
  private renderCode(): void {
    this.slotEls.forEach((s, i) => {
      s.textContent = this.code[i] ?? '';
      s.classList.toggle('on', i < this.code.length);
      s.classList.toggle('next', i === this.code.length);
    });
    ($('#btnGo') as HTMLButtonElement).disabled = this.code.length !== ROOM_CODE_LEN;
  }

  /** Programowe dołączenie (deep-link ?room=KOD). */
  joinCode(code: string): void {
    this.error('join', 'ŁĄCZENIE…');
    const [w1, w2] = this.loadout();
    this.h.onJoin(code.toUpperCase(), w1, w2);
  }

  /** Pokaż jeden ekran, resztę schowaj. 'none' = gra (same canvas). */
  show(which: ScreenId): void {
    const changed = this.cur !== which;
    this.cur = which;
    for (const id of ['menu', 'join', 'lobby', 'over']) {
      $(`#${id}`).hidden = id !== which;
    }
    if (which === 'join' && changed) {
      this.code = ''; this.renderCode(); this.error('join', '');
    }
    // Fokus resetowany tylko przy realnej zmianie ekranu — odświeżenia
    // (np. dołączenie gracza w lobby) nie zabierają kursora.
    if (changed) {
      this.navIdx = 0;
      this.keyIdx = 0;
      this.joinZone = 'grid';
      this.renderFocus();
    }
  }

  /**
   * Wspólna nawigacja UI — strzałki z klawiatury (onKey) i RetroPada
   * (pad.onAction) wpadają tu jako te same akcje.
   */
  nav(a: PadAction): void {
    if (this.cur === 'menu') {
      if (a === 'up' || a === 'left') this.menuMove(-1);
      else if (a === 'down' || a === 'right') this.menuMove(1);
      else if (a === 'ok') this.activate();
      return;
    }
    if (this.cur === 'join') { this.joinNav(a); return; }
    if (this.cur === 'lobby' || this.cur === 'over') this.linearNav(a);
  }

  /**
   * DOŁĄCZ: siatka klawiszy (8 kolumn jak w CSS .pad) + rząd przycisków.
   * ok na siatce = wpisz znak, a przy pełnym kodzie = DOŁĄCZ (Enter
   * po wpisaniu 4 znaków od razu wysyła — bez skakania po przyciskach).
   */
  private joinNav(a: PadAction): void {
    const COLS = 8; // szerokość siatki .pad w index.html
    const len = this.keyEls.length;
    const rows = Math.ceil(len / COLS);
    if (a === 'back') { this.show('menu'); return; }
    if (a === 'ok') {
      if (this.joinZone === 'btns') {
        uiOk();
        this.joinBtns[this.btnIdx]?.click();
      } else if (this.code.length >= ROOM_CODE_LEN) {
        this.submitCode();
      } else {
        const ch = ROOM_CODE_CHARS[this.keyIdx];
        if (ch) this.keyChar(ch);
      }
      return;
    }
    if (this.joinZone === 'grid') {
      const row = Math.floor(this.keyIdx / COLS);
      const col = this.keyIdx % COLS;
      if (a === 'left') this.keyIdx = row * COLS + (col + COLS - 1) % COLS;
      else if (a === 'right') this.keyIdx = row * COLS + (col + 1) % COLS;
      else if (a === 'up') {
        this.keyIdx = Math.min(len - 1, ((row + rows - 1) % rows) * COLS + col);
      } else if (a === 'down') {
        if (row < rows - 1) this.keyIdx = Math.min(len - 1, (row + 1) * COLS + col);
        else {
          this.joinZone = 'btns';
          this.btnIdx = Math.round(col * (this.joinBtns.length - 1) / (COLS - 1));
        }
      }
    } else {
      if (a === 'left' || a === 'right') {
        const d = a === 'left' ? -1 : 1;
        this.btnIdx = (this.btnIdx + d + this.joinBtns.length) % this.joinBtns.length;
      } else if (a === 'up') {
        this.joinZone = 'grid';
        const col = Math.round(this.btnIdx * (COLS - 1) / (this.joinBtns.length - 1));
        this.keyIdx = Math.min(len - 1, (rows - 1) * COLS + col);
      }
    }
    this.renderFocus();
    uiMove();
  }

  /** Lobby / koniec rundy: ↑↓/←→ ruch fokusu; ←→ na selekcie zmienia opcję. */
  private linearNav(a: PadAction): void {
    const el = this.navEls[this.navIdx];
    if (!el) return;
    if (a === 'ok') {
      if (el instanceof HTMLSelectElement) this.cycleSel(el, 1);
      else { uiOk(); el.click(); }
      return;
    }
    if (a === 'back') { this.h.onLeave(); this.show('menu'); return; }
    if (el instanceof HTMLSelectElement && (a === 'left' || a === 'right')) {
      this.cycleSel(el, a === 'left' ? -1 : 1);
      return;
    }
    const d = (a === 'up' || a === 'left') ? -1 : 1;
    this.navIdx = (this.navIdx + d + this.navEls.length) % this.navEls.length;
    this.renderFocus();
    uiMove();
  }

  /** Ustawia liniowo fokusowalne elementy bieżącego ekranu. */
  private setNav(els: HTMLElement[]): void {
    this.navEls = els;
    if (this.navIdx >= els.length) this.navIdx = 0;
    this.renderFocus();
  }

  /** Select bez otwierania listy — ←→ przewija opcje z zapętleniem. */
  private cycleSel(sel: HTMLSelectElement, d: number): void {
    const n = sel.options.length;
    if (n === 0) return;
    sel.selectedIndex = (((sel.selectedIndex + d) % n) + n) % n;
    sel.dispatchEvent(new Event('change'));
    uiMove();
  }

  /** Podświetla aktualny fokus (.foc) — join ma własny układ (grid+btns). */
  private renderFocus(): void {
    document.querySelectorAll('.foc').forEach(e => e.classList.remove('foc'));
    let el: HTMLElement | undefined;
    if (this.cur === 'join') {
      el = this.joinZone === 'grid'
        ? this.keyEls[this.keyIdx]
        : this.joinBtns[this.btnIdx];
    } else if (this.cur === 'lobby' || this.cur === 'over') {
      el = this.navEls[this.navIdx];
    }
    el?.classList.add('foc');
    el?.scrollIntoView({ block: 'nearest' });
  }

  /** Podświetla wybraną pozycję listy menu. */
  private renderSel(): void {
    this.menuItems.forEach((li, i) => li.classList.toggle('sel', i === this.menuSel));
  }

  /** Przesuwa kursor menu o d (z zapętleniem) + blip. */
  private menuMove(d: number): void {
    this.menuSel = (this.menuSel + d + this.menuItems.length) % this.menuItems.length;
    this.renderSel();
    uiMove();
  }

  /** Aktywuje zaznaczoną pozycję: stwórz pokój / dołącz / demo. */
  private activate(): void {
    if (this.cur !== 'menu') return;
    uiOk();
    if (this.menuSel === 0) {
      const [w1, w2] = this.loadout();
      this.h.onCreate(w1, w2);
    } else if (this.menuSel === 1) {
      this.show('join');
    } else {
      this.h.onDemo();
    }
  }

  /** Klawiatura: na 'join' znaki/Backspace lecą do kodu, reszta → nav(). */
  private onKey(e: KeyboardEvent): void {
    if (this.cur === 'join') {
      if (e.key === 'Backspace') { this.keyDel(); return; }
      const ch = e.key.toUpperCase();
      if (ch.length === 1 && ROOM_CODE_CHARS.includes(ch)) { this.keyChar(ch); return; }
    }
    const a = KEY_ACTION[e.key];
    if (a) { e.preventDefault(); this.nav(a); }
  }

  /** Lobby: kod + gracze z loadoutem + bronie + mapa (host) + START. */
  showLobby(code: string, players: PlayerSlot[], mySlot: number, isHost: boolean): void {
    this.show('lobby');
    $('#roomCode').textContent = code;
    $('#mapRow').hidden = !isHost;
    const canStart = isHost && players.length >= 2;
    $('#btnStart').hidden = !isHost;
    ($('#btnStart') as HTMLButtonElement).disabled = !canStart;
    $('#lobbyWait').textContent = isHost
      ? (canStart ? '' : 'CZEKAJ NA GRACZA…')
      : 'CZEKAM NA START HOSTA…';
    $('#plist').innerHTML = players.map(p =>
      `<li class="${p.slot === mySlot ? 'me' : ''}">` +
      `<span><span class="dot">●</span> ${esc(p.name)}<br>` +
      `<span class="wpn">${WEAPONS[p.w1]?.name ?? '?'} + ${WEAPONS[p.w2]?.name ?? '?'}</span></span>` +
      `<span>${p.slot === 0 ? 'HOST' : 'P' + (p.slot + 1)}</span></li>`,
    ).join('');
    // Zsynchronizuj selecty z własnym loadoutem z lobby (np. po join).
    const me = players.find(p => p.slot === mySlot);
    if (me) {
      ($('#selW1') as HTMLSelectElement).value = me.w1;
      ($('#selW2') as HTMLSelectElement).value = me.w2;
    }
    // Fokusowalne elementy w kolejności ekranowej (host ma mapę+START).
    const nav: HTMLElement[] = [$('#selW1'), $('#selW2')];
    if (isHost) nav.push($('#selMap'), $('#btnStart'));
    nav.push($('#btnBack2'));
    this.setNav(nav);
  }

  /** Ekran końca rundy. */
  showOver(winnerName: string, players: { name: string; score: number }[]): void {
    this.show('over');
    $('#overTitle').textContent = `${winnerName} WYGRYWA`;
    $('#overScores').innerHTML = players
      .map(p => `<li><span>${esc(p.name)}</span><span>${p.score} PKT</span></li>`)
      .join('');
    this.setNav([$('#btnAgain'), $('#btnBack3')]);
  }

  error(screen: 'menu' | 'join', msg: string): void {
    $(`#${screen === 'menu' ? 'menuErr' : 'joinErr'}`).textContent = msg;
  }
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
}
