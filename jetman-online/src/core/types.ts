/**
 * Kontrakt danych symulacji — współdzielony przez hosta (autorytet),
 * gościa (predykcja własnego jeta + render) i ewentualny przyszły serwer.
 *
 * Zasada: core/ to CZYSTY TypeScript — zero DOM, zero WebSocket,
 * zero Math.random poza rng.ts. Dzięki temu sim działa identycznie
 * w przeglądarce, w teście node'owym i (gdyby kiedyś powstał) na serwerze.
 */

import type { LevelData } from './level';
import type { Rng } from './rng';

// ---- Input: bitmaska, tanio serializowalna do sieci ----

export const IN_LEFT = 1;
export const IN_RIGHT = 2;
export const IN_THRUST = 4;
export const IN_FIRE = 8;
export const IN_FIRE2 = 16;
/** Skompresowane wejście gracza — OR flag IN_*. */
export type InputBits = number;

/** Faza rundy (lobby żyje poza simem — sim startuje już w 'play'). */
export type Phase = 'play' | 'over';

/** Postać gracza: statek albo pilot na jetpacku po bail-oucie. */
export type JetMode = 'ship' | 'pilot';

/** Identyfikatory broni — definicje w core/weapons.ts. */
export type WeaponId =
  | 'minigun' | 'rocket' | 'homing' | 'shotgun' | 'laser' | 'mine' | 'rifle';

/** Strefy terenu (fizyka + wygląd) — indeksy do level.zones. */
export const ZONE_NONE = 0;
export const ZONE_WATER = 1;
export const ZONE_SNOW = 2;
export const ZONE_GLUE = 3;
export type ZoneId = typeof ZONE_NONE | typeof ZONE_WATER
  | typeof ZONE_SNOW | typeof ZONE_GLUE;

/** Stan jednego gracza. Indeks w `jets` NIE jest slotem — używaj jetAt(). */
export interface JetState {
  slot: number;
  name: string;        // nick do HUD (ustala host przy starcie)
  mode: JetMode;       // 'ship' | 'pilot' (po bail-oucie)
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;       // rad; 0 = w prawo, dodatni = zgodnie ze wskazówkami (y w dół)
  alive: boolean;
  respawnAt: number;   // tick respawnu gdy !alive
  invulnUntil: number; // tick końca nietykalności po respawnie
  cooldownUntil: number;  // tick, od którego wolno strzelać (primary)
  cooldown2Until: number; // tick dla broni secondary
  carrying: number;    // slot właściciela niesionej flagi, -1 = brak
  connected: boolean;  // peer żyje (host: zawsze true dla siebie)
  lastBits: number;    // ostatni input — do renderu (płomień ciągu)
  fuel: number;        // bak: statek FUEL_MAX, pilot PILOT_FUEL_MAX
  energy: number;      // HP statku (pilot: nieważne — jedno trafienie zabija)
  w1: WeaponId;        // broń primary (wybór w lobby)
  w2: WeaponId;        // broń secondary
  rockets: number;     // pilot: zapas rakiet samonaprowadzających
  homeX: number;       // własna baza (regen, doniesienie flagi)
  homeY: number;
  zone: ZoneId;        // strefa, w której stoi/pływa — do eventów/sfx
  kills: number;
  deaths: number;
  captures: number;    // zdobyte flagi
  score: number;
  lives: number;       // pula żyć — 0 = eliminacja z rundy
}

/** Pocisk w locie (kulki, rakiety, miny). */
export interface BulletState {
  id: number;      // rosnący — stabilny klucz do interpolacji/efektów
  owner: number;   // slot strzelca
  kind: WeaponId;  // wygląd/zachowanie pochodzi z WEAPONS[kind]
  x: number;
  y: number;
  vx: number;
  vy: number;
  dieAt: number;   // tick wygaśnięcia
  armedAt: number; // mina: uzbraja się od tego ticka (0 = od razu)
}

/** Flaga: stoi w bazie, leży upuszczona albo wisi na linie za nosicielem. */
export interface FlagState {
  slot: number;      // właściciel flagi = indeks
  homeX: number;     // pozycja w bazie
  homeY: number;
  x: number;         // pozycja flagi (na linie — wynik fizyki tethera)
  y: number;
  vx: number;        // prędkość flagi na linie
  vy: number;
  carrier: number;   // slot nosiciela, -1 = leży/stoi
  returnAt: number;  // tick auto-powrotu do bazy (gdy upuszczona), 0 = n/d
}

/** Pełny stan symulacji — to host symuluje i serializuje w snapshotach. */
export interface SimState {
  tick: number;
  level: LevelData;
  phase: Phase;
  winner: number;          // slot zwycięzcy, -1 gdy phase='play'
  jets: JetState[];
  bullets: BulletState[];
  flags: FlagState[];
  nextBulletId: number;
  rng: Rng;                // stan liczbowy generatora (serializowalny)
  startedAtMs: number;     // sim-time rundy (ms od startu) do timerów
}

/**
 * Zdarzenia simu zwracane przez stepSim — host/klient mapuje je na
 * dźwięki i efekty (audio/sfx.ts, render/effects.ts). Kolejność = kolejność
 * zajścia w ticku.
 */
export type SimEvent =
  | { t: 'fire'; slot: number; kind: WeaponId; x: number; y: number }
  | { t: 'laser'; slot: number; x1: number; y1: number; x2: number; y2: number }
  | { t: 'boom'; x: number; y: number; r: number }        // eksplozja AoE
  | { t: 'explode'; slot: number; x: number; y: number }  // śmierć (statek/pilot)
  | { t: 'bailout'; slot: number; x: number; y: number }  // statek → pilot
  | { t: 'respawn'; slot: number }
  | { t: 'terrain'; cells: number[] }                      // wydrążone kafelki
  | { t: 'zone'; slot: number; zone: ZoneId }              // wejście w strefę
  | { t: 'flagTake'; slot: number; flag: number }
  | { t: 'flagDrop'; slot: number; flag: number; x: number; y: number }
  | { t: 'flagScore'; slot: number; flag: number }
  | { t: 'flagHome'; flag: number }
  | { t: 'score'; slot: number; pts: number }
  | { t: 'over'; winner: number };
