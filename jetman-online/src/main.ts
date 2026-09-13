/**
 * Jetman Online — boot + sklejanie modułów.
 *
 * Przepływ: menu → Session (create/join → lobby z wyborem broni/mapy)
 * → start rundy → host: HostLoop (autorytet) | guest: GuestLoop
 * (inputy + replay predykcji + adaptacyjna interpolacja).
 * Rysowanie: zawsze drawScene(SimState) — host ma prawdziwy sim,
 * gość składa widok ze snapshotów; kamera śledzi własny jet.
 * ?demo = solo z botem-kółkiem, ?room=KOD = auto-dołączenie,
 * ?transport=local wymusza BroadcastChannel (dev w 2 kartach).
 */

import { createSim, stepSim } from './core/sim';
import { LEVELS } from './core/level';
import { TICK_MS } from './core/config';
import { IN_RIGHT, IN_THRUST, type SimEvent, type SimState, ZONE_WATER } from './core/types';
import { drawScene, invalidateTerrain, addShake } from './render/scene';
import { HostLoop } from './game/hostLoop';
import { GuestLoop } from './game/guestLoop';
import { Session } from './net/session';
import { createLocalTransport } from './net/local';
import { createTrysteroTransport } from './net/trystero';
import type { Transport } from './net/transport';
import { InputManager } from './systems/input';
import { drawHud } from './render/hud';
import { Effects } from './render/effects';
import { playEvents, setThrust, audioUnlocked, runAudio, toneAt, noiseAt } from './audio/sfx';
import { playMusic } from './audio/music';
import { Menu } from './ui/menu';
import { SplashScreen } from './ui/splash';
import type { NetMsg, PlayerSlot } from './core/protocol';
import type { WeaponId } from './core/types';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const input = new InputManager();
const effects = new Effects();

input.init();

let session: Session | null = null;
let host: HostLoop | null = null;
let guest: GuestLoop | null = null;
let demo: { sim: SimState } | null = null;

function pickTransport(): Transport {
  return params.get('transport') === 'local'
    ? createLocalTransport()
    : createTrysteroTransport();
}

/** Zdarzenia simu → dźwięki + cząsteczki + dziury w warstwie terenu. */
function handleEvents(sim: SimState, ev: SimEvent[]): void {
  playEvents(ev);
  effects.spawn(ev);
  for (const e of ev) {
    if (e.t === 'terrain') {
      invalidateTerrain(sim.level, e.cells);
      effects.terrainDebris(sim.level, e.cells);
    } else if (e.t === 'boom' || e.t === 'explode') {
      addShake(e.t === 'boom' ? 0.4 : 0.6);
    } else if (e.t === 'zone' && e.zone === ZONE_WATER) {
      const j = sim.jets.find(jj => jj.slot === e.slot);
      if (j) effects.splash(j.x, j.y);
    }
  }
}

const menu = new Menu({
  onCreate(w1: WeaponId, w2: WeaponId) {
    session = Session.create(pickTransport(), 'GRACZ', w1, w2, sessionEvents);
    menu.showLobby(session.code, session.players, 0, true);
  },
  async onJoin(code: string, w1: WeaponId, w2: WeaponId) {
    try {
      session = await Session.join(pickTransport(), 'GRACZ', code, w1, w2, sessionEvents);
    } catch (e) {
      menu.error('join', e instanceof Error ? e.message : 'BŁĄD POŁĄCZENIA');
    }
  },
  onStart(mapIdx: number) {
    session?.startRound((Math.random() * 2 ** 31) | 0, mapIdx);
  },
  onDemo: startDemo,
  onLeave: leaveAll,
  onAgain(mapIdx: number) {
    if (session?.role === 'host') session.startRound((Math.random() * 2 ** 31) | 0, mapIdx);
  },
  onLoadout(w1: WeaponId, w2: WeaponId) {
    session?.setLoadout(w1, w2);
  },
});

const sessionEvents = {
  onLobby: (players: PlayerSlot[], mySlot: number) => {
    if (session) menu.showLobby(session.code, players, mySlot, session.role === 'host');
  },
  onStart: (seed: number, level: number) => {
    menu.show('none');
    effects.clear();
    input.clear();
    playMusic('game');
    if (!session) return;
    if (session.role === 'host') {
      host = new HostLoop(session, level, seed, input.getBits, {
        onEvents: ev => handleEvents(host!.sim, ev),
        onOver: showOver,
      });
      host.start();
    } else {
      guest = new GuestLoop(session, level, input.getBits, {
        onEvents: ev => handleEvents(guest!.state, ev),
        onOver: showOver,
      });
    }
  },
  onMsg: (msg: NetMsg, from: string) => {
    if (host && msg.t === 'input') {
      const p = session?.players.find(pl => pl.peerId === from);
      if (p) host.onInput(p.slot, msg.bits, msg.seq);
    } else {
      guest?.onNet(msg);
    }
  },
  onHostGone: () => { leaveAll(); menu.show('menu'); menu.error('menu', 'HOST WYSZEDŁ Z POKOJU'); },
  onPeerGone: (_id: string, slot: number) => host?.onPeerGone(slot),
};

function showOver(_winner: number): void {
  const state = currentState();
  if (!state) return;
  const scores = state.jets.map(j => ({ name: j.name, score: j.score }));
  const w = state.jets.find(j => j.slot === state.winner);
  menu.showOver(w?.name ?? '—', scores);
}

function currentState(): SimState | null {
  if (host) return host.sim;
  if (guest) return guest.state;
  if (demo) return demo.sim;
  return null;
}

function leaveAll(): void {
  host?.stop(); host = null;
  guest = null; demo = null;
  session?.leave(); session = null;
  // Powrót do menu = z powrotem ścieżka menu.
  playMusic('menu');
}

/** Tryb solo: sim lokalny + bot lecący po okręgu — dev renderu/audio. */
function startDemo(): void {
  menu.show('none');
  effects.clear();
  playMusic('game');
  const me = { name: 'TY', w1: menu.loadout()[0], w2: menu.loadout()[1] };
  const bot = { name: 'BOT', w1: 'minigun' as WeaponId, w2: 'rocket' as WeaponId };
  const sim = createSim(LEVELS[menu.mapIdx()], [me, bot], 1);
  demo = { sim };
  let acc = 0, last = performance.now();
  const step = (now: number) => {
    acc += now - last; last = now;
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      const botBits = IN_RIGHT | ((sim.tick % 120) < 80 ? IN_THRUST : 0);
      const ev = stepSim(sim, [input.getBits(), botBits]);
      handleEvents(sim, ev);
      if (sim.phase === 'over') { demo = null; leaveAll(); menu.show('menu'); return; }
    }
    if (demo) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---- Główna pętla rysowania ----

function frame(now: number): void {
  guest?.frame(now);
  const sim = currentState();
  if (sim) {
    drawScene(ctx, sim, session?.slot ?? 0);
    effects.trail(sim);
    effects.stepAndDraw(ctx);
    drawHud(ctx, sim, session?.slot ?? 0);
    // Pętla silnika — brzęczy gdy własny jet ma ciąg i paliwo.
    const self = sim.jets.find(j => j.slot === (session?.slot ?? 0));
    setThrust(!!(self?.alive && (self.lastBits & IN_THRUST) && self.fuel > 0));
  } else {
    setThrust(false);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- Boot: splash M4GIK -> menu (+ muzyka) -> ew. deep-linki ----

const splashEl = document.getElementById('splash')!;
const splash = new SplashScreen(
  document.getElementById('splashFx') as HTMLCanvasElement,
  { audioUnlocked, runAudio, tone: toneAt, noise: noiseAt },
  () => {
    splashEl.hidden = true;
    menu.show('menu');
    playMusic('menu');
    // Deep-linki po splashu: ?room=KOD = auto-dołączenie, ?demo = solo z botem.
    const roomParam = params.get('room');
    if (roomParam && /^[A-Za-z0-9]{4}$/.test(roomParam)) menu.joinCode(roomParam);
    else if (params.has('demo')) startDemo();
  },
);
splashEl.addEventListener('pointerdown', () => splash.handleInput());
window.addEventListener('keydown', () => splash.handleInput());
splash.start();
