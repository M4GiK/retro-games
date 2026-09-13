/**
 * Protokół sieciowy — KONTRAKT między netcode (ticket B) a resztą.
 *
 * Model: host-authoritative. Twórca pokoju jest autorytetem — symuluje
 * świat (core/sim.ts) i rozsyła Snap co SNAPSHOT_EVERY ticków.
 * Goście wysyłają wyłącznie inputy; serwera nie ma (trystero = WebRTC
 * mesh + publiczny signaling), albo transport lokalny (BroadcastChannel).
 *
 * Wszystkie wiadomości lecą jednym "kanałem" transportu jako JSON.
 * Pola skrócone do 1-2 liter — snapshot leci 20×/s, oszczędzamy bajty.
 */

import type { JetMode, Phase, SimEvent, WeaponId } from './types';

/** Slot gracza w lobby — nadawany przez hosta. */
export interface PlayerSlot {
  slot: number;    // 0..MAX_PLAYERS-1
  peerId: string;  // id peera z transportu
  name: string;
  w1: WeaponId;    // wybrane bronie (primary + secondary)
  w2: WeaponId;
}

/** Minimalna, renderowalna postać jeta w snapshocie. */
export interface JetSnap {
  s: number;       // slot — tablica snap.jets jest rzadka względem slotów!
  m: JetMode;      // 'ship' | 'pilot'
  x: number;
  y: number;
  a: number;       // angle
  vx: number;
  vy: number;
  al: boolean;     // alive
  th: boolean;     // ciąg włączony — płomień/exhaust w renderze
  inv: number;     // ticki nietykalności jeszcze
  carry: number;   // niesiona flaga (-1 brak)
  f: number;       // fuel 0..100
  e: number;       // energy 0..100
  score: number;
  lives: number;
}

/** Snapshot świata rozsyłany przez hosta (~20 Hz). */
export interface Snap {
  tick: number;
  phase: Phase;
  winner: number;
  /** Najwyższy odebrany seq inputu per slot — gość replayuje resztę. */
  ack: number[];
  jets: JetSnap[];
  bullets: { x: number; y: number; k: WeaponId }[];
  flags: { x: number; y: number; carrier: number }[];
}

/**
 * Wszystkie wiadomości między peerami. `hi`/`lobby`/`loadout`/`start`/
 * `over`/`bye`/`full` to przepływ pokoju; `input`/`snap` to rozgrywka.
 */
export type NetMsg =
  // gość → host: prezentacja po połączeniu transportowym (z loadoutem)
  | { t: 'hi'; name: string; w1: WeaponId; w2: WeaponId }
  // host → gość: pełny stan lobby (w tym Twój slot)
  | { t: 'lobby'; players: PlayerSlot[]; you: number }
  // gracz → host: zmiana wyboru broni w lobby
  | { t: 'loadout'; w1: WeaponId; w2: WeaponId }
  // host → wszyscy: start rundy (seed + indeks mapy)
  | { t: 'start'; seed: number; level: number; atTick: number }
  // gość → host: input (seq do odrzucania starych, tick czasu klienta)
  | { t: 'input'; seq: number; tick: number; bits: number }
  // host → wszyscy: snapshot świata + zdarzenia do dźwięków/efektów
  | { t: 'snap'; snap: Snap; ev: SimEvent[] }
  // host → wszyscy: koniec rundy i wyniki
  | { t: 'over'; winner: number; players: PlayerSlot[] }
  // host → gość: pokój pełny
  | { t: 'full' }
  // ktokolwiek: wyjście z pokoju (hosta = koniec rundy)
  | { t: 'bye' };

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Zbuduj Snapshot z SimState — jedyne miejsce, które zna oba kształty. */
export function makeSnap(sim: {
  tick: number; phase: Phase; winner: number;
  jets: { slot: number; mode: JetMode; x: number; y: number; angle: number;
          vx: number; vy: number; alive: boolean; invulnUntil: number;
          carrying: number; lastBits: number; fuel: number; energy: number;
          score: number; lives: number }[];
  bullets: { x: number; y: number; kind: WeaponId }[];
  flags: { x: number; y: number; carrier: number }[];
}): Snap {
  return {
    tick: sim.tick,
    phase: sim.phase,
    winner: sim.winner,
    ack: [],
    jets: sim.jets.map(j => ({
      s: j.slot, m: j.mode,
      x: r1(j.x), y: r1(j.y), a: Math.round(j.angle * 100) / 100,
      vx: r1(j.vx), vy: r1(j.vy),
      al: j.alive, th: (j.lastBits & 4) !== 0,
      inv: Math.max(0, j.invulnUntil - sim.tick),
      carry: j.carrying, f: Math.round(j.fuel), e: Math.round(j.energy),
      score: j.score, lives: j.lives,
    })),
    bullets: sim.bullets.map(b => ({ x: r1(b.x), y: r1(b.y), k: b.kind })),
    flags: sim.flags.map(f => ({ x: r1(f.x), y: r1(f.y), carrier: f.carrier })),
  };
}
