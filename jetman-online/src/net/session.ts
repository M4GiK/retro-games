/**
 * Sesja pokoju — lobby, sloty graczy, role host/gość (ticket B).
 *
 * Host = twórca pokoju: nadaje sloty, rozsyła stan lobby, startuje rundę.
 * Gość = dołącza kodem, wysyła 'hi' aż dostanie 'lobby' ze swoim slotem.
 * Migracja hosta NIE istnieje (v1): odejście hosta = onHostGone → menu.
 * Wybór broni: 'hi' i 'loadout' niosą w1/w2 gracza; createSim bierze
 * loadout z players[].
 */

import {
  JOIN_TIMEOUT_MS, MAX_PLAYERS, ROOM_CODE_CHARS, ROOM_CODE_LEN,
} from '../core/config';
import type { NetMsg, PlayerSlot } from '../core/protocol';
import type { WeaponId } from '../core/types';
import type { Transport } from './transport';

export type Role = 'host' | 'guest';

export interface SessionEvents {
  /** Aktualny stan lobby (po każdej zmianie składu/loadoutu). */
  onLobby(players: PlayerSlot[], mySlot: number): void;
  /** Host wystartował rundę — przełącz na pętlę gry. */
  onStart(seed: number, level: number): void;
  /** Wiadomości rozgrywki (input/snap/over) — do host/guest loop. */
  onMsg(msg: NetMsg, from: string): void;
  /** Host odszedł → koniec pokoju, powrót do menu. */
  onHostGone(): void;
  /** Gracz odszedł (peerId + zwolniony slot). */
  onPeerGone(peerId: string, slot: number): void;
}

export class Session {
  readonly role: Role;
  readonly code: string;
  readonly transport: Transport;
  /** Mój slot (0 dla hosta; gość: po pierwszym 'lobby'). */
  slot = -1;
  players: PlayerSlot[] = [];
  /** Host: mapowanie slot → peerId (slot 0 = selfId). */
  private peersBySlot = new Map<number, string>();
  private hostPeerId = '';
  private ev: SessionEvents;

  private constructor(role: Role, code: string, transport: Transport, ev: SessionEvents) {
    this.role = role;
    this.code = code;
    this.transport = transport;
    this.ev = ev;
  }

  /** Stwórz pokój — losowy kod, jesteś hostem na slocie 0. */
  static create(transport: Transport, name: string, w1: WeaponId, w2: WeaponId, ev: SessionEvents): Session {
    const code = genCode();
    const s = new Session('host', code, transport, ev);
    s.slot = 0;
    s.players = [{ slot: 0, peerId: transport.selfId, name, w1, w2 }];
    s.peersBySlot.set(0, transport.selfId);
    transport.join(code, {
      onPeerJoin: () => {},
      onPeerLeave: id => s.hostPeerLeft(id),
      onMessage: (msg, from) => s.hostOnMsg(msg, from),
    });
    queueMicrotask(() => ev.onLobby(s.players, 0));
    return s;
  }

  /** Dołącz do pokoju kodem — rozwiązuje się po pierwszym 'lobby'. */
  static join(transport: Transport, name: string, code: string, w1: WeaponId, w2: WeaponId, ev: SessionEvents): Promise<Session> {
    return new Promise((resolve, reject) => {
      const s = new Session('guest', code.toUpperCase(), transport, ev);
      let settled = false;
      const sayHi = () => transport.send({ t: 'hi', name, w1, w2 });
      const hiTimer = setInterval(sayHi, 800);
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearInterval(hiTimer);
        transport.leave();
        reject(new Error('Pokój nie odpowiada — zły kod albo host niedostępny'));
      }, JOIN_TIMEOUT_MS);

      transport.join(s.code, {
        onPeerJoin: () => sayHi(),
        onPeerLeave: id => {
          if (id === s.hostPeerId) ev.onHostGone();
          const p = s.players.find(pl => pl.peerId === id);
          if (p) ev.onPeerGone(id, p.slot);
        },
        onMessage: (msg, from) => {
          if (msg.t === 'lobby') {
            s.hostPeerId = from;
            s.players = msg.players;
            s.slot = msg.you;
            ev.onLobby(msg.players, msg.you);
            if (!settled) {
              settled = true;
              clearInterval(hiTimer);
              clearTimeout(timeout);
              resolve(s);
            }
          } else if (msg.t === 'full') {
            if (!settled) {
              settled = true;
              clearInterval(hiTimer);
              clearTimeout(timeout);
              transport.leave();
              reject(new Error('Pokój pełny (max 4 graczy)'));
            }
          } else if (msg.t === 'start') {
            ev.onStart(msg.seed, msg.level);
          } else {
            ev.onMsg(msg, from);
          }
        },
      });
      sayHi();
    });
  }

  /** Host: wystartuj rundę (broadcast start + lokalny onStart). */
  startRound(seed: number, level: number): void {
    if (this.role !== 'host') return;
    this.transport.send({ t: 'start', seed, level, atTick: 0 });
    this.ev.onStart(seed, level);
  }

  /** Zmień swój loadout w lobby (w1/w2) — guest powiadamia hosta. */
  setLoadout(w1: WeaponId, w2: WeaponId): void {
    const me = this.players.find(p => p.slot === this.slot);
    if (me) { me.w1 = w1; me.w2 = w2; }
    if (this.role === 'host') this.broadcastLobby();
    else this.transport.send({ t: 'loadout', w1, w2 }, this.hostPeerId || undefined);
  }

  /** Wyślij wiadomość gry (broadcast bez `to`). */
  send(msg: NetMsg, to?: string): void {
    this.transport.send(msg, to);
  }

  /** PeerId gracza na slocie (host: do targetowanych wiadomości). */
  peerOf(slot: number): string | undefined {
    return this.peersBySlot.get(slot);
  }

  leave(): void {
    this.transport.send({ t: 'bye' });
    this.transport.leave();
  }

  // ---- Wnętrze hosta ----

  private hostOnMsg(msg: NetMsg, from: string): void {
    if (msg.t === 'hi') {
      // Gość wysyła 'hi' wielokrotnie (od razu + onPeerJoin + co 800 ms)
      // aż dostanie 'lobby' — deduplikuj po peerId, nie dodawaj duplikatów.
      const existing = this.players.find(pl => pl.peerId === from);
      if (existing) { this.broadcastLobby(); return; }
      const free = this.freeSlot();
      if (free < 0) { this.transport.send({ t: 'full' }, from); return; }
      this.players.push({ slot: free, peerId: from, name: msg.name, w1: msg.w1, w2: msg.w2 });
      this.peersBySlot.set(free, from);
      this.broadcastLobby();
      return;
    }
    if (msg.t === 'loadout') {
      const p = this.players.find(pl => pl.peerId === from);
      if (p) { p.w1 = msg.w1; p.w2 = msg.w2; this.broadcastLobby(); }
      return;
    }
    if (msg.t === 'bye') { this.hostPeerLeft(from); return; }
    this.ev.onMsg(msg, from);
  }

  private hostPeerLeft(peerId: string): void {
    const p = this.players.find(pl => pl.peerId === peerId);
    if (!p) return;
    this.players = this.players.filter(pl => pl.peerId !== peerId);
    this.peersBySlot.delete(p.slot);
    this.ev.onPeerGone(peerId, p.slot);
    this.broadcastLobby();
  }

  private freeSlot(): number {
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!this.players.some(p => p.slot === i)) return i;
    }
    return -1;
  }

  private broadcastLobby(): void {
    for (const p of this.players) {
      if (p.peerId === this.transport.selfId) continue;
      this.transport.send({ t: 'lobby', players: this.players, you: p.slot }, p.peerId);
    }
    this.ev.onLobby(this.players, 0);
  }
}

function genCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LEN; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}
