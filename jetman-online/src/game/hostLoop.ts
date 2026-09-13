/**
 * Pętla hosta — autorytetna symulacja + rozsyłanie snapshotów.
 *
 * setInterval co TICK_MS: zbiera inputy (własny z klawiatury, gości
 * z ostatnich wiadomości 'input'), stepSim, co SNAPSHOT_EVERY ticków
 * broadcast snapshotu ze zdarzeniami (dźwięki/efekty/diffy terenu gości)
 * i `ack` — najwyższym odebranym seq inputu per slot — gość odtwarza
 * z niego potwierdzone wejścia i powtarza resztę (replay po reconcile).
 */

import { makeSnap } from '../core/protocol';
import { createSim, stepSim, type PlayerInfo } from '../core/sim';
import { LEVELS } from '../core/level';
import { SNAPSHOT_EVERY, TICK_MS } from '../core/config';
import type { InputBits, SimEvent, SimState } from '../core/types';
import type { Session } from '../net/session';

export interface HostLoopEvents {
  /** Zdarzenia simu do lokalnych dźwięków/efektów (host je też słyszy). */
  onEvents(ev: SimEvent[]): void;
  /** Runda skończona (po wysłaniu 'over'). */
  onOver(winner: number): void;
}

export class HostLoop {
  readonly sim: SimState;
  /** Ostatni znany input per slot — brak nowego = powtórz stary. */
  private inputs: InputBits[] = [];
  /** Najwyższy odebrany seq inputu per slot → do snapshotu (ack). */
  private lastSeq: number[] = [];
  private pending: SimEvent[] = [];
  private timer = 0;

  constructor(
    private readonly session: Session,
    levelIdx: number,
    seed: number,
    private readonly ownBits: () => InputBits,
    private readonly ev: HostLoopEvents,
  ) {
    const players: (PlayerInfo | null)[] = [];
    for (const p of session.players) players[p.slot] = { name: p.name, w1: p.w1, w2: p.w2 };
    this.sim = createSim(LEVELS[levelIdx] ?? LEVELS[0], players, seed);
  }

  /** Guest → host input (wywołuje Session.onMsg w main.ts). */
  onInput(slot: number, bits: InputBits, seq = 0): void {
    // Odrzuć stare/powtórzone ramki — seq rośnie monotonicznie.
    if (seq > (this.lastSeq[slot] ?? -1)) {
      this.lastSeq[slot] = seq;
      this.inputs[slot] = bits;
    }
  }

  /** Gracz odszedł w trakcie rundy — jego jet przestaje istnieć. */
  onPeerGone(slot: number): void {
    const jet = this.sim.jets.find(j => j.slot === slot);
    if (jet) {
      jet.connected = false;
      jet.alive = false;
      jet.lives = 0;
    }
    this.inputs[slot] = 0;
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), TICK_MS) as unknown as number;
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private tick(): void {
    this.inputs[this.session.slot] = this.ownBits();
    const ev = stepSim(this.sim, this.inputs);
    this.pending.push(...ev);

    if (this.sim.tick % SNAPSHOT_EVERY === 0) {
      const snap = makeSnap(this.sim);
      snap.ack = this.lastSeq.slice();
      this.session.send({ t: 'snap', snap, ev: this.pending });
      this.pending = [];
    }
    this.ev.onEvents(ev);

    if (this.sim.phase === 'over') {
      this.session.send({ t: 'over', winner: this.sim.winner, players: this.session.players });
      this.ev.onOver(this.sim.winner);
      this.stop();
    }
  }
}
