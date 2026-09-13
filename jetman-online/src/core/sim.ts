/**
 * Symulacja rundy — autorytetna logika gry (ticket A1+A2+A3).
 *
 * Host woła stepSim co tick z bitmaskami wejścia wszystkich graczy;
 * gość może wołać te same funkcje do predykcji własnego jeta.
 * Funkcje tu są czyste względem SimState — zero DOM, zero sieci.
 *
 * Model z Jetmen Revival:
 *   statek ma PALIWO (ciąg) i ENERGIĘ (HP) — trafienia/uderzenia zadają
 *   obrażenia; energia ≤ 0 → eksplozja statku i BAIL-OUT pilota
 *   na jetpacku (karabinek + rakiety samonapr., może nieść flagę);
 *   śmierć pilota = -1 życie → respawn jako nowy statek.
 *   Flaga ciągnięta na linie (physics.stepTether). Teren niszczalny
 *   (boom → carveCircle → event 'terrain' do gości).
 */

import {
  BASE_R, BOOM_DMG, BULLET_MAX, CRASH_DMG_SCALE, CRASH_SAFE,
  ENERGY_BASE_REGEN, ENERGY_MAX, FLAG_RETURN_MS, FUEL_BASE_REGEN,
  FUEL_MAX, FUEL_REGEN, FUEL_THRUST, INVULN_MS, JET_R, PILOT_CRASH,
  PILOT_FUEL_MAX, PILOT_R, PILOT_ROCKETS, RESPAWN_MS, SCORE_FLAG,
  SCORE_KILL, START_LIVES, TICK_MS,
} from './config';
import { carveCircle, isSolid, spawnPoint, zoneAt, type LevelData } from './level';
import {
  accelerateJet, bulletHitsJet, moveJet, steerHoming, steerJet,
  stepBullet, stepTether,
} from './physics';
import { makeRng } from './rng';
import { WEAPONS, type WeaponDef } from './weapons';
import {
  IN_FIRE, IN_FIRE2, IN_THRUST, ZONE_NONE, type InputBits,
  type JetState, type SimEvent, type SimState, type WeaponId, type ZoneId,
} from './types';

const T = (ms: number) => Math.round(ms / TICK_MS); // ms -> ticki

export interface PlayerInfo { name: string; w1: WeaponId; w2: WeaponId }

/**
 * Nowa runda: jets dla każdego gracza (sloty bez gracza pomijane —
 * tablica jest RZADKA względem slotów, używaj jetAt()), flagi w bazach.
 */
export function createSim(level: LevelData, players: (PlayerInfo | null)[], seed: number): SimState {
  const jets: JetState[] = [];
  const flags: SimState['flags'] = [];
  players.forEach((p, slot) => {
    if (p == null) return;
    const sp = spawnPoint(level, slot);
    jets.push({
      slot, name: p.name, mode: 'ship',
      x: sp.x, y: sp.y, vx: 0, vy: 0,
      angle: -Math.PI / 2,
      alive: true,
      respawnAt: 0,
      invulnUntil: T(INVULN_MS),
      cooldownUntil: 0, cooldown2Until: 0,
      carrying: -1,
      connected: true,
      lastBits: 0,
      fuel: FUEL_MAX, energy: ENERGY_MAX,
      w1: p.w1, w2: p.w2, rockets: 0,
      homeX: sp.x, homeY: sp.y + 8, // baza pod spawnem
      zone: ZONE_NONE,
      kills: 0, deaths: 0, captures: 0,
      score: 0, lives: START_LIVES,
    });
    flags.push({
      slot, homeX: sp.x, homeY: sp.y, x: sp.x, y: sp.y,
      vx: 0, vy: 0, carrier: -1, returnAt: 0,
    });
  });
  return {
    tick: 0, level, phase: 'play', winner: -1,
    jets, flags, bullets: [], nextBulletId: 1,
    rng: makeRng(seed), startedAtMs: 0,
  };
}

/**
 * Jeden tick symulacji. `inputs[slot]` = bitmaska IN_*; undefined = brak
 * (host powtarza ostatni znany input gościa — decyzja w game/hostLoop.ts).
 */
export function stepSim(sim: SimState, inputs: (InputBits | undefined)[]): SimEvent[] {
  if (sim.phase !== 'play') return [];
  sim.tick++;
  sim.startedAtMs += TICK_MS;
  const ev: SimEvent[] = [];

  // ---- Gracze: zasoby, fizyka, broń ----
  for (const jet of sim.jets) {
    if (!jet.alive) {
      if (jet.lives > 0 && sim.tick >= jet.respawnAt) respawn(sim, jet, ev);
      continue;
    }
    const bits = inputs[jet.slot] ?? 0;
    jet.lastBits = bits;

    // Paliwo: ciąg ssie bak, inaczej powolna regeneracja.
    const fuelMax = jet.mode === 'pilot' ? PILOT_FUEL_MAX : FUEL_MAX;
    if ((bits & IN_THRUST) && jet.fuel > 0) jet.fuel = Math.max(0, jet.fuel - FUEL_THRUST);
    else jet.fuel = Math.min(fuelMax, jet.fuel + FUEL_REGEN);

    // Baza: szybka regeneracja paliwa i energii.
    if (dist2(jet.x, jet.y, jet.homeX, jet.homeY) < BASE_R * BASE_R) {
      jet.fuel = Math.min(fuelMax, jet.fuel + FUEL_BASE_REGEN);
      if (jet.mode === 'ship') {
        jet.energy = Math.min(ENERGY_MAX, jet.energy + ENERGY_BASE_REGEN);
      }
    }

    // Zmiana strefy → event (splash/dźwięk po stronie klienta).
    const zone = zoneAt(sim.level, jet.x, jet.y);
    if (zone !== jet.zone) {
      ev.push({ t: 'zone', slot: jet.slot, zone });
      jet.zone = zone;
    }

    steerJet(jet, bits);
    accelerateJet(sim.level, jet);
    const col = moveJet(sim.level, jet);

    if (col.hit && sim.tick >= jet.invulnUntil) {
      if (jet.mode === 'pilot') {
        if (col.impact > PILOT_CRASH) { kill(sim, jet, -1, ev); continue; }
      } else if (col.impact > CRASH_SAFE) {
        // true = statek rozpadł się → bail-out, pomiń resztę ticka.
        if (damageShip(sim, jet, (col.impact - CRASH_SAFE) * CRASH_DMG_SCALE, -1, ev)) continue;
      }
    }

    // Broń: statek ma wybór z lobby, pilot stały zestaw rifle+homing.
    if (jet.mode === 'ship') {
      if ((bits & IN_FIRE) && sim.tick >= jet.cooldownUntil) {
        fireWeapon(sim, jet, jet.w1, ev);
      }
      if ((bits & IN_FIRE2) && sim.tick >= jet.cooldown2Until) {
        fireWeapon(sim, jet, jet.w2, ev, true);
      }
    } else {
      if ((bits & IN_FIRE) && sim.tick >= jet.cooldownUntil) {
        fireWeapon(sim, jet, 'rifle', ev);
      }
      if ((bits & IN_FIRE2) && sim.tick >= jet.cooldown2Until && jet.rockets > 0) {
        jet.rockets--;
        fireWeapon(sim, jet, 'homing', ev, true);
      }
    }
  }

  // ---- Pociski ----
  for (let i = sim.bullets.length - 1; i >= 0; i--) {
    const b = sim.bullets[i];
    const def = WEAPONS[b.kind];

    // Mina: czuwa na wroga w pobliżu, potem eksploduje.
    if (b.kind === 'mine') {
      if (sim.tick >= b.armedAt) {
        const target = nearestEnemy(sim, b.owner, b.x, b.y, 14);
        if (target) { explodeAt(sim, b.x, b.y, def.boomR, def.carve, ev); sim.bullets.splice(i, 1); }
        else if (sim.tick >= b.dieAt) sim.bullets.splice(i, 1);
        continue;
      }
      if (sim.tick >= b.dieAt) { sim.bullets.splice(i, 1); continue; }
      continue;
    }

    if (def.homing > 0) {
      const t = nearestEnemy(sim, b.owner, b.x, b.y, 200);
      if (t) steerHoming(b, t.x, t.y, def.homing);
    }
    if (sim.tick >= b.dieAt) { sim.bullets.splice(i, 1); continue; }
    if (!stepBullet(sim.level, b, def.gravity)) {
      // Trafienie w teren: eksplozja AoE albo czyste wydrążenie (karabin ryje).
      if (def.boomR > 0) {
        explodeAt(sim, b.x, b.y, def.boomR, def.carve, ev);
      } else if (def.carve > 0) {
        const cells = carveCircle(sim.level, b.x, b.y, def.carve);
        if (cells.length) ev.push({ t: 'terrain', cells });
      }
      sim.bullets.splice(i, 1);
      continue;
    }
    for (const jet of sim.jets) {
      if (!jet.alive || jet.slot === b.owner || sim.tick < jet.invulnUntil) continue;
      if (!bulletHitsJet(b, jet)) continue;
      sim.bullets.splice(i, 1);
      if (jet.mode === 'pilot') {
        kill(sim, jet, b.owner, ev);          // pilot: jedno trafienie = zgon
      } else {
        damageShip(sim, jet, def.damage, b.owner, ev);
      }
      if (def.boomR > 0) explodeAt(sim, b.x, b.y, def.boomR, def.carve, ev);
      break;
    }
  }

  // ---- Flagi ----
  for (const flag of sim.flags) {
    if (flag.carrier >= 0) {
      const c = jetAt(sim, flag.carrier);
      if (!c || !c.alive) { flag.carrier = -1; continue; }
      stepTether(sim.level, flag, c);
      continue;
    }
    if (flag.returnAt && sim.tick >= flag.returnAt) {
      flag.x = flag.homeX; flag.y = flag.homeY; flag.returnAt = 0;
      ev.push({ t: 'flagHome', flag: flag.slot });
      continue;
    }
    for (const jet of sim.jets) {
      if (!jet.alive) continue;
      if (dist2(jet.x, jet.y, flag.x, flag.y) > (JET_R + 6) ** 2) continue;
      if (flag.slot !== jet.slot) {
        flag.carrier = jet.slot;
        jet.carrying = flag.slot;
        ev.push({ t: 'flagTake', slot: jet.slot, flag: flag.slot });
      } else if (flag.x !== flag.homeX || flag.y !== flag.homeY) {
        flag.x = flag.homeX; flag.y = flag.homeY;
        flag.vx = flag.vy = 0; flag.returnAt = 0;
        ev.push({ t: 'flagHome', flag: flag.slot });
      }
      break;
    }
  }

  // ---- Doniesienie flagi do własnej bazy (statek lub pilot) ----
  for (const jet of sim.jets) {
    if (!jet.alive || jet.carrying < 0) continue;
    if (dist2(jet.x, jet.y, jet.homeX, jet.homeY) < BASE_R * BASE_R) {
      const flag = flagOf(sim, jet.carrying);
      if (!flag) { jet.carrying = -1; continue; }
      flag.carrier = -1; flag.x = flag.homeX; flag.y = flag.homeY;
      flag.vx = flag.vy = 0;
      jet.captures++;
      ev.push({ t: 'flagScore', slot: jet.slot, flag: jet.carrying });
      addScore(sim, jet, SCORE_FLAG, ev);
      jet.carrying = -1;
    }
  }

  checkOver(sim, ev);
  return ev;
}

// ---- Wnętrze ----

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

/** Jet o danym slocie — tablica jets jest rzadka względem slotów. */
export function jetAt(sim: SimState, slot: number): JetState | undefined {
  return sim.jets.find(j => j.slot === slot);
}

/** Flaga należąca do slotu (właściciel). */
export function flagOf(sim: SimState, slot: number) {
  return sim.flags.find(f => f.slot === slot);
}

/** Najbliższy żywy wróg w promieniu r (dla min i homingu). */
function nearestEnemy(sim: SimState, owner: number, x: number, y: number, r: number): JetState | undefined {
  let best: JetState | undefined;
  let bd = r * r;
  for (const j of sim.jets) {
    if (!j.alive || j.slot === owner) continue;
    const d = dist2(j.x, j.y, x, y);
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}

/** Strzał bronią — spawn pocisków wg definicji lub hitscan dla lasera. */
function fireWeapon(sim: SimState, jet: JetState, id: WeaponId, ev: SimEvent[], secondary = false): void {
  const def = WEAPONS[id];
  if (secondary) jet.cooldown2Until = sim.tick + T(def.cooldownMs);
  else jet.cooldownUntil = sim.tick + T(def.cooldownMs);

  if (id === 'laser') { fireLaser(sim, jet, def, ev); return; }
  if (id === 'mine') {
    if (sim.bullets.length >= BULLET_MAX) return;
    sim.bullets.push({
      id: sim.nextBulletId++, owner: jet.slot, kind: 'mine',
      x: jet.x, y: jet.y + JET_R + 2, vx: 0, vy: 0,
      dieAt: sim.tick + T(def.lifeMs), armedAt: sim.tick + 30,
    });
    ev.push({ t: 'fire', slot: jet.slot, kind: id, x: jet.x, y: jet.y });
    return;
  }

  const r = jet.mode === 'pilot' ? PILOT_R : JET_R;
  for (let p = 0; p < def.pellets; p++) {
    if (sim.bullets.length >= BULLET_MAX) return;
    const a = jet.angle + (def.spread ? (p / Math.max(1, def.pellets - 1) - 0.5) * def.spread * 2 : 0);
    const cos = Math.cos(a), sin = Math.sin(a);
    sim.bullets.push({
      id: sim.nextBulletId++, owner: jet.slot, kind: id,
      x: jet.x + cos * (r + 2), y: jet.y + sin * (r + 2),
      vx: cos * def.speed + jet.vx * 0.4, vy: sin * def.speed + jet.vy * 0.4,
      dieAt: sim.tick + T(def.lifeMs), armedAt: 0,
    });
  }
  ev.push({ t: 'fire', slot: jet.slot, kind: id, x: jet.x, y: jet.y });
}

/** Laser = hitscan: promień po tilemapie aż do skały / zasięgu / trafienia. */
function fireLaser(sim: SimState, jet: JetState, def: WeaponDef, ev: SimEvent[]): void {
  const cos = Math.cos(jet.angle), sin = Math.sin(jet.angle);
  let x = jet.x, y = jet.y;
  let hitX = x + cos * 220, hitY = y + sin * 220;
  outer:
  for (let d = 0; d < 220; d += 2) {
    x = jet.x + cos * d;
    y = jet.y + sin * d;
    if (isSolid(sim.level, x, y)) { hitX = x; hitY = y; break; }
    for (const j of sim.jets) {
      if (!j.alive || j.slot === jet.slot || sim.tick < j.invulnUntil) continue;
      const rr = j.mode === 'pilot' ? PILOT_R : JET_R;
      if (dist2(j.x, j.y, x, y) < (rr + 2) ** 2) {
        hitX = j.x; hitY = j.y;
        if (j.mode === 'pilot') kill(sim, j, jet.slot, ev);
        else damageShip(sim, j, def.damage, jet.slot, ev);
        break outer;
      }
    }
  }
  ev.push({ t: 'laser', slot: jet.slot, x1: jet.x, y1: jet.y, x2: hitX, y2: hitY });
}

/** Eksplozja AoE: carve terenu + obrażenia spadające z dystansem. */
function explodeAt(sim: SimState, x: number, y: number, r: number, carve: number, ev: SimEvent[]): void {
  ev.push({ t: 'boom', x, y, r });
  const cells = carve > 0 ? carveCircle(sim.level, x, y, carve) : [];
  if (cells.length) ev.push({ t: 'terrain', cells });
  for (const jet of sim.jets) {
    if (!jet.alive || sim.tick < jet.invulnUntil) continue;
    const d = Math.sqrt(dist2(jet.x, jet.y, x, y));
    if (d >= r) continue;
    if (jet.mode === 'pilot') { kill(sim, jet, -1, ev); continue; }
    damageShip(sim, jet, BOOM_DMG * (1 - d / r), -1, ev);
  }
}

/** Obrażenia na statku; energy ≤ 0 → eksplozja + bail-out. Zwraca true gdy pilot wyskoczył. */
function damageShip(sim: SimState, jet: JetState, dmg: number, by: number, ev: SimEvent[]): boolean {
  jet.energy -= dmg;
  if (jet.energy > 0) return false;
  jet.energy = 0;
  bailOut(sim, jet, by, ev);
  return true;
}

/** Statek zniszczony → pilot wyskakuje na jetpacku (z flagą, jeśli niósł). */
function bailOut(sim: SimState, jet: JetState, by: number, ev: SimEvent[]): void {
  ev.push({ t: 'boom', x: jet.x, y: jet.y, r: 20 });
  const cells = carveCircle(sim.level, jet.x, jet.y, 14);
  if (cells.length) ev.push({ t: 'terrain', cells });
  if (by >= 0) {
    const killer = jetAt(sim, by);
    if (killer) { killer.kills++; addScore(sim, killer, SCORE_KILL, ev); }
  }
  jet.mode = 'pilot';
  // Pilot leci pionowo — kierunek (lewo/prawo) przejęty ze statku.
  jet.angle = Math.cos(jet.angle) >= 0 ? 0 : Math.PI;
  jet.fuel = PILOT_FUEL_MAX;
  jet.rockets = PILOT_ROCKETS;
  jet.energy = 0;
  jet.vx *= 0.4; jet.vy *= 0.4;
  jet.invulnUntil = sim.tick + T(900);
  ev.push({ t: 'bailout', slot: jet.slot, x: jet.x, y: jet.y });
}

/** Śmierć pilota (jedyna "prawdziwa" śmierć): -1 życie, flaga spada. */
function kill(sim: SimState, jet: JetState, by: number, ev: SimEvent[]): void {
  jet.alive = false;
  jet.deaths++;
  jet.lives--;
  jet.vx = jet.vy = 0;
  ev.push({ t: 'explode', slot: jet.slot, x: jet.x, y: jet.y });
  if (jet.carrying >= 0) {
    const flag = flagOf(sim, jet.carrying);
    if (flag) {
      flag.carrier = -1;
      flag.x = jet.x; flag.y = jet.y;
      flag.vx = flag.vy = 0;
      flag.returnAt = sim.tick + T(FLAG_RETURN_MS);
      ev.push({ t: 'flagDrop', slot: jet.slot, flag: flag.slot, x: flag.x, y: flag.y });
    }
    jet.carrying = -1;
  }
  if (by >= 0) {
    const killer = jetAt(sim, by);
    if (killer) { killer.kills++; addScore(sim, killer, SCORE_KILL, ev); }
  }
  jet.respawnAt = sim.tick + T(RESPAWN_MS);
}

/** Respawn = nowy statek w bazie (pełne paliwo i energia). */
function respawn(sim: SimState, jet: JetState, ev: SimEvent[]): void {
  const p = spawnPoint(sim.level, jet.slot);
  jet.x = p.x; jet.y = p.y;
  jet.vx = jet.vy = 0;
  jet.angle = -Math.PI / 2;
  jet.mode = 'ship';
  jet.fuel = FUEL_MAX;
  jet.energy = ENERGY_MAX;
  jet.alive = true;
  jet.invulnUntil = sim.tick + T(INVULN_MS);
  ev.push({ t: 'respawn', slot: jet.slot });
}

function addScore(sim: SimState, jet: JetState, pts: number, ev: SimEvent[]): void {
  jet.score += pts;
  ev.push({ t: 'score', slot: jet.slot, pts });
}

/** Koniec rundy: zostało ≤1 graczy z pulą żyć. */
function checkOver(sim: SimState, ev: SimEvent[]): void {
  const alive = sim.jets.filter(j => j.lives > 0);
  if (alive.length > 1) return;
  sim.phase = 'over';
  const winner = alive[0]
    ?? sim.jets.reduce((a, b) => (b.score > a.score ? b : a));
  sim.winner = winner.slot;
  ev.push({ t: 'over', winner: winner.slot });
}

export { isSolid };
