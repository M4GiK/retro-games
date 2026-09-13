/**
 * Generator poziomów trybu przygody (platformówka à la Mario).
 *
 * Poziom to ciąg segmentów ziemi rozdzielonych przepaściami, z jedno-
 * kierunkowymi platformami, rozsianymi jajkami i patrolującymi lisami.
 * Na końcu stoi kurnik z koszyczkiem złotych jajek (meta) — dotarcie
 * kolejny, trudniejszy poziom.
 *
 * Generator jest data-driven: trudność poziomu `n` steruje długością,
 * częstością i szerokością przepaśći, pulą typów wrogów i liczbą
 * zagrożeń — wszystkie progi trzymane są w jednym miejscu niżej.
 * Właściwe tworzenie ciał delegowane jest do EntityFactory.
 */
import { GROUND_H, H, LEVEL_BASE_LEN, LEVEL_LEN_STEP, LEVEL_MAX_LEN, LEVEL_SAFE_ZONE, NIGHTMARE_LEN, BOSS_LEVEL_EVERY } from '../core/config';
import { levelState } from '../core/state';
import type { EntityFactory } from './factory';
import type { EnemyType } from '../core/types';

/** Pula typów wrogów odblokowywana wraz z numerem poziomu. */
function enemyPool(n: number): EnemyType[] {
  const pool: EnemyType[] = ['walker', 'walker'];
  if (n >= 2) pool.push('jumper');
  if (n >= 3) pool.push('dasher', 'walker');
  if (n >= 4) pool.push('tank');
  if (n >= 6) pool.push('jumper', 'dasher');
  return pool;
}

/**
 * Buduje poziom numer n (1-based): czyści stare encje, ustawia
 * geometrię świata w levelState i rozstawia zawartość przez fabrykę.
 */
export function buildLevel(n: number, f: EntityFactory): void {
  const len = Math.min(LEVEL_BASE_LEN + (n - 1) * LEVEL_LEN_STEP, LEVEL_MAX_LEN);
  const SAFE = LEVEL_SAFE_ZONE;
  const groundTop = H() - GROUND_H;
  const pool = enemyPool(n);
  const golden = () => Math.random() < 0.12;

  levelState.len = len;
  levelState.goalX = len - 70;
  levelState.bossArena = false;
  levelState.bossTier = 0;

  // Strefa startowa — płaska, bez niespodzianek.
  f.spawnGroundSegment(0, SAFE);
  let x = SAFE;

  while (x < len - SAFE - 60) {
    const segW = Math.min(110 + Math.random() * 140, len - SAFE - x);
    const segEnd = x + segW;
    f.spawnGroundSegment(x, segEnd);

    // Lis patroulujący segment — im szerszy, tym pewniejszy obecności.
    if (segW > 110 && Math.random() < Math.min(0.25 + n * 0.13, 0.85)) {
      const type = pool[Math.floor(Math.random() * pool.length)];
      f.spawnEnemy(type, {
        x: x + segW / 2,
        dirX: Math.random() < 0.5 ? -1 : 1,
        patrolMin: x + 20,
        patrolMax: segEnd - 20,
      });
    }

    // Platforma nad segmentem z rzędem jajek; czasem bonus nad nią.
    if (Math.random() < 0.4 && segW > 90) {
      const px = x + 26 + Math.random() * (segW - 52);
      const py = groundTop - 46 - Math.random() * 34;
      f.spawnPlatform(px, py, 46 + Math.random() * 26);
      const cnt = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < cnt; i++) {
        f.spawnStaticEgg(px - (cnt - 1) * 11 + i * 22, py - 16, golden());
      }
      if (Math.random() < 0.2) f.spawnStaticPowerup(px, py - 40, bonusType());
    }

    // Jajka przy ziemi.
    if (Math.random() < 0.5 && segW > 70) {
      const cnt = 1 + Math.floor(Math.random() * 3);
      const ex = x + 22 + Math.random() * (segW - 44);
      for (let i = 0; i < cnt; i++) {
        f.spawnStaticEgg(ex + i * 20, groundTop - 28, golden());
      }
    }

    // Przepaść za segmentem — rośnie szansa i szerokość z poziomem.
    const maxPit = len - SAFE - segEnd - 50;
    const pitChance = Math.min(0.28 + n * 0.09, 0.72);
    if (maxPit > 38 && Math.random() < pitChance) {
      // Min. 34 px — kurka ma średnicę 28 i musi móc wpaść do dziury.
      const pitW = Math.min(34 + Math.random() * (14 + n * 8), maxPit);
      // Łuk jajek nad dziurą — smycz prowadząca skok.
      const cnt = Math.max(2, Math.round(pitW / 22));
      for (let i = 0; i < cnt; i++) {
        const t = i / (cnt - 1);
        f.spawnStaticEgg(segEnd + t * pitW, groundTop - 24 - Math.sin(t * Math.PI) * 24, golden());
      }
      // Nad szerszymi dziurami platforma-poduszka w połowie.
      if (pitW > 52 && Math.random() < 0.6) {
        f.spawnPlatform(segEnd + pitW / 2, groundTop - 36 - Math.random() * 20, Math.min(48, pitW - 18));
      }
      x = segEnd + pitW;
    } else {
      x = segEnd;
    }
  }

  // Strefa mety — płaska, pod nią kurnik. Pętla może skończyć się
  // przed len-SAFE — ostatni segment zamyka ewentualną lukę.
  f.spawnGroundSegment(Math.min(x, len - SAFE), len);

  // Od poziomu 3 strażnik patroluje okolice mety.
  if (n >= 3) {
    f.spawnEnemy(pool[Math.floor(Math.random() * pool.length)], {
      x: len - 160,
      dirX: -1,
      patrolMin: len - SAFE + 40,
      patrolMax: len - 100,
    });
  }

  // Bonus ratunkowy w połowie poziomu.
  f.spawnStaticPowerup(len * (0.4 + Math.random() * 0.25), groundTop - 60, bonusType());
}

/**
 * Poziom-arena bossa (co BOSS_LEVEL_EVERY poziom): zamiast platformówki
 * płaska arena jak w koszmarze (ciągła ziemia przez setAdventure(false))
 * z jednym wilkiem-bossem. Zrzuty głazów/pająków i jajka obsługuje
 * Game.updateSpawning; poziom kończy zabójstwo wilka, nie meta.
 */
export function buildBossArena(n: number, f: EntityFactory): void {
  const tier = Math.max(1, Math.floor(n / BOSS_LEVEL_EVERY));
  levelState.len = NIGHTMARE_LEN;
  levelState.goalX = Infinity;
  levelState.bossArena = true;
  levelState.bossTier = tier;

  // Wilk goni gracza po całej arenie — patrole trzymają go w jej obrębie.
  f.spawnEnemy('boss', {
    x: NIGHTMARE_LEN * 0.7,
    dirX: -1,
    patrolMin: 60,
    patrolMax: NIGHTMARE_LEN - 60,
    tier,
  });
}

/** Bonusy poziomowe — bez magnesu (jajka na poziomie są statyczne). */
function bonusType(): 'life' | 'shield' | 'slow' | 'double' {
  const pool = ['life', 'shield', 'slow', 'double'] as const;
  return pool[Math.floor(Math.random() * pool.length)];
}
