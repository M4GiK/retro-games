// Reprodukcja: gość (player 2) przestaje widzieć swój statek po śmierci.
// Host = prawdziwy sim (createSim/stepSim/makeSnap); gość = GuestLoop
// z fake sesją — sprawdzamy co ląduje w guest.state.jets po
// bail-oucie, śmierci pilota i respawnie.
import { createSim, stepSim } from '../src/core/sim';
import { LEVELS } from '../src/core/level';
import { makeSnap } from '../src/core/protocol';
import { GuestLoop } from '../src/game/guestLoop';
import type { Session } from '../src/net/session';
import type { NetMsg, PlayerSlot } from '../src/core/protocol';
import { TICK_MS } from '../src/core/config';

let passed = 0, failed = 0;
function ok(name: string, cond: boolean, extra = ''): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}

const players: PlayerSlot[] = [
  { slot: 0, peerId: 'host', name: 'H', w1: 'minigun', w2: 'rocket' },
  { slot: 1, peerId: 'guest', name: 'G', w1: 'laser', w2: 'mine' },
];

// Minimalna imitacja Session dla gościa (slot 1).
const session = {
  slot: 1,
  players,
  send: (_msg: NetMsg, _to?: string) => {},
} as unknown as Session;

// Host: prawdziwy sim.
const sim = createSim(LEVELS[0], [
  { name: 'H', w1: 'minigun', w2: 'rocket' },
  { name: 'G', w1: 'laser', w2: 'mine' },
], 7);

let now = 0;
const feed = (g: GuestLoop) => {
  stepSim(sim, []);                       // tick na hoście
  g.onNet({ t: 'snap', snap: makeSnap(sim), ev: [] });
  g.frame(now += TICK_MS);                // klatka u gościa
};

console.log('Reprodukcja: widok gościa po śmierci\n');

const guest = new GuestLoop(session, 0, () => 0, {
  onEvents: () => {},
  onOver: () => {},
});

// --- 1. Żywy start: gość widzi swój statek ---
feed(guest); feed(guest);
const j1 = guest.state.jets.find(j => j.slot === 1);
ok('gość widzi swój jet (start)', !!j1 && j1.alive && j1.mode === 'ship',
  j1 ? `alive=${j1.alive} mode=${j1.mode} x=${j1.x.toFixed(1)}` : 'BRAK');
ok('pozycja jeta skończona', !!j1 && Number.isFinite(j1.x) && Number.isFinite(j1.y),
  j1 ? `x=${j1.x} y=${j1.y}` : 'BRAK');

// --- 2. Zniszczenie statku → bail-out (jak kill() z sima) ---
const hj = sim.jets.find(j => j.slot === 1)!;
hj.energy = 0;                    // jak po damageShip
hj.mode = 'pilot';                // bailOut
hj.fuel = 45;
feed(guest);
const j2 = guest.state.jets.find(j => j.slot === 1);
ok('gość widzi pilota po bail-oucie', !!j2 && j2.alive && j2.mode === 'pilot',
  j2 ? `alive=${j2.alive} mode=${j2.mode} x=${j2.x} y=${j2.y}` : 'BRAK');
ok('pozycja pilota skończona', !!j2 && Number.isFinite(j2.x) && Number.isFinite(j2.y),
  j2 ? `x=${j2.x} y=${j2.y}` : 'BRAK');

// --- 3. Śmierć pilota (kill): alive=false, respawnAt za ~120 ticków ---
hj.alive = false;
hj.lives--;
hj.respawnAt = sim.tick + 12;
feed(guest);
const j3 = guest.state.jets.find(j => j.slot === 1);
ok('martwy jet jest w stanie gościa (alive=false)', !!j3 && !j3.alive,
  j3 ? `alive=${j3.alive}` : 'BRAK — jet zniknął ze state.jets');

// --- 4. Respawn — symulujemy ticki aż host ożywi jeta ---
for (let i = 0; i < 15; i++) feed(guest);
const j4 = guest.state.jets.find(j => j.slot === 1);
ok('po respawnie jet żyje w stanie gościa', !!j4 && j4.alive === true,
  j4 ? `alive=${j4.alive}` : 'BRAK');
ok('po respawnie jet jest statkiem', !!j4 && j4.mode === 'ship',
  j4 ? `mode=${j4.mode}` : 'BRAK');
ok('po respawnie pozycja skończona i w świecie', !!j4 && Number.isFinite(j4.x) && Number.isFinite(j4.y) && j4.x >= 0 && j4.y >= 0,
  j4 ? `x=${j4.x} y=${j4.y}` : 'BRAK');

// --- 5. Jeszcze kilka klatek — czy jet "ucieka" z ekranu (offX drift)? ---
for (let i = 0; i < 60; i++) feed(guest);
const j5 = guest.state.jets.find(j => j.slot === 1);
const sp = { x: j5?.x ?? NaN, y: j5?.y ?? NaN };
const hp = sim.jets.find(j => j.slot === 1)!;
const drift = Math.hypot((sp.x - hp.x), (sp.y - hp.y));
ok('widok gościa zbiega do autorytetu (drift < 20px)', drift < 20,
  `drift=${drift.toFixed(1)}px guest=(${sp.x?.toFixed(1)},${sp.y?.toFixed(1)}) host=(${hp.x.toFixed(1)},${hp.y.toFixed(1)})`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} asercji nie przeszło`);
