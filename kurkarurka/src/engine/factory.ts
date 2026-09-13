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
import { GROUND_H, W, H, PLATFORM_H, BOSS_HP_PER_TIER, BOSS_ATTACK_MS, BOSS_ATTACK_STEP_MS } from '../core/config';
import { gameState, levelState, eggs, enemies, fallingObstacles, powerups, particles, popups, grounds, platforms } from '../core/state';
import { physics } from './physics';
import type { EggData, EnemyData, EnemyType, FallingData, FallingType, PowerupData, PowerupType } from '../core/types';

const { Bodies, Composite, Body } = Matter;

/** Pula losowania typów wrogów — 'walker' podwójnie = częstszy.
 *  spawnEnemy bierze tylko pierwsze 1+difficulty wpisów, więc trudniejsze
 *  typy dołączają do rotacji wraz ze wzrostem poziomu. */
const ENEMY_TYPES: EnemyType[] = ['walker', 'walker', 'jumper', 'dasher', 'tank'];

/** Parametry per typ lisa: promień, prędkość, gęstość, HP, umiejętność
 *  skoku (AI skoczka) i kolor sierści. */
const ENEMY_SETTINGS: Record<EnemyType, { r: number; speedMin: number; speedMax: number; density: number; hp: number; jump: boolean; color: string; attackMs: number }> = {
  walker: { r: 17, speedMin: 1.4, speedMax: 2.6, density: 0.004, hp: 1, jump: false, color: '#f87858', attackMs: 0 },
  jumper: { r: 15, speedMin: 1.2, speedMax: 1.9, density: 0.004, hp: 1, jump: true, color: '#fca044', attackMs: 0 },
  dasher: { r: 14, speedMin: 2.8, speedMax: 3.8, density: 0.003, hp: 1, jump: false, color: '#f83800', attackMs: 0 },
  tank:   { r: 24, speedMin: 0.9, speedMax: 1.5, density: 0.006, hp: 3, jump: false, color: '#983818', attackMs: 0 },
  boss:   { r: 32, speedMin: 1.1, speedMax: 1.1, density: 0.008, hp: 8, jump: false, color: '#8a8aa0', attackMs: BOSS_ATTACK_MS },
};

/** Lista typów bonusów do losowania. */
const POWERUP_TYPES: PowerupType[] = ['life', 'shield', 'magnet', 'slow', 'double'];

/**
 * Fabryka encji gry. Każda metoda tworzy ciało Matter, przypina mu
 * gameData (kontrakt z core/types.ts), dodaje do świata i rejestruje
 * w odpowiedniej kolekcji w core/state.ts.
 */
export class EntityFactory {

  /** Jajko spada z góry w losowym x całego świata; ~12% szans na złote (5x punktów). */
  spawnEgg(): void {
    const r = 8;
    const egg = Bodies.circle(16 + Math.random() * (levelState.len - 32), -16, r, {
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
   * Lis; bez podania typu losuje z puli ograniczonej poziomem trudności.
   * Domyślnie wchodzi z prawej strony ekranu (koszmar) — opts pozwala
   * postawić go na poziomie przygody z patrolem między patrolMin/Max.
   * Prędkość rośnie z poziomem trudności i lekko ze score.
   */
  spawnEnemy(type: EnemyType | null = null, opts?: { x?: number; dirX?: number; patrolMin?: number; patrolMax?: number; tier?: number }): void {
    if (!type) type = ENEMY_TYPES[Math.floor(Math.random() * Math.min(ENEMY_TYPES.length, 1 + gameState.difficulty))];
    const s = ENEMY_SETTINGS[type];
    const x = opts?.x ?? W() + 30;
    const dirX = opts?.dirX ?? -1;
    // Tier areny bossa: kolejny wilk ma więcej HP, szybciej atakuje i biega.
    const tier = type === 'boss' ? (opts?.tier ?? 0) : 0;
    const enemy = Bodies.circle(x, H() - GROUND_H - s.r, s.r, {
      friction: 0.5, frictionAir: 0.005, restitution: 0.1, density: s.density,
      render: { visible: false },
    });
    enemy.label = 'enemy';
    let baseSpeed = s.speedMin + Math.random() * (s.speedMax - s.speedMin)
      + gameState.score * 0.0008 + (gameState.difficulty - 1) * 0.12;
    if (type === 'boss') baseSpeed *= 1 + tier * 0.12;
    enemy.gameData = {
      type,
      r: s.r,
      speed: baseSpeed,
      dirX,
      patrolMin: opts?.patrolMin ?? -Infinity,
      patrolMax: opts?.patrolMax ?? Infinity,
      walkPhase: 0,
      facing: dirX,
      onGround: false,
      jumps: 0,
      maxJumps: s.jump ? 1 : 0,
      nextJumpTime: physics.now + 1000 + Math.random() * 2000,
      chaseRange: 110 + Math.random() * 80,
      jumpCooldown: 900 + Math.random() * 600,
      hp: s.hp + tier * BOSS_HP_PER_TIER,
      color: s.color,
      nextAttack: 0,
      attackMs: type === 'boss' ? Math.max(600, s.attackMs - tier * BOSS_ATTACK_STEP_MS) : 0,
    } as EnemyData;
    if (type === 'boss') {
      enemy.label = 'boss';
      enemy.gameData.nextAttack = physics.now + 1200;
      gameState.bossActive = true;
    }
    Body.setVelocity(enemy, { x: dirX * enemy.gameData.speed, y: 0 });
    Composite.add(physics.engine.world, enemy);
    enemies.push(enemy);
  }

  /**
   * Spadająca przeszkoda (kamień lub ptak) z lekkim bocznym dryfem —
   * stała przeszkoda rundy i pocisk ataku bossa. Bez argumentu x losuje
   * w okolicy gracza (koszmar); boss podaje pozycję celu (przygoda).
   */
  spawnFallingObstacle(x?: number): void {
    const w = 16 + Math.random() * 10;
    const spawnX = x ?? Math.min(Math.max(
      physics.player.position.x + (Math.random() - 0.5) * W() * 1.6, 20),
      levelState.len - 20,
    );
    const obs = Bodies.rectangle(spawnX, -30, w, w, {
      frictionAir: 0.01, restitution: 0.2, density: 0.003,
      render: { visible: false },
    });
    obs.label = 'falling';
    // Arena bossa dorzuca pająki do puli zrzutu — im wyższy tier, tym gęstszy deszcz.
    const pool: FallingType[] = levelState.bossArena ? ['rock', 'rock', 'spider', 'bird'] : ['rock', 'bird'];
    obs.gameData = { type: pool[Math.floor(Math.random() * pool.length)], rotation: (Math.random() - 0.5) * 0.1, flyer: false, flySpeed: 0 } as FallingData;
    Body.setAngularVelocity(obs, obs.gameData.rotation);
    Body.setVelocity(obs, { x: (Math.random() - 0.5) * 1.5, y: 3 + Math.random() * 2 });
    Composite.add(physics.engine.world, obs);
    fallingObstacles.push(obs);
  }

  /**
   * Lecący ptak (tryb przygody) — kinematyczna przeszkoda przelatująca
   * w lewo na stałej wysokości; Game przesuwa go ręcznie co tick.
   * Spawn poza prawą krawędzią pola widzenia gracza.
   */
  spawnFlyer(y: number): void {
    const obs = Bodies.circle(physics.player.position.x + W() + 20, y, 9, {
      isSensor: true, render: { visible: false },
    });
    obs.label = 'falling';
    obs.gameData = { type: 'bird', rotation: 0, flyer: true, flySpeed: -(1.6 + Math.random() * 1.2) } as FallingData;
    Composite.add(physics.engine.world, obs);
    fallingObstacles.push(obs);
  }

  // ---- Elementy poziomu przygody ----

  /** Segment ziemi od x0 do x1 — statyczny prostokąt o wysokości GROUND_H. */
  spawnGroundSegment(x0: number, x1: number): void {
    const g = Bodies.rectangle((x0 + x1) / 2, H() - GROUND_H / 2, x1 - x0, GROUND_H, {
      isStatic: true, friction: 1, restitution: 0.05, render: { visible: false },
    });
    g.label = 'seg';
    Composite.add(physics.engine.world, g);
    grounds.push(g);
  }

  /** Jednokierunkowa pływająca platforma (wskakuje się na nią od spodu). */
  spawnPlatform(cx: number, topY: number, w: number): void {
    const p = Bodies.rectangle(cx, topY + PLATFORM_H / 2, w, PLATFORM_H, {
      isStatic: true, friction: 0.6, render: { visible: false },
    });
    p.label = 'platform';
    Composite.add(physics.engine.world, p);
    platforms.push(p);
  }

  /** Jajko zawieszone w powietrzu — dekoracja poziomu do zebrania. */
  spawnStaticEgg(x: number, y: number, golden: boolean): void {
    const egg = Bodies.circle(x, y, 8, { isStatic: true, isSensor: true, render: { visible: false } });
    egg.label = 'egg';
    egg.gameData = { spin: 0, golden, hue: 0 } as EggData;
    Composite.add(physics.engine.world, egg);
    eggs.push(egg);
  }

  /** Power-up zawieszony w powietrzu na poziomie przygody. */
  spawnStaticPowerup(x: number, y: number, type?: PowerupType): void {
    const t = type ?? POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const p = Bodies.circle(x, y, 12, { isStatic: true, isSensor: true, render: { visible: false } });
    p.label = 'powerup';
    p.gameData = { type: t, spin: 0 } as PowerupData;
    Composite.add(physics.engine.world, p);
    powerups.push(p);
  }

  /** Bonus spadający z góry: life / shield / magnet / slow / double. */
  spawnPowerup(): void {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const x = 24 + Math.random() * (levelState.len - 48);
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
