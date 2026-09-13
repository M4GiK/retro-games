/**
 * Fizyka — serce feel'u gry (jak w oryginale: inercja + grawitacja +
 * lina flagi). Stan to gołe liczby w *State, więc snapshot sieciowy to
 * zwykły JSON, a predykcja gościa to ponowne wywołanie tych samych funkcji.
 *
 * Konwencja kąta: 0 = w prawo, rośnie zgodnie ze wskazówkami zegara
 * (ekranowy układ y-w-dół), -PI/2 = w górę.
 */

import {
  DRAG, FLAG_G, GRAVITY, JET_MAX_SPEED, JET_R,
  PILOT_R, PILOT_SIDE_THRUST, PILOT_THRUST, TETHER_DAMP, TETHER_LEN,
  TETHER_SPRING, THRUST, TILE, TURN_RATE,
  ZONE_GLUE_DRAG, ZONE_SNOW_DRAG, ZONE_WATER_BUOY, ZONE_WATER_BULLET_DRAG,
  ZONE_WATER_DRAG,
} from './config';
import { isSolid, zoneAt, type LevelData } from './level';
import {
  IN_LEFT, IN_RIGHT, IN_THRUST, ZONE_GLUE, ZONE_SNOW, ZONE_WATER,
  type BulletState, type FlagState, type JetState,
} from './types';

/** Wynik kolizji koła z terenem w jednym ticku. */
export interface Collision {
  hit: boolean;       // dotknął solidnego terenu
  impact: number;     // prędkość tuż przed uderzeniem (px/tick)
}

/**
 * Obrót i ciąg — modyfikuje angle/vx/vy, bez integracji.
 * Statek: rotacja + ciąg wzdłuż nosa. Pilot: głowa zawsze w górę —
 * ◀▶ to przyspieszenie bokiem (i kierunek celowania: angle 0/π),
 * ▲ to jetpack pionowy.
 */
export function steerJet(jet: JetState, bits: number): void {
  if (jet.mode === 'pilot') {
    if (bits & IN_LEFT) { jet.vx -= PILOT_SIDE_THRUST; jet.angle = Math.PI; }
    if (bits & IN_RIGHT) { jet.vx += PILOT_SIDE_THRUST; jet.angle = 0; }
    if ((bits & IN_THRUST) && jet.fuel > 0) jet.vy -= PILOT_THRUST;
    return;
  }
  if (bits & IN_LEFT) jet.angle -= TURN_RATE;
  if (bits & IN_RIGHT) jet.angle += TURN_RATE;
  if ((bits & IN_THRUST) && jet.fuel > 0) {
    jet.vx += Math.cos(jet.angle) * THRUST;
    jet.vy += Math.sin(jet.angle) * THRUST;
  }
}

/** Grawitacja + siły strefy + opór + pułap prędkości — bez ruchu. */
export function accelerateJet(level: LevelData, jet: JetState): void {
  jet.vy += GRAVITY;
  const zone = zoneAt(level, jet.x, jet.y);
  let drag = DRAG;
  if (zone === ZONE_WATER) {
    drag = ZONE_WATER_DRAG;
    jet.vy += ZONE_WATER_BUOY;          // wyporność
  } else if (zone === ZONE_SNOW) {
    drag = ZONE_SNOW_DRAG;
  } else if (zone === ZONE_GLUE) {
    drag = ZONE_GLUE_DRAG;
  }
  jet.vx *= drag;
  jet.vy *= drag;
  const v = Math.hypot(jet.vx, jet.vy);
  if (v > JET_MAX_SPEED) {
    jet.vx *= JET_MAX_SPEED / v;
    jet.vy *= JET_MAX_SPEED / v;
  }
}

/**
 * Integracja + kolizja koła `r` z tilemapą: ruch, potem wypchnięcie
 * z każdego solidnego kafelka wzdłuż normalnej (ślizg, nie odbicie).
 */
export function moveCircle(
  level: LevelData, p: { x: number; y: number; vx: number; vy: number }, r: number,
): Collision {
  const impact = Math.hypot(p.vx, p.vy);
  p.x += p.vx;
  p.y += p.vy;

  let hit = false;
  const t0x = Math.floor((p.x - r) / TILE), t1x = Math.floor((p.x + r) / TILE);
  const t0y = Math.floor((p.y - r) / TILE), t1y = Math.floor((p.y + r) / TILE);
  for (let ty = t0y; ty <= t1y; ty++) {
    for (let tx = t0x; tx <= t1x; tx++) {
      if (!isSolid(level, tx * TILE + TILE / 2, ty * TILE + TILE / 2)) continue;
      // Najbliższy punkt kafelka do środka koła.
      const cx = Math.max(tx * TILE, Math.min(p.x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(p.y, ty * TILE + TILE));
      const dx = p.x - cx, dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      const d = Math.sqrt(d2) || 0.001;
      const push = r - d;
      const nx = dx / d, ny = dy / d;
      p.x += nx * push;
      p.y += ny * push;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        p.vx -= vn * nx;
        p.vy -= vn * ny;
      }
    }
  }
  return { hit, impact };
}

/** Integracja jeta/pilota (promień zależy od trybu). */
export function moveJet(level: LevelData, jet: JetState): Collision {
  return moveCircle(level, jet, jet.mode === 'pilot' ? PILOT_R : JET_R);
}

/**
 * Lina flagi — flaga na sprężynie ciągnięta za nosicielem (jak orb
 * w Thrust): własna grawitacja, bezwładność, kolizja z terenem.
 * Flaga taranuje tunele za statkiem — to jest ten "feel".
 */
export function stepTether(level: LevelData, flag: FlagState, jet: JetState): void {
  const dx = jet.x - flag.x, dy = jet.y - flag.y;
  const d = Math.hypot(dx, dy) || 0.001;
  if (d > TETHER_LEN) {
    const pull = (d - TETHER_LEN) * TETHER_SPRING;
    flag.vx += (dx / d) * pull;
    flag.vy += (dy / d) * pull;
  }
  flag.vy += FLAG_G;
  flag.vx *= TETHER_DAMP;
  flag.vy *= TETHER_DAMP;
  moveCircle(level, flag, 3);
}

/**
 * Krok pocisku: grawitacja + strefy + kolizja z terenem. true = leci.
 * Pocisk to punkt — przy TILE=4 i speed 5-6 px/tick tunelowałby przez
 * kafelki, więc ruch dzielony jest na podkroki ≤ TILE/2.
 */
export function stepBullet(level: LevelData, b: BulletState, gravity: number): boolean {
  b.vy += gravity;
  if (zoneAt(level, b.x, b.y) === ZONE_WATER) {
    b.vx *= ZONE_WATER_BULLET_DRAG;
    b.vy *= ZONE_WATER_BULLET_DRAG;
  }
  const dist = Math.hypot(b.vx, b.vy);
  const steps = Math.max(1, Math.ceil(dist / (TILE / 2)));
  for (let s = 0; s < steps; s++) {
    b.x += b.vx / steps;
    b.y += b.vy / steps;
    if (isSolid(level, b.x, b.y)) return false;
  }
  return true;
}

/** Skręt rakiety samonaprowadzającej ku celowi (rad/tick). */
export function steerHoming(b: BulletState, tx: number, ty: number, turn: number): void {
  const cur = Math.atan2(b.vy, b.vx);
  const want = Math.atan2(ty - b.y, tx - b.x);
  let diff = want - cur;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const a = cur + Math.max(-turn, Math.min(turn, diff));
  const v = Math.hypot(b.vx, b.vy);
  b.vx = Math.cos(a) * v;
  b.vy = Math.sin(a) * v;
}

/** Czy punkt (pocisk) trafia encję (koło r). */
export function bulletHitsJet(b: BulletState, jet: JetState): boolean {
  const r = jet.mode === 'pilot' ? PILOT_R : JET_R;
  const dx = b.x - jet.x, dy = b.y - jet.y;
  return dx * dx + dy * dy < r * r;
}
