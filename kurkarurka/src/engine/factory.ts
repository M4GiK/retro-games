/**
 * Fabryka encji — jedyny punkt tworzenia ciał gry.
 *
 * Wzorce:
 *  - Fabryka (Factory): cała wiedza o kształtach, labelach i parametrach
 *    fizycznych encji jest tu — reszta gry woła tylko spawnX().
 *  - Definicje data-driven: statystyki wrogów i lista typów power-upów
 *    to tabele danych (ENEMY_SETTINGS / POWERUP_TYPES), a nie logika —
 *    nowy typ wroga to dopisek w tabeli, nie zmiana kodu.
 */
import * as Matter from 'matter-js';
import { GROUND_H, W, H } from '../core/config';
import { gameState, eggs, enemies, fallingObstacles, powerups, particles, popups } from '../core/state';
import { physics } from './physics';
import type { EggData, EnemyData, EnemyType, FallingData, PowerupData, PowerupType } from '../core/types';

const { Bodies, Composite, Body } = Matter;

/** Pula losowania typów wrogów — 'walker' podwójnie = częstszy.
 *  spawnEnemy bierze tylko pierwsze 2+difficulty wpisów, więc trudniejsze
 *  typy dołączają do rotacji wraz ze wzrostem poziomu. */
const ENEMY_TYPES: EnemyType[] = ['walker', 'walker', 'jumper', 'dasher', 'tank'];

/** Parametry per typ lisa: promień, prędkość, gęstość, HP, umiejętność
 *  skoku (AI skoczka) i kolor sierści. */
const ENEMY_SETTINGS: Record<EnemyType, { r: number; speedMin: number; speedMax: number; density: number; hp: number; jump: boolean; color: string }> = {
  walker: { r: 17, speedMin: 1.4, speedMax: 2.6, density: 0.004, hp: 1, jump: false, color: '#f87858' },
  jumper: { r: 15, speedMin: 1.2, speedMax: 1.9, density: 0.004, hp: 1, jump: true, color: '#fca044' },
  dasher: { r: 14, speedMin: 2.8, speedMax: 3.8, density: 0.003, hp: 1, jump: false, color: '#f83800' },
  tank:   { r: 24, speedMin: 0.9, speedMax: 1.5, density: 0.006, hp: 3, jump: false, color: '#983818' },
  boss:   { r: 32, speedMin: 1.1, speedMax: 1.1, density: 0.008, hp: 8, jump: false, color: '#a838f8' },
};

/** Lista typów bonusów do losowania. */
const POWERUP_TYPES: PowerupType[] = ['life', 'shield', 'magnet', 'slow', 'double'];

/**
 * Fabryka encji gry. Każda metoda tworzy ciało Matter, przypina mu
 * gameData (kontrakt z core/types.ts), dodaje do świata i rejestruje
 * w odpowiedniej kolekcji w core/state.ts.
 */
export class EntityFactory {

  /** Jajko spada z góry w losowym x; ~12% szans na złote (5x punktów). */
  spawnEgg(): void {
    const r = 8;
    const egg = Bodies.circle(16 + Math.random() * (W() - 32), -16, r, {
      frictionAir: 0.02, restitution: 0.35, density: 0.0012,
      render: { visible: false },
    });
    egg.label = 'egg';
    egg.gameData = { spin: (Math.random() - 0.5) * 0.2, golden: Math.random() < 0.12, hue: 0 } as EggData;
    Body.setAngularVelocity(egg, egg.gameData.spin);
    Composite.add(physics.engine.world, egg);
    eggs.push(egg);
  }

  /**
   * Lis wchodzi z prawej strony ekranu; bez podania typu losuje z puli
   * ograniczonej poziomem trudności. Lekki bonus prędkości ze score.
   */
  spawnEnemy(type: EnemyType | null = null): void {
    if (!type) type = ENEMY_TYPES[Math.floor(Math.random() * Math.min(ENEMY_TYPES.length, 2 + gameState.difficulty))];
    const s = ENEMY_SETTINGS[type];
    const enemy = Bodies.circle(W() + 30, H() - GROUND_H - s.r, s.r, {
      friction: 0.5, frictionAir: 0.005, restitution: 0.1, density: s.density,
      render: { visible: false },
    });
    enemy.label = 'enemy';
    const baseSpeed = s.speedMin + Math.random() * (s.speedMax - s.speedMin) + gameState.score * 0.001;
    enemy.gameData = {
      type,
      r: s.r,
      speed: baseSpeed,
      walkPhase: 0,
      facing: -1,
      onGround: false,
      jumps: 0,
      maxJumps: s.jump ? 1 : 0,
      nextJumpTime: physics.now + 1000 + Math.random() * 2000,
      chaseRange: 110 + Math.random() * 80,
      jumpCooldown: 900 + Math.random() * 600,
      hp: s.hp,
      color: s.color,
      nextAttack: 0,
    } as EnemyData;
    Body.setVelocity(enemy, { x: -enemy.gameData.speed, y: 0 });
    Composite.add(physics.engine.world, enemy);
    enemies.push(enemy);
  }

  /**
   * Boss — wielki lis z 8 HP; trafia się tylko skokiem na łeb,
   * co ~1.5 s zrzuca spadające przeszkody (atak w Game.updateEnemies).
   */
  spawnBoss(): void {
    const s = ENEMY_SETTINGS.boss;
    const boss = Bodies.circle(W() + 50, H() - GROUND_H - s.r, s.r, {
      friction: 0.5, frictionAir: 0.005, restitution: 0.1, density: s.density,
      render: { visible: false },
    });
    boss.label = 'boss';
    boss.gameData = {
      type: 'boss',
      r: s.r,
      speed: 1.1,
      walkPhase: 0,
      facing: -1,
      onGround: false,
      jumps: 0,
      maxJumps: 0,
      nextJumpTime: 0,
      chaseRange: 0,
      jumpCooldown: 0,
      hp: s.hp,
      color: s.color,
      nextAttack: physics.now + 1200,
    } as EnemyData;
    Body.setVelocity(boss, { x: -boss.gameData.speed, y: 0 });
    Composite.add(physics.engine.world, boss);
    enemies.push(boss);
    gameState.bossActive = true;
  }

  /**
   * Spadająca przeszkoda (kamień lub ptak) z lekkim bocznym dryfem —
   * stała przeszkoda rundy i pocisk ataku bossa.
   */
  spawnFallingObstacle(): void {
    const w = 16 + Math.random() * 10;
    const x = 24 + Math.random() * (W() - 48);
    const obs = Bodies.rectangle(x, -30, w, w, {
      frictionAir: 0.01, restitution: 0.2, density: 0.003,
      render: { visible: false },
    });
    obs.label = 'falling';
    obs.gameData = { type: Math.random() < 0.5 ? 'rock' : 'bird', rotation: (Math.random() - 0.5) * 0.1 } as FallingData;
    Body.setAngularVelocity(obs, obs.gameData.rotation);
    Body.setVelocity(obs, { x: (Math.random() - 0.5) * 1.5, y: 3 + Math.random() * 2 });
    Composite.add(physics.engine.world, obs);
    fallingObstacles.push(obs);
  }

  /** Bonus spadający z góry: life / shield / magnet / slow / double. */
  spawnPowerup(): void {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const x = 24 + Math.random() * (W() - 48);
    const p = Bodies.circle(x, -24, 12, {
      frictionAir: 0.02, restitution: 0.4, density: 0.001,
      render: { visible: false },
    });
    p.label = 'powerup';
    p.gameData = { type, spin: (Math.random() - 0.5) * 0.1 } as PowerupData;
    Body.setAngularVelocity(p, p.gameData.spin);
    Composite.add(physics.engine.world, p);
    powerups.push(p);
  }

  /**
   * Chmura n pikselowych cząsteczek rozrzucanych w górę (lądowanie,
   * zebranie jajka, trafienie). Znikają, gdy life spadnie poniżej zera
   * (obsługa w Game.updateParticles).
   */
  spawnParticles(x: number, y: number, color: string, n = 10): void {
    for (let i = 0; i < n; i++) {
      const p = Bodies.circle(x, y, 1 + Math.random() * 3, {
        frictionAir: 0.9, restitution: 0.5, render: { visible: false },
      });
      Body.setVelocity(p, { x: (Math.random() - 0.5) * 9, y: -2 - Math.random() * 7 });
      Composite.add(physics.engine.world, p);
      particles.push({ body: p, life: 1, color });
    }
  }

  /** Wyskakujący tekst punktowy unoszący się w górę ("+10", "SHIELD"...). */
  addPopup(x: number, y: number, text: string, color: string): void {
    popups.push({ x, y, text, color, life: 1, vy: -0.8 });
  }
}
