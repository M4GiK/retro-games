/**
 * Menu / lobby / ekran końcowy — nakładki DOM nad canvasem (ticket D).
 *
 * Ekrany zdefiniowane w src/index.html: #menu #join #lobby #over.
 * Menu główne to lista z kursorem ▶ jak w kurkarurce — nawigacja
 * ↑↓/←→ + Enter albo dotyk (jedno dotknięcie = wybór + start).
 * Lobby ma wybór broni (primary/secondary) i mapy (host); zmiana broni
 * emituje onLoadout → session.setLoadout → 'loadout' do hosta.
 * Deep-link: ?room=KOD — main.ts odpala join po splashu.
 */

import type { PlayerSlot } from '../core/protocol';
import { LOBBY_WEAPONS, WEAPONS } from '../core/weapons';
import { LEVELS } from '../core/level';
import { uiMove, uiOk } from '../audio/sfx';
import type { WeaponId } from '../core/types';

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

export class Menu {
  /** Aktywny ekran — dispatch klawiatury działa tylko na 'menu'/'join'. */
  private cur: ScreenId = 'none';
  private menuSel = 0;
  private readonly menuItems: HTMLElement[];

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
    ($('#joinCode') as HTMLInputElement).addEventListener('keydown', e => {
      if (e.key === 'Enter') this.submitCode();
    });
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
    const code = ($('#joinCode') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length !== 4) { this.error('join', 'KOD MA 4 ZNAKI'); return; }
    const [w1, w2] = this.loadout();
    this.h.onJoin(code, w1, w2);
  }

  /** Programowe dołączenie (deep-link ?room=KOD). */
  joinCode(code: string): void {
    const [w1, w2] = this.loadout();
    this.h.onJoin(code.toUpperCase(), w1, w2);
  }

  /** Pokaż jeden ekran, resztę schowaj. 'none' = gra (same canvas). */
  show(which: ScreenId): void {
    this.cur = which;
    for (const id of ['menu', 'join', 'lobby', 'over']) {
      $(`#${id}`).hidden = id !== which;
    }
    if (which === 'join') ($('#joinCode') as HTMLInputElement).focus();
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

  /** Klawiatura: na 'menu' kursor + Enter; na 'join' Escape = wstecz. */
  private onKey(e: KeyboardEvent): void {
    if (this.cur === 'join') {
      if (e.key === 'Escape') this.show('menu');
      return;
    }
    if (this.cur !== 'menu') return;
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'ArrowLeft' || k === 'a' || k === 'A') {
      this.menuMove(-1);
    } else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === 'ArrowRight' || k === 'd' || k === 'D') {
      this.menuMove(1);
    } else if (k === 'Enter' || k === ' ') {
      this.activate();
    }
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
  }

  /** Ekran końca rundy. */
  showOver(winnerName: string, players: { name: string; score: number }[]): void {
    this.show('over');
    $('#overTitle').textContent = `${winnerName} WYGRYWA`;
    $('#overScores').innerHTML = players
      .map(p => `<li><span>${esc(p.name)}</span><span>${p.score} PKT</span></li>`)
      .join('');
  }

  error(screen: 'menu' | 'join', msg: string): void {
    $(`#${screen === 'menu' ? 'menuErr' : 'joinErr'}`).textContent = msg;
  }
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
}
