// Silnik fizyki, ciała świata i spawn encji (port odpowiednika mechanics.js).
// Świat ma stałą rozdzielczość 256×240 — rozmiary encji są do niej dopracowane.
import * as Matter from 'matter-js';
import { GROUND_H, VIEW_W, VIEW_H, world, gameState, eggs, enemies, fallingObstacles, powerups, particles, popups, W, H } from './state';
import type { PlayerData, EggData, EnemyData, EnemyType, FallingData, PowerupData, PowerupType } from './types';

const { Engine, Render, Runner, Bodies, Composite, Body } = Matter;

// Tworzy silnik Matter, renderer (canvas 256×240 w #stage) i runner
// ze stałym krokiem 60 FPS. Zwiększone iteracje = stabilniejsze stosy ciał.
export function initEngine(stage: HTMLElement) {
  const engine = Engine.create({ enableSleeping: false });
  engine.positionIterations = 12;
  engine.velocityIterations = 10;
  engine.world.gravity.y = 1;
  world.engine = engine;

  const render = Render.create({
    element: stage,
    engine,
    options: {
      width: VIEW_W,
      height: VIEW_H,
      wireframes: false,
      background: 'transparent',
      pixelRatio: 1,
    },
  });
  world.render = render;

  const runner = Runner.create();
  runner.isFixed = true;
  runner.delta = 1000 / 60;
  world.runner = runner;

  Render.run(render);
  Runner.run(runner, engine);
}

// Pozycjonuje ziemię i niewidzialne ściany boczne pod stały widok 256×240.
// Ściana prawa zachodzi na strefę spawnu wrogów (x > W) — fizyka sama
// wypycha ich w kierunku ekranu, skąd maszerują w lewo.
export function layoutWalls() {
  Body.setPosition(world.ground, { x: W() / 2, y: H() - GROUND_H / 2 });
  Body.setPosition(world.leftWall, { x: -30, y: H() / 2 });
  Body.setPosition(world.rightWall, { x: W() + 30, y: H() / 2 });
}

// Tworzy ciała stałe świata: gracz (kurka), ziemia, ściany boczne.
// Sprite'y rysuje render.ts — wszystkie ciała mają render.visible=false.
export function createWorld() {
  const player = Bodies.circle(48, 0, 14, {
    friction: 0.001,
    frictionAir: 0.01,
    restitution: 0.05,
    density: 0.002,
    render: { visible: false },
  });
  player.label = 'player';
  player.gameData = { onGround: false, jumps: 0, maxJumps: 2, facing: 1, walkPhase: 0, squash: 0 } as PlayerData;
  world.player = player;

  const ground = Bodies.rectangle(0, 0, 10000, GROUND_H, {
    isStatic: true, friction: 1, restitution: 0.15, render: { visible: false },
  });
  ground.label = 'ground';
  world.ground = ground;

  const leftWall = Bodies.rectangle(-30, 0, 60, 10000, { isStatic: true, render: { visible: false } });
  const rightWall = Bodies.rectangle(0, 0, 60, 10000, { isStatic: true, render: { visible: false } });
  world.leftWall = leftWall;
  world.rightWall = rightWall;

  layoutWalls();
  Composite.add(world.engine.world, [player, ground, leftWall, rightWall]);
}

// Usuwa wszystkie encje ze świata i czyści tablice — reset przed rundą.
export function clearEntities() {
  enemies.forEach(e => Composite.remove(world.engine.world, e));
  eggs.forEach(e => Composite.remove(world.engine.world, e));
  fallingObstacles.forEach(o => Composite.remove(world.engine.world, o));
  powerups.forEach(p => Composite.remove(world.engine.world, p));
  particles.forEach(p => Composite.remove(world.engine.world, p.body));
  enemies.length = 0;
  eggs.length = 0;
  fallingObstacles.length = 0;
  powerups.length = 0;
  particles.length = 0;
  popups.length = 0;
}

// Pozycja startowa gracza: lewa strona ekranu, na ziemi, zero prędkości.
export function resetPlayer() {
  Body.setPosition(world.player, { x: 48, y: H() - GROUND_H - 14 });
  Body.setVelocity(world.player, { x: 0, y: 0 });
}

// Jajko spada z góry w losowym x; ~12% szans na złote (5x punktów).
export function spawnEgg() {
  const r = 8;
  const egg = Bodies.circle(16 + Math.random() * (W() - 32), -16, r, {
    frictionAir: 0.02, restitution: 0.35, density: 0.0012,
    render: { visible: false },
  });
  egg.label = 'egg';
  egg.gameData = { spin: (Math.random() - 0.5) * 0.2, golden: Math.random() < 0.12, hue: 0 } as EggData;
  Body.setAngularVelocity(egg, egg.gameData.spin);
  Composite.add(world.engine.world, egg);
  eggs.push(egg);
}

// Pula losowania typów — 'walker' podwójnie = częstszy. spawnEnemy bierze
// tylko pierwsze 2+difficulty wpisów, więc trudniejsze typy dołączają z czasem.
const ENEMY_TYPES: EnemyType[] = ['walker', 'walker', 'jumper', 'dasher', 'tank'];

// Parametry per typ lisa: promień, prędkość, gęstość, HP, umiejętność
// skoku (AI skoczka) i kolor sierści.
const ENEMY_SETTINGS: Record<EnemyType, { r: number; speedMin: number; speedMax: number; density: number; hp: number; jump: boolean; color: string }> = {
  walker: { r: 17, speedMin: 1.4, speedMax: 2.6, density: 0.004, hp: 1, jump: false, color: '#f87858' },
  jumper: { r: 15, speedMin: 1.2, speedMax: 1.9, density: 0.004, hp: 1, jump: true, color: '#fca044' },
  dasher: { r: 14, speedMin: 2.8, speedMax: 3.8, density: 0.003, hp: 1, jump: false, color: '#f83800' },
  tank:   { r: 24, speedMin: 0.9, speedMax: 1.5, density: 0.006, hp: 3, jump: false, color: '#983818' },
  boss:   { r: 32, speedMin: 1.1, speedMax: 1.1, density: 0.008, hp: 8, jump: false, color: '#a838f8' },
};

// Lis wchodzi z prawej strony ekranu; bez podania typu losuje z puli
// ograniczonej poziomem trudności. Lekki bonus prędkości ze score.
export function spawnEnemy(type: EnemyType | null = null) {
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
    nextJumpTime: world.engine.timing.timestamp + 1000 + Math.random() * 2000,
    chaseRange: 110 + Math.random() * 80,
    jumpCooldown: 900 + Math.random() * 600,
    hp: s.hp,
    color: s.color,
    nextAttack: 0,
  } as EnemyData;
  Body.setVelocity(enemy, { x: -enemy.gameData.speed, y: 0 });
  Composite.add(world.engine.world, enemy);
  enemies.push(enemy);
}

// Spadająca przeszkoda (kamień lub ptak) z lekkim bocznym dryfem —
// stała przeszkoda rundy i pocisk ataku bossa.
export function spawnFallingObstacle() {
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
  Composite.add(world.engine.world, obs);
  fallingObstacles.push(obs);
}

const POWERUP_TYPES: PowerupType[] = ['life', 'shield', 'magnet', 'slow', 'double'];

// Bonus spadający z góry: life / shield / magnet / slow / double.
export function spawnPowerup() {
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  const x = 24 + Math.random() * (W() - 48);
  const p = Bodies.circle(x, -24, 12, {
    frictionAir: 0.02, restitution: 0.4, density: 0.001,
    render: { visible: false },
  });
  p.label = 'powerup';
  p.gameData = { type, spin: (Math.random() - 0.5) * 0.1 } as PowerupData;
  Body.setAngularVelocity(p, p.gameData.spin);
  Composite.add(world.engine.world, p);
  powerups.push(p);
}

// Boss — wielki lis z 8 HP; trafia się tylko skokiem na łeb,
// co ~1.5 s zrzuca spadające przeszkody (atak w logic.ts).
export function spawnBoss() {
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
    nextAttack: world.engine.timing.timestamp + 1200,
  } as EnemyData;
  Body.setVelocity(boss, { x: -boss.gameData.speed, y: 0 });
  Composite.add(world.engine.world, boss);
  enemies.push(boss);
  gameState.bossActive = true;
}

// Chmura n pikselowych cząsteczek rozrzucanych w górę (lądowanie,
// zebranie jajka, trafienie). Znikają po life < 0 w logic.ts.
export function spawnParticle(x: number, y: number, color: string, n = 10) {
  for (let i = 0; i < n; i++) {
    const p = Bodies.circle(x, y, 1 + Math.random() * 3, {
      frictionAir: 0.9, restitution: 0.5, render: { visible: false },
    });
    Body.setVelocity(p, { x: (Math.random() - 0.5) * 9, y: -2 - Math.random() * 7 });
    Composite.add(world.engine.world, p);
    particles.push({ body: p, life: 1, color });
  }
}

// Wyskakujący tekst punktowy unoszący się w górę ("+10", "SHIELD"...).
export function addPopup(x: number, y: number, text: string, color: string) {
  popups.push({ x, y, text, color, life: 1, vy: -0.8 });
}
