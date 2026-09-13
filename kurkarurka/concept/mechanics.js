import { Engine, Render, Runner, Bodies, Composite, Body, gameState, GROUND_H, world, eggs, enemies, fallingObstacles, powerups, bullets, explosions, particles, popups, W, H } from './state.js';

export function initEngine(stage) {
  const engine = Engine.create({ enableSleeping: false });
  engine.positionIterations = 12;
  engine.velocityIterations = 10;
  engine.world.gravity.y = 1;
  world.engine = engine;

  const render = Render.create({
    element: stage,
    engine: engine,
    options: {
      width: stage.clientWidth || 960,
      height: stage.clientHeight || 420,
      wireframes: false,
      background: 'transparent',
      pixelRatio: Math.min(2, window.devicePixelRatio || 1)
    }
  });
  world.render = render;

  const runner = Runner.create();
  runner.isFixed = true;
  runner.delta = 1000 / 60;
  world.runner = runner;

  Render.run(render);
  Runner.run(runner, engine);
}

export function layoutWalls() {
  Body.setPosition(world.ground, { x: W() / 2, y: H() - GROUND_H / 2 });
  Body.setPosition(world.leftWall, { x: -30, y: H() / 2 });
  Body.setPosition(world.rightWall, { x: W() + 30, y: H() / 2 });
}

export function createWorld() {
  const player = Bodies.circle(120, 0, 22, {
    friction: 0.001,
    frictionAir: 0.01,
    restitution: 0.05,
    density: 0.002,
    render: { visible: false }
  });
  player.label = 'player';
  player.gameData = { onGround: false, jumps: 0, maxJumps: 2, facing: 1, walkPhase: 0, squash: 0 };
  world.player = player;

  const ground = Bodies.rectangle(0, 0, 10000, GROUND_H, {
    isStatic: true, friction: 1, restitution: 0.15, render: { visible: false }
  });
  ground.label = 'ground';
  world.ground = ground;

  const leftWall = Bodies.rectangle(-30, 0, 60, 10000, { isStatic: true, render: { visible: false } });
  const rightWall = Bodies.rectangle(0, 0, 60, 10000, { isStatic: true, render: { visible: false } });
  world.leftWall = leftWall;
  world.rightWall = rightWall;

  eggs.length = 0;
  enemies.length = 0;
  fallingObstacles.length = 0;
  powerups.length = 0;
  bullets.length = 0;
  explosions.length = 0;
  particles.length = 0;
  popups.length = 0;

  layoutWalls();
  Composite.add(world.engine.world, [player, ground, leftWall, rightWall]);
}

export function spawnEgg() {
  const r = 12;
  const egg = Bodies.circle(40 + Math.random() * (W() - 80), -20, r, {
    frictionAir: 0.02, restitution: 0.35, density: 0.0012,
    render: { visible: false }
  });
  egg.label = 'egg';
  egg.gameData = { spin: (Math.random() - 0.5) * 0.2, golden: Math.random() < 0.12, hue: 0 };
  Body.setAngularVelocity(egg, egg.gameData.spin);
  Composite.add(world.engine.world, egg);
  eggs.push(egg);
}

const ENEMY_TYPES = ['walker', 'walker', 'jumper', 'dasher', 'tank'];

export function spawnEnemy(type = null) {
  if (!type) type = ENEMY_TYPES[Math.floor(Math.random() * Math.min(ENEMY_TYPES.length, 2 + gameState.difficulty))];
  const settings = {
    walker: { r: 26, speedMin: 2.2, speedMax: 4.4, density: 0.004, hp: 1, jump: false, color: '#ff7f3f' },
    jumper: { r: 24, speedMin: 1.8, speedMax: 3.0, density: 0.004, hp: 1, jump: true, color: '#ff9f5f' },
    dasher: { r: 22, speedMin: 4.5, speedMax: 6.5, density: 0.003, hp: 1, jump: false, color: '#ff5555' },
    tank: { r: 34, speedMin: 1.2, speedMax: 2.0, density: 0.006, hp: 3, jump: false, color: '#8b3d10' }
  };
  const s = settings[type];
  const r = s.r;
  const enemy = Bodies.circle(W() + 40, H() - GROUND_H - r, r, {
    friction: 0.5, frictionAir: 0.005, restitution: 0.1, density: s.density,
    render: { visible: false }
  });
  enemy.label = 'enemy';
  const baseSpeed = s.speedMin + Math.random() * (s.speedMax - s.speedMin) + gameState.score * 0.001;
  enemy.gameData = {
    type,
    r,
    speed: baseSpeed,
    walkPhase: 0,
    facing: -1,
    onGround: false,
    jumps: 0,
    maxJumps: s.jump ? 1 : 0,
    nextJumpTime: world.engine.timing.timestamp + 1000 + Math.random() * 2000,
    chaseRange: 160 + Math.random() * 120,
    jumpCooldown: 900 + Math.random() * 600,
    hp: s.hp,
    color: s.color
  };
  Body.setVelocity(enemy, { x: -enemy.gameData.speed, y: 0 });
  Composite.add(world.engine.world, enemy);
  enemies.push(enemy);
}

export function spawnFallingObstacle() {
  const w = 28 + Math.random() * 16;
  const x = 60 + Math.random() * (W() - 120);
  const obs = Bodies.rectangle(x, -40, w, w, {
    frictionAir: 0.01, restitution: 0.2, density: 0.003,
    render: { visible: false }
  });
  obs.label = 'falling';
  obs.gameData = { type: Math.random() < 0.5 ? 'rock' : 'bird', rotation: (Math.random() - 0.5) * 0.1 };
  Body.setAngularVelocity(obs, obs.gameData.rotation);
  Body.setVelocity(obs, { x: (Math.random() - 0.5) * 1.5, y: 3 + Math.random() * 2 });
  Composite.add(world.engine.world, obs);
  fallingObstacles.push(obs);
}

const POWERUP_TYPES = ['life', 'shield', 'magnet', 'slow', 'double'];

export function spawnPowerup() {
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  const x = 60 + Math.random() * (W() - 120);
  const p = Bodies.circle(x, -30, 18, {
    frictionAir: 0.02, restitution: 0.4, density: 0.001,
    render: { visible: false }
  });
  p.label = 'powerup';
  p.gameData = { type, spin: (Math.random() - 0.5) * 0.1 };
  Body.setAngularVelocity(p, p.gameData.spin);
  Composite.add(world.engine.world, p);
  powerups.push(p);
}

export function spawnBoss() {
  const r = 48;
  const boss = Bodies.circle(W() + 60, H() - GROUND_H - r, r, {
    friction: 0.5, frictionAir: 0.005, restitution: 0.1, density: 0.008,
    render: { visible: false }
  });
  boss.label = 'boss';
  boss.gameData = {
    type: 'boss',
    r,
    speed: 1.6,
    walkPhase: 0,
    facing: -1,
    onGround: false,
    jumps: 0,
    maxJumps: 0,
    hp: 8,
    color: '#7b1fa2',
    nextAttack: world.engine.timing.timestamp + 1200
  };
  Body.setVelocity(boss, { x: -boss.gameData.speed, y: 0 });
  Composite.add(world.engine.world, boss);
  enemies.push(boss);
  gameState.bossActive = true;
}

export function spawnParticle(x, y, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const p = Bodies.circle(x, y, 2 + Math.random() * 4, {
      frictionAir: 0.9, restitution: 0.5, render: { visible: false }
    });
    Body.setVelocity(p, { x: (Math.random() - 0.5) * 9, y: -2 - Math.random() * 7 });
    Composite.add(world.engine.world, p);
    particles.push({ body: p, life: 1, color });
  }
}

export function addPopup(x, y, text, color) {
  popups.push({ x, y, text, color, life: 1, vy: -0.8 });
}

export function spawnBullet(px, py, angle) {
  const speed = 0.8;
  const b = Bodies.circle(px, py, 5, {
    frictionAir: 0, restitution: 0, density: 0.0001, isSensor: true,
    render: { visible: false }
  });
  b.label = 'bullet';
  b.gameData = { life: 80 };
  Body.setPosition(b, { x: px, y: py });
  Body.setVelocity(b, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
  Composite.add(world.engine.world, b);
  bullets.push(b);
}

export function spawnExplosion(x, y, color, n = 24) {
  const bits = [];
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.3;
    const sp = 3 + Math.random() * 7;
    bits.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life: 1,
      color,
      size: 3 + Math.random() * 4
    });
  }
  explosions.push({ x, y, bits, life: 1, color });
}

export function resize() {
  const stage = world.render.element;
  const r = stage.getBoundingClientRect();
  world.render.options.width = Math.floor(r.width);
  world.render.options.height = Math.floor(r.height);
  world.render.canvas.width = world.render.options.width * world.render.options.pixelRatio;
  world.render.canvas.height = world.render.options.height * world.render.options.pixelRatio;
  world.render.canvas.style.width = world.render.options.width + 'px';
  world.render.canvas.style.height = world.render.options.height + 'px';
  world.render.context.setTransform(world.render.options.pixelRatio, 0, 0, world.render.options.pixelRatio, 0, 0);
  layoutWalls();
  if (!gameState.running) {
    Body.setPosition(world.player, { x: 120, y: H() - GROUND_H - 22 });
  }
}
