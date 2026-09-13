/**
 * Bronie — tabela danych (kontrakt ticketu A2).
 *
 * Wzorzec: bronie jako dane, nie kod — nowa broń to wpis w WEAPONS.
 * Zachowania specjalne w sim.ts: laser = hitscan (speed 0, lifeMs 0),
 * mine = stacjonarna + boomR, homing = skręt do celu rad/tick.
 * 'rifle' i 'homing' to uzbrojenie pilota po bail-oucie (nie do wyboru
 * w lobby — pilot dostaje je automatycznie).
 */

import type { WeaponId } from './types';

export interface WeaponDef {
  id: WeaponId;
  name: string;           // po polsku — do UI lobby
  cooldownMs: number;
  speed: number;          // px/tick początkowa prędkość pocisku
  lifeMs: number;         // życie pocisku
  gravity: number;        // grawitacja pocisku (/tick²)
  damage: number;         // obrażenia energii statku (pilot: 1 trafienie)
  pellets: number;        // ile pocisków na strzał (shotgun)
  spread: number;         // rozrzut w radianach (±)
  homing: number;         // skręt do celu rad/tick (0 = prosty tor)
  boomR: number;          // promień eksplozji AoE px (0 = brak)
  carve: number;          // promień wydrążenia terenu przy eksplozji px
  pilotOnly: boolean;     // broń pilota — niewybieralna w lobby
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  minigun: {
    id: 'minigun', name: 'MINIGUN',
    cooldownMs: 120, speed: 6, lifeMs: 800, gravity: 0.015,
    damage: 6, pellets: 1, spread: 0.03, homing: 0, boomR: 0, carve: 4,
    pilotOnly: false,
  },
  rocket: {
    id: 'rocket', name: 'RAKIETA',
    cooldownMs: 700, speed: 3.2, lifeMs: 2400, gravity: 0.01,
    damage: 40, pellets: 1, spread: 0, homing: 0, boomR: 16, carve: 14,
    pilotOnly: false,
  },
  shotgun: {
    id: 'shotgun', name: 'SHOTGUN',
    cooldownMs: 800, speed: 5, lifeMs: 380, gravity: 0.01,
    damage: 7, pellets: 5, spread: 0.32, homing: 0, boomR: 0, carve: 3,
    pilotOnly: false,
  },
  laser: {
    id: 'laser', name: 'LASER',
    cooldownMs: 500, speed: 0, lifeMs: 0, gravity: 0,
    damage: 22, pellets: 1, spread: 0, homing: 0, boomR: 0, carve: 0,
    pilotOnly: false,
  },
  mine: {
    id: 'mine', name: 'MINA',
    cooldownMs: 900, speed: 0, lifeMs: 20_000, gravity: 0,
    damage: 60, pellets: 1, spread: 0, homing: 0, boomR: 18, carve: 16,
    pilotOnly: false,
  },
  // --- uzbrojenie pilota (po bail-oucie, nie do wyboru w lobby) ---
  rifle: {
    id: 'rifle', name: 'KARABINEK',
    cooldownMs: 260, speed: 4.5, lifeMs: 700, gravity: 0.012,
    damage: 8, pellets: 1, spread: 0.02, homing: 0, boomR: 0, carve: 4,
    pilotOnly: true,
  },
  homing: {
    id: 'homing', name: 'RAKIETA SAMONAPR.',
    cooldownMs: 500, speed: 2.6, lifeMs: 2000, gravity: 0.008,
    damage: 26, pellets: 1, spread: 0, homing: 0.055, boomR: 10, carve: 8,
    pilotOnly: true,
  },
};

/** Bronie do wyboru w lobby (primary i secondary). */
export const LOBBY_WEAPONS: WeaponId[] =
  (Object.keys(WEAPONS) as WeaponId[]).filter(w => !WEAPONS[w].pilotOnly);
