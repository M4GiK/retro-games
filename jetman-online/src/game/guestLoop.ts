/**
 * Pętla gościa — wysyłka inputów + interpolacja snapshotów + predykcja
 * własnego jeta z REPLAYEM niepotwierdzonych wejść.
 *
 * Optymalizacja dla gracza nr 2 (z megaplanu):
 *  - inputy lecą jako bitmaski co INPUT_EVERY ticków,
 *  - snapshot niesie `ack` = najwyższy seq inputu odebrany przez hosta —
 *    gość resetuje się do stanu autorytetu i replayuje tylko wejścia,
 *    których host jeszcze nie widział (reszta jest już w snapshocie),
 *  - opóźnienie interpolacji adaptuje się do zmierzonego jittera
 *    (EMA odstępu snapshotów), nie jest sztywno,
 *  - diffy terenu ('terrain') aplikowane do lokalnej kopii mapy, więc
 *    predykcja i render widzą wydrążenia od razu.
 */

import {
  ENERGY_MAX, FUEL_MAX, INPUT_EVERY, INTERP_DELAY_MS, TICK_MS,
} from '../core/config';
import { accelerateJet, moveJet, steerJet } from '../core/physics';
import { applyTerrain, LEVELS, spawnPoint, type LevelData } from '../core/level';
import { makeRng } from '../core/rng';
import type { NetMsg, Snap } from '../core/protocol';
import type { Session } from '../net/session';
import {
  IN_THRUST, ZONE_NONE, type InputBits, type JetState, type SimEvent, type SimState,
} from '../core/types';

export interface GuestLoopEvents {
  onEvents(ev: SimEvent[]): void;
  onOver(winner: number): void;
}

/** Ile ms historii inputów trzymamy do replayu (pokrywa RTT + jitter). */
const INPUT_HISTORY_MS = 500;

export class GuestLoop {
  /** Widok świata do renderu — ta sama struktura co u hosta. */
  readonly state: SimState;
  private prev: Snap | null = null;
  private cur: Snap | null = null;
  private curAt = 0;
  /** EMA odstępu między snapshotami → adaptacyjny interp delay. */
  private snapInterval = SNAPSHOT_MS_EST;
  private seq = 0;
  /** Akumulator czasu — stały krok predykcji niezależnie od fps. */
  private acc = 0;
  private lastFrameAt = -1;
  private predTick = 0;
  /** Wysłane, niepotwierdzone inputy (seq, bits, czas wysłania). */
  private inputQueue: { seq: number; bits: number; at: number }[] = [];
  /** Predykowany własny jet + błąd względem autorytetu. */
  private self: JetState;
  private offX = 0;
  private offY = 0;
  private names: (string | null)[] = [];
  private loadouts: ({ w1: JetState['w1']; w2: JetState['w2'] } | null)[] = [];
  private level: LevelData;

  constructor(
    private readonly session: Session,
    levelIdx: number,
    private readonly ownBits: () => InputBits,
    private readonly ev: GuestLoopEvents,
  ) {
    this.level = LEVELS[levelIdx] ?? LEVELS[0];
    for (const p of session.players) {
      this.names[p.slot] = p.name;
      this.loadouts[p.slot] = { w1: p.w1, w2: p.w2 };
    }
    const sp = spawnPoint(this.level, session.slot);
    this.self = makeJet(session.slot, this.names[session.slot] ?? '', sp.x, sp.y, this.level, this.loadouts);
    this.state = {
      tick: 0, level: this.level, phase: 'play', winner: -1,
      jets: [], bullets: [], flags: [], nextBulletId: 0,
      rng: makeRng(1), startedAtMs: 0,
    };
  }

  /** Host przysłał wiadomość — woła Session.onMsg w main.ts. */
  onNet(msg: NetMsg): void {
    if (msg.t === 'snap') {
      const now = performance.now();
      if (this.cur) {
        const dt = now - this.curAt;
        // EMA odstępu snapshotów → adaptacyjne opóźnienie interpolacji.
        this.snapInterval += (dt - this.snapInterval) * 0.15;
      }
      this.prev = this.cur;
      this.cur = msg.snap;
      this.curAt = now;
      for (const e of msg.ev) {
        if (e.t === 'terrain') applyTerrain(this.level, e.cells);
      }
      this.reconcile(msg.snap);
      this.ev.onEvents(msg.ev);
      this.state.phase = msg.snap.phase;
      this.state.winner = msg.snap.winner;
      this.state.tick = msg.snap.tick;
    } else if (msg.t === 'over') {
      this.ev.onOver(msg.winner);
    }
  }

  /** Wołaj co rAF: stały krok predykcji (akumulator) + składanie widoku. */
  frame(now: number): void {
    if (this.lastFrameAt < 0) this.lastFrameAt = now;
    this.acc += now - this.lastFrameAt;
    this.lastFrameAt = now;
    // Zamrożona karta nie nadgania sekund naraz — sufit przeciw lawinie.
    if (this.acc > 250) this.acc = 250;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.step(now);
    }
    this.buildView(now);
  }

  /**
   * Jeden tick predykcji. Input leci co INPUT_EVERY ticków (30 Hz) —
   * host aplikuje każdy aż do kolejnego, więc jeden input ≈ INPUT_EVERY
   * ticków na hoście (to samo założenie ma replay w reconcile()).
   */
  private step(now: number): void {
    if (this.predTick++ % INPUT_EVERY === 0) {
      const bits = this.ownBits();
      this.inputQueue.push({ seq: this.seq, bits, at: now });
      this.session.send(
        { t: 'input', seq: this.seq++, tick: this.state.tick, bits },
        this.hostPeer(),
      );
    }
    this.predictSelf();
  }

  // ---- wnętrze ----

  private hostPeer(): string | undefined {
    return this.session.players.find(p => p.slot === 0)?.peerId;
  }

  /**
   * Korekcja predykcji: reset do stanu autorytetu ze snapshotu, potem
   * replay inputów, których host jeszcze nie potwierdził (seq > ack).
   */
  private reconcile(snap: Snap): void {
    const s = snap.jets.find(j => j.s === this.self.slot);
    if (!s) return;
    const ack = snap.ack[this.self.slot] ?? -1;
    const before = this.self.x;
    const beforeY = this.self.y;

    this.self.x = s.x; this.self.y = s.y;
    this.self.vx = s.vx; this.self.vy = s.vy;
    this.self.angle = s.a;
    this.self.mode = s.m;
    this.self.alive = s.al;
    this.self.carrying = s.carry;
    this.self.fuel = s.f;
    this.self.energy = s.e;

    // Odrzuć inputy potwierdzone przez hosta + stare śmieci.
    const cutoff = performance.now() - INPUT_HISTORY_MS;
    this.inputQueue = this.inputQueue.filter(i => i.seq > ack && i.at > cutoff);
    for (const i of this.inputQueue) {
      this.self.lastBits = i.bits;
      // Host widzi każdy input przez ~INPUT_EVERY ticków (30 Hz → 60 Hz),
      // replay musi pokryć tyle samo kroków, inaczej jet systematycznie
      // zostaje w tyle i offX/offY wciąga stały błąd.
      for (let n = 0; n < INPUT_EVERY; n++) {
        steerJet(this.self, i.bits);
        accelerateJet(this.level, this.self);
        moveJet(this.level, this.self);
      }
    }

    // Resztkowa rozbieżność → offset wygaszany w renderze.
    // Przypisanie (nie +=): offX ma wyrównać rysowaną pozycję do tej
    // sprzed resetu, więc self.x + offX = before + stary offX.
    this.offX = (before + this.offX) - this.self.x;
    this.offY = (beforeY + this.offY) - this.self.y;
  }

  /** Predykcja: ten sam krok fizyki co host, na własnym jecie. */
  private predictSelf(): void {
    if (!this.self.alive) return;
    const bits = this.ownBits();
    this.self.lastBits = bits;
    steerJet(this.self, bits);
    accelerateJet(this.level, this.self);
    moveJet(this.level, this.self);
    this.offX *= 0.85;
    this.offY *= 0.85;
  }

  /** Złóż renderowalny stan: cudze jety = lerp prev→cur, reszta z cur. */
  private buildView(now: number): void {
    const cur = this.cur;
    if (!cur) return;
    // Adaptacyjne opóźnienie: ~2/3 zmierzonego odstępu, w limitach.
    const delay = Math.min(INTERP_DELAY_MS, Math.max(30, this.snapInterval * 0.66));
    const alpha = this.prev
      ? Math.min(1, Math.max(0, (now - this.curAt + delay) /
          ((cur.tick - this.prev.tick) * TICK_MS)))
      : 1;

    const jets: JetState[] = [];
    for (const c of cur.jets) {
      const slot = c.s;
      const p = this.prev?.jets.find(j => j.s === slot);
      let x = c.x, y = c.y, a = c.a;
      if (p) {
        x = p.x + (c.x - p.x) * alpha;
        y = p.y + (c.y - p.y) * alpha;
        a = p.a + (c.a - p.a) * alpha;
      }
      if (slot === this.self.slot) {
        x = this.self.x + this.offX;
        y = this.self.y + this.offY;
        a = this.self.angle;
      }
      const lo = this.loadouts[slot];
      const sp = spawnPoint(this.level, slot);
      jets.push({
        slot, name: this.names[slot] ?? `P${slot + 1}`,
        mode: c.m, x, y, vx: c.vx, vy: c.vy, angle: a,
        alive: c.al, respawnAt: 0, invulnUntil: 0,
        cooldownUntil: 0, cooldown2Until: 0, carrying: c.carry,
        connected: true, lastBits: c.th ? IN_THRUST : 0,
        fuel: c.f, energy: c.e, w1: lo?.w1 ?? 'minigun', w2: lo?.w2 ?? 'rocket',
        rockets: 0, homeX: sp.x, homeY: sp.y + 8, zone: ZONE_NONE,
        kills: 0, deaths: 0, captures: 0,
        score: c.score, lives: c.lives,
      });
    }
    this.state.jets = jets;
    this.state.bullets = cur.bullets.map((b, i) => ({
      id: i, owner: -1, kind: b.k, x: b.x, y: b.y, vx: 0, vy: 0,
      dieAt: 0, armedAt: 0,
    }));
    this.state.flags = cur.flags.map((f, i) => ({
      slot: i, homeX: f.x, homeY: f.y, x: f.x, y: f.y,
      vx: 0, vy: 0, carrier: f.carrier, returnAt: 0,
    }));
  }
}

const SNAPSHOT_MS_EST = 150;

function makeJet(
  slot: number, name: string, x: number, y: number,
  level: LevelData, loadouts: GuestLoop['loadouts'],
): JetState {
  const sp = spawnPoint(level, slot);
  const lo = loadouts[slot];
  return {
    slot, name, mode: 'ship', x, y, vx: 0, vy: 0, angle: -Math.PI / 2,
    alive: true, respawnAt: 0, invulnUntil: 0,
    cooldownUntil: 0, cooldown2Until: 0,
    carrying: -1, connected: true, lastBits: 0,
    fuel: FUEL_MAX, energy: ENERGY_MAX,
    w1: lo?.w1 ?? 'minigun', w2: lo?.w2 ?? 'rocket', rockets: 0,
    homeX: sp.x, homeY: sp.y + 8, zone: ZONE_NONE,
    kills: 0, deaths: 0, captures: 0, score: 0, lives: 0,
  };
}
