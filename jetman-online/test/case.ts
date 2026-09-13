/**
 * Testy headless core/sim — uruchamiane przez test/run.mjs (node, bez DOM).
 * Asercje mechanik z megaplanu: paliwo/energia, bail-out pilota,
 * bronie, tether flagi, niszczalny teren, determinizm.
 */

import { createSim, jetAt, stepSim, type PlayerInfo } from '../src/core/sim';
import { carveCircle, isSolid, LEVELS, spawnPoint, worldSize } from '../src/core/level';
import { makeSnap } from '../src/core/protocol';
import {
  IN_FIRE, IN_FIRE2, IN_LEFT, IN_RIGHT, IN_THRUST,
} from '../src/core/types';
import {
  ENERGY_MAX, FUEL_MAX, PILOT_ROCKETS, SCORE_FLAG, START_LIVES, TILE,
} from '../src/core/config';

let failed = 0;
function ok(cond: boolean, name: string): void {
  if (cond) { console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}`); }
}

const P = (name: string, w1: PlayerInfo['w1'] = 'minigun', w2: PlayerInfo['w2'] = 'rocket'): PlayerInfo => ({ name, w1, w2 });
const step = (sim: ReturnType<typeof createSim>, bits: (number | undefined)[], n: number) => {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...stepSim(sim, bits));
  return ev;
};

// --- spawn: dwóch graczy na swoich bazach ---
{
  const sim = createSim(LEVELS[0], [P('A'), P('B')], 42);
  ok(sim.jets.length === 2, 'createSim: 2 jety');
  ok(sim.flags.length === 2, 'createSim: 2 flagi');
  ok(sim.jets[0].lives === START_LIVES, 'createSim: pula żyć');
  ok(sim.jets[0].fuel === FUEL_MAX && sim.jets[0].energy === ENERGY_MAX, 'createSim: pełne zasoby');
  ok(sim.jets[0].mode === 'ship', 'createSim: start jako statek');
}

// --- paliwo: ciąg ssie bak, pusty = brak wznoszenia ---
{
  const sim = createSim(LEVELS[0], [P('A'), P('B')], 42);
  sim.jets[0].x = 128; sim.jets[0].y = 60; sim.jets[0].invulnUntil = 0;
  step(sim, [IN_THRUST], 60);
  const fuelMid = sim.jets[0].fuel;
  ok(fuelMid < FUEL_MAX, 'paliwo: ciąg zużywa bak');
  sim.jets[0].fuel = 0;
  const y0 = sim.jets[0].y;
  step(sim, [IN_THRUST], 40);
  ok(sim.jets[0].y >= y0 - 1, 'paliwo: pusty bak = brak ciągu');
  // Regeneracja bez ciągu.
  const f0 = sim.jets[0].fuel;
  step(sim, [0], 30);
  ok(sim.jets[0].fuel > f0, 'paliwo: regeneracja bez ciągu');
}

// --- energia → bail-out → pilot z jetpackiem i karabinkiem ---
{
  const sim = createSim(LEVELS[0], [P('A'), P('B')], 42);
  const j = sim.jets[0];
  j.x = 128; j.y = 60; j.invulnUntil = 0;
  // Postrzelaj własnego statku wroga nie można — uszkodź energię bezpośrednio
  // przez celowe uderzenie: nadaj prędkość w skałę? Prościej: strzał gracza B.
  const b = sim.jets[1];
  b.x = 128; b.y = 60; b.angle = 0; b.invulnUntil = 0; // B obok A, celuje w prawo? postawimy B na lewo od A celując w A
  b.x = 100; b.y = 60; b.angle = 0;
  j.x = 140; j.y = 60;
  let ev = [];
  // B strzela minigunem w prawo w kierunku A aż energia A spadnie.
  for (let i = 0; i < 400 && sim.jets[0].mode === 'ship'; i++) {
    ev.push(...stepSim(sim, [0, i % 6 < 2 ? IN_FIRE : 0]));
    // Zresetuj pozycje, żeby grawitacja nie rozjechała testu.
    j.x = 140; j.y = 60; j.vx = 0; j.vy = 0;
    b.x = 100; b.y = 60; b.vx = 0; b.vy = 0; b.angle = 0;
  }
  ok(sim.jets[0].energy < ENERGY_MAX, 'energia: trafienia ją zabierają');
  ok(sim.jets[0].mode === 'pilot', 'bail-out: zniszczony statek → pilot');
  ok(ev.some(e => e.t === 'bailout'), 'bail-out: event wysłany');
  ok(sim.jets[0].rockets === PILOT_ROCKETS, 'pilot: zapas rakiet');
  // Pilot strzela karabinkiem i rakietą.
  step(sim, [IN_FIRE], 5);
  ok(sim.bullets.some(bb => bb.kind === 'rifle'), 'pilot: karabinek strzela');
  step(sim, [IN_FIRE2], 3);
  ok(sim.bullets.some(bb => bb.kind === 'homing'), 'pilot: rakieta samonaprowadzająca');
  ok(sim.jets[0].rockets === PILOT_ROCKETS - 1, 'pilot: rakieta zużyta');
}

// --- tether: flaga ciągnie się za nosicielem ---
{
  const sim = createSim(LEVELS[0], [P('A'), P('B')], 42);
  const flag = sim.flags[1]; // flaga gracza B (slot 1)
  const j = sim.jets[0];
  j.invulnUntil = 0;
  j.x = flag.x; j.y = flag.y; j.vx = 0; j.vy = 0;
  step(sim, [0], 2);
  ok(j.carrying === 1, 'flaga: podniesiona');
  // Polec i sprawdź, że flaga podąża.
  j.x = 128; j.y = 60;
  step(sim, [IN_THRUST], 30);
  const d = Math.hypot(flag.x - j.x, flag.y - j.y);
  ok(d > 0 && d < 60, 'tether: flaga podąża za nosicielem');
}

// --- niszczalny teren: carveCircle robi dziurę ---
{
  const lvl = LEVELS[0];
  // Znajdź solidny kafelek w środku mapy.
  let cx = 0, cy = 0;
  outer:
  for (let ty = 20; ty < lvl.h; ty++) {
    for (let tx = 20; tx < lvl.w - 20; tx++) {
      if (lvl.tiles[ty * lvl.w + tx] === 1) { cx = tx * TILE + 2; cy = ty * TILE + 2; break outer; }
    }
  }
  const cells = carveCircle(lvl, cx, cy, 12);
  ok(cells.length > 0, 'teren: carveCircle zwrócił komórki');
  ok(cells.every(i => lvl.tiles[i] === 0), 'teren: kafelki wydrążone');
}

// --- karabin też ryje podłoże ---
{
  const sim = createSim(LEVELS[0], [P('A'), P('B')], 42);
  const j = sim.jets[0];
  j.invulnUntil = 0;
  // Ustaw jet w powietrzu obok skały i strzelaj w nią (w dół, w kolumnę).
  j.x = 128; j.y = 100; j.angle = Math.PI / 2; j.vx = 0; j.vy = 0;
  let carved = false;
  for (let i = 0; i < 200 && !carved; i++) {
    j.x = 128; j.y = 100; j.vx = 0; j.vy = 0; j.angle = Math.PI / 2;
    const ev = stepSim(sim, [i % 8 < 2 ? IN_FIRE : 0, 0]);
    carved = ev.some(e => e.t === 'terrain');
  }
  ok(carved, 'karabin: pocisk wydrąża podłoże');
}

// --- wielka mapa: kilka ekranów, spawny poza skałą ---
{
  const big = LEVELS[LEVELS.length - 1];
  const { w, h } = worldSize(big);
  ok(w >= 700 && h >= 400, `mapa "${big.name}": ${w}×${h}px (kilka ekranów)`);
  ok(big.spawns.length === 4, 'mapa: 4 bazy');
  ok(big.spawns.every(s => !isSolid(big, s.x, s.y - TILE)), 'mapa: spawny w powietrzu');
  ok(big.spawns.every(s => !isSolid(big, s.x, s.y)), 'mapa: spawny w komnatach');
}

// --- rakieta wybucha i rypie teren ---
{
  const sim = createSim(LEVELS[0], [P('A', 'minigun', 'rocket'), P('B')], 42);
  const j = sim.jets[0];
  j.x = 128; j.y = 60; j.angle = Math.PI / 2; j.invulnUntil = 0; // celuj w dół w kolumnę
  const ev = step(sim, [IN_FIRE2], 1);
  ok(ev.some(e => e.t === 'fire'), 'rakieta: wystrzelona');
  const ev2 = step(sim, [0, 0], 600);
  ok(ev2.some(e => e.t === 'boom'), 'rakieta: eksplozja');
  ok(ev2.some(e => e.t === 'terrain'), 'rakieta: teren wydrążony');
}

// --- deterministyczność ---
{
  const a = createSim(LEVELS[0], [P('A'), P('B')], 7);
  const b = createSim(LEVELS[0], [P('A'), P('B')], 7);
  for (let i = 0; i < 300; i++) {
    stepSim(a, [IN_THRUST | IN_FIRE, 0]);
    stepSim(b, [IN_THRUST | IN_FIRE, 0]);
  }
  ok(
    JSON.stringify(a.jets) === JSON.stringify(b.jets)
      && JSON.stringify(a.bullets) === JSON.stringify(b.bullets),
    'deterministyczność przy tym samym seedzie',
  );
}

// --- snapshot: kompletny i oszczędny ---
{
  const sim = createSim(LEVELS[0], [P('A'), P('B'), null, P('C')], 1);
  step(sim, [IN_THRUST, 0, undefined, IN_THRUST], 30);
  const snap = makeSnap(sim);
  ok(snap.jets.length === 3, 'snap: tylko zajęte sloty (rzadka tablica)');
  ok(snap.jets[0].s === 0 && snap.jets[1].s === 1 && snap.jets[2].s === 3, 'snap: pole slotu s');
  ok(typeof snap.jets[0].f === 'number' && typeof snap.jets[0].e === 'number', 'snap: fuel+energy');
  const bytes = JSON.stringify(snap).length;
  ok(bytes < 1200, `snap: rozmiar ${bytes}B < 1200B`);
}

// --- pilot: głowa zawsze do góry, jetpack pionowy, sterowanie bokiem ---
{
  const sim = createSim(LEVELS[0], [P('A'), P('B')], 42);
  const j = sim.jets[0];
  j.mode = 'pilot'; j.invulnUntil = 0; j.fuel = 40;
  j.x = 128; j.y = 40; j.vx = 0; j.vy = 0; j.angle = -Math.PI / 2;
  const y0 = j.y;
  step(sim, [IN_THRUST], 30);
  ok(j.y < y0, 'pilot: jetpack unosi pionowo (głowa w górę)');
  const x0 = j.x;
  step(sim, [IN_RIGHT], 20);
  ok(j.x > x0, 'pilot: ▶ = przyspieszenie w bok');
  ok(j.angle === 0, 'pilot: facing = kierunek strzału');
  j.vx = 0; const x1 = j.x;
  step(sim, [IN_LEFT], 20);
  ok(j.x < x1 && j.angle === Math.PI, 'pilot: ◀ = lot w lewo + cel w lewo');
  // Karabinek strzela poziomo w stronę facing.
  step(sim, [IN_FIRE], 2);
  ok(sim.bullets.some(b => b.kind === 'rifle' && b.vx < 0), 'pilot: karabinek strzela w lewo');
}

// --- życie po śmierci pilota: -1 życie ---
{
  const sim = createSim(LEVELS[0], [P('A'), P('B')], 42);
  const j = sim.jets[0];
  j.mode = 'pilot'; j.invulnUntil = 0;
  j.x = 128; j.y = 60; j.vx = 0; j.vy = 8; // pilot w ziemię z prędkością
  step(sim, [0], 10);
  ok(!j.alive || j.lives === START_LIVES - 1, 'pilot: śmierć = -1 życie');
}

if (failed) throw new Error(`${failed} test(ów) nie przeszło`);
console.log('\nWszystkie testy OK');
