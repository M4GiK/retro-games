import { Events, Body, Composite, gameState, activeEffects, mouse, GROUND_H, world, eggs, enemies, fallingObstacles, powerups, bullets, explosions, particles, popups, W, H } from './state.js';
import { spawnEgg, spawnEnemy, spawnFallingObstacle, spawnPowerup, spawnBoss, spawnBullet, spawnExplosion, spawnParticle, addPopup, resize } from './mechanics.js';
import { playJump, playCollect, playGolden, playStomp, playHurt, playGameOver, playLevelUp, playPowerUp, playBoss, playShoot, playExplosion, startMusic, stopMusic, setMuted, isMuted } from './audio.js';

let lastEgg = 0, lastEnemy = 0, lastFalling = 0, lastPowerup = 0, lastDiff = 0, lastLevelUp = 0, lastShot = 0, spawnInterval = 1700;
const FIRE_RATE = 100;

const stage = document.getElementById('stage');
const startIntroBtn = document.getElementById('startIntro');
const muteBtn = document.getElementById('mute');
const introEl = document.getElementById('intro');
const overEl = document.getElementById('over');
const overText = document.getElementById('overText');
const retryBtn = document.getElementById('retry');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const collectedEl = document.getElementById('collected');
const comboEl = document.getElementById('combo');
const music = document.getElementById('bgMusic');

const tryPlay = () => { startMusic(); };

const keys = new Set();
let touchDir = 0;
let touchJumpQueued = false;
const pointers = new Map();

export function updateHUD() {
  scoreEl.textContent = gameState.score;
  livesEl.textContent = '❤'.repeat(Math.max(0, gameState.lives)) || '—';
  collectedEl.textContent = gameState.collected;
  comboEl.textContent = 'x' + gameState.combo;
}

export function reset() {
  gameState.running = false;
  gameState.score = 0; gameState.lives = 3; gameState.collected = 0; gameState.combo = 1; gameState.comboTimer = 0; gameState.difficulty = 1; gameState.bossActive = false;
  activeEffects.shield = 0; activeEffects.magnet = 0; activeEffects.slowTime = 0; activeEffects.doubleJump = 0;
  Body.setPosition(world.player, { x: 120, y: H() - GROUND_H - 22 });
  Body.setVelocity(world.player, { x: 0, y: 0 });
  enemies.forEach(e => Composite.remove(world.engine.world, e));
  eggs.forEach(e => Composite.remove(world.engine.world, e));
  fallingObstacles.forEach(o => Composite.remove(world.engine.world, o));
  powerups.forEach(p => Composite.remove(world.engine.world, p));
  bullets.forEach(b => Composite.remove(world.engine.world, b));
  explosions.length = 0;
  particles.forEach(p => Composite.remove(world.engine.world, p.body));
  enemies.length = 0; eggs.length = 0; fallingObstacles.length = 0; powerups.length = 0; bullets.length = 0; particles.length = 0; popups.length = 0;
  overEl.classList.remove('show');
  introEl.classList.add('show');
  updateHUD();
}

export function startGame() {
  if (gameState.running) return;
  gameState.running = true;
  Body.setPosition(world.player, { x: 120, y: H() - GROUND_H - 22 });
  Body.setVelocity(world.player, { x: 0, y: 0 });
  enemies.forEach(e => Composite.remove(world.engine.world, e));
  eggs.forEach(e => Composite.remove(world.engine.world, e));
  fallingObstacles.forEach(o => Composite.remove(world.engine.world, o));
  powerups.forEach(p => Composite.remove(world.engine.world, p));
  bullets.forEach(b => Composite.remove(world.engine.world, b));
  explosions.length = 0;
  particles.forEach(p => Composite.remove(world.engine.world, p.body));
  enemies.length = 0; eggs.length = 0; fallingObstacles.length = 0; powerups.length = 0; bullets.length = 0; particles.length = 0; popups.length = 0;
  overEl.classList.remove('show');
  introEl.classList.remove('show');
  updateHUD();
}

export function gameOver() {
  gameState.running = false;
  overText.textContent = 'Twój wynik: ' + gameState.score + '  ·  Jajka: ' + gameState.collected;
  introEl.classList.remove('show');
  overEl.classList.add('show');
  stopMusic();
  playGameOver();
}

export function tryJump() {
  if (!gameState.running) return;
  const maxJumps = world.player.gameData.maxJumps + (activeEffects.doubleJump > 0 ? 1 : 0);
  if (world.player.gameData.jumps < maxJumps) {
    Body.setVelocity(world.player, { x: world.player.velocity.x, y: -11.5 });
    world.player.gameData.jumps++;
    world.player.gameData.squash = 1;
    spawnParticle(world.player.position.x, world.player.gameData.jumps >= world.player.gameData.maxJumps ? '#00e5ff' : '#ffffff', 6);
    playJump();
  }
}

function shootIfReady() {
  if (!gameState.running || !mouse.down) return;
  const now = world.engine.timing.timestamp;
  if (now - lastShot < FIRE_RATE) return;
  const rect = world.render.canvas.getBoundingClientRect();
  const mx = (mouse.x - rect.left) * (world.render.options.width / rect.width);
  const my = (mouse.y - rect.top) * (world.render.options.height / rect.height);
  const px = world.player.position.x;
  const py = world.player.position.y;
  const angle = Math.atan2(my - py, mx - px);
  const spawnX = px + Math.cos(angle) * 24;
  const spawnY = py + Math.sin(angle) * 24;
  spawnBullet(spawnX, spawnY, angle);
  playShoot();
  lastShot = now;
}

function beforeUpdate() {
  if (!gameState.running) return;
  const now = world.engine.timing.timestamp;

  shootIfReady();

  // Anti-sink clamp for items
  function keepAboveGround(body, r) {
    const limit = H() - GROUND_H - r;
    if (body.position.y > limit + 1) {
      Body.setPosition(body, { x: body.position.x, y: limit });
      Body.setVelocity(body, { x: body.velocity.x, y: Math.min(0, body.velocity.y) });
    }
  }
  eggs.forEach(o => keepAboveGround(o, 12));
  powerups.forEach(o => keepAboveGround(o, 18));
  fallingObstacles.forEach(o => keepAboveGround(o, 14));

  // Horizontal movement
  let dir = 0;
  if (keys.has('a') || keys.has('arrowleft')) dir = -1;
  if (keys.has('d') || keys.has('arrowright')) dir = 1;
  if (dir === 0) dir = touchDir;
  if (dir !== 0) {
    world.player.gameData.facing = dir;
    const target = dir * 5.2;
    Body.setVelocity(world.player, { x: target, y: world.player.velocity.y });
    if (world.player.gameData.onGround) world.player.gameData.walkPhase += 0.35;
  } else {
    if (world.player.gameData.onGround) Body.setVelocity(world.player, { x: world.player.velocity.x * 0.7, y: world.player.velocity.y });
  }

  // Ground detection
  const onGround = world.player.position.y + 22 >= H() - GROUND_H - 1 && Math.abs(world.player.velocity.y) < 1.2;
  if (onGround && !world.player.gameData.onGround) {
    if (world.player.gameData.jumps > 0) spawnParticle(world.player.position.x, world.player.position.y + 22, '#dust', 5);
    world.player.gameData.squash = 0.6;
  }
  world.player.gameData.onGround = onGround;
  if (onGround) world.player.gameData.jumps = 0;

  // Anti-bug clamp: prevent player from sinking below ground
  const groundY = H() - GROUND_H - 22;
  if (world.player.position.y > groundY + 2) {
    Body.setPosition(world.player, { x: world.player.position.x, y: groundY });
    Body.setVelocity(world.player, { x: world.player.velocity.x, y: Math.min(0, world.player.velocity.y) });
    world.player.gameData.onGround = true;
    world.player.gameData.jumps = 0;
  }

  // Squash decay
  world.player.gameData.squash *= 0.85;

  // Combo timer
  if (gameState.comboTimer > 0) {
    gameState.comboTimer -= 16.6;
    if (gameState.comboTimer <= 0) { gameState.combo = 1; updateHUD(); }
  }

  // Active effect timers
  for (const k of Object.keys(activeEffects)) {
    if (activeEffects[k] > 0) {
      activeEffects[k] -= 16.6;
      if (activeEffects[k] <= 0) activeEffects[k] = 0;
    }
  }

  // Magnet pulls eggs
  if (activeEffects.magnet > 0) {
    for (const e of eggs) {
      const dx = world.player.position.x - e.position.x;
      const dy = world.player.position.y - e.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 140 && dist > 20) {
        Body.setVelocity(e, { x: e.velocity.x + dx / dist * 0.8, y: e.velocity.y + dy / dist * 0.8 });
      }
    }
  }

  // Power-up spawning
  if (now - lastPowerup > 12000 && powerups.length < 1) {
    spawnPowerup();
    lastPowerup = now;
  }

  // Boss spawn every 4 difficulty levels
  if (gameState.difficulty % 4 === 0 && !gameState.bossActive) {
    spawnBoss();
    playBoss();
  }

  // Difficulty scaling
  if (now - lastLevelUp > 10000) {
    gameState.difficulty = Math.min(8, gameState.difficulty + 1);
    lastLevelUp = now;
    playLevelUp();
  }

  // Spawning
  const eggInterval = Math.max(350, 650 - gameState.difficulty * 40);
  const enemyInterval = Math.max(500, 1700 - gameState.difficulty * 150);
  if (now - lastEgg > eggInterval && eggs.length < 6) { spawnEgg(); lastEgg = now; }
  if (now - lastEnemy > enemyInterval) {
    const groupSize = gameState.difficulty >= 4 ? 1 + Math.floor(Math.random() * Math.min(3, gameState.difficulty - 2)) : 1;
    for (let k = 0; k < groupSize; k++) {
      setTimeout(() => { if (gameState.running) spawnEnemy(); }, k * 350);
    }
    lastEnemy = now;
  }

  // Eggs collection / cleanup
  for (let i = eggs.length - 1; i >= 0; i--) {
    const o = eggs[i];
    const dx = o.position.x - world.player.position.x;
    const dy = o.position.y - world.player.position.y;
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) {
      const golden = o.gameData.golden;
      const pts = (golden ? 50 : 10) * gameState.combo;
      gameState.score += pts;
      gameState.collected += 1;
      gameState.combo = Math.min(8, gameState.combo + 1);
      gameState.comboTimer = 2200;
      spawnParticle(o.position.x, o.position.y, golden ? '#ffd700' : '#fff5cc', golden ? 16 : 10);
      addPopup(o.position.x, o.position.y, '+' + pts, golden ? '#ffd700' : '#ffffff');
      if (golden) playGolden(); else playCollect();
      Composite.remove(world.engine.world, o);
      eggs.splice(i, 1);
      updateHUD();
    } else if (o.position.y > H() + 60) {
      Composite.remove(world.engine.world, o);
      eggs.splice(i, 1);
      if (gameState.combo > 1) { gameState.combo = 1; gameState.comboTimer = 0; updateHUD(); }
    }
  }

  // Powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const o = powerups[i];
    const dx = o.position.x - world.player.position.x;
    const dy = o.position.y - world.player.position.y;
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) {
      const t = o.gameData.type;
      playPowerUp();
      if (t === 'life') gameState.lives = Math.min(5, gameState.lives + 1);
      if (t === 'shield') activeEffects.shield = 6000;
      if (t === 'magnet') activeEffects.magnet = 5000;
      if (t === 'slow') activeEffects.slowTime = 4000;
      if (t === 'double') activeEffects.doubleJump = 6000;
      addPopup(o.position.x, o.position.y, t.toUpperCase(), '#00e5ff');
      updateHUD();
      Composite.remove(world.engine.world, o);
      powerups.splice(i, 1);
    } else if (o.position.y > H() + 60) {
      Composite.remove(world.engine.world, o);
      powerups.splice(i, 1);
    }
  }

  // Enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const o = enemies[i];
    const d = o.gameData;

    // Ground detection for jumpers
    const onGround = o.position.y + d.r >= H() - GROUND_H - 1 && Math.abs(o.velocity.y) < 1.2;
    if (onGround && !d.onGround) d.jumps = 0;
    d.onGround = onGround;

    // Jumper AI
    if (d.maxJumps > 0 && onGround && d.jumps < d.maxJumps) {
      const dx = world.player.position.x - o.position.x;
      const dy = world.player.position.y - o.position.y;
      if (Math.abs(dx) < d.chaseRange && Math.abs(dy) < 120 && now > d.nextJumpTime) {
        const jumpX = dx * 0.035;
        Body.setVelocity(o, { x: jumpX, y: -10 - Math.random() * 2 });
        d.jumps++;
        d.nextJumpTime = now + d.jumpCooldown;
      }
    }

    // Boss attack
    if (d.type === 'boss' && now > d.nextAttack) {
      spawnFallingObstacle();
      d.nextAttack = now + 1500;
    }

    // Movement
    if (d.type !== 'jumper' || onGround) {
      let vx = -d.speed;
      if (activeEffects.slowTime > 0) vx *= 0.5;
      if (d.type === 'dasher' && world.player.position.x < o.position.x) vx *= 1.4;
      Body.setVelocity(o, { x: vx, y: o.velocity.y });
    }
    d.walkPhase += 0.25;

    const edx = o.position.x - world.player.position.x;
    const edy = o.position.y - world.player.position.y;
    const hitDist = d.r + 22;
    if (Math.abs(edx) < hitDist && Math.abs(edy) < hitDist) {
      const stomping = world.player.velocity.y > 1 && world.player.position.y < o.position.y - d.r * 0.5;
      if (stomping) {
        const pts = d.type === 'boss' ? 100 : 25;
        gameState.score += pts;
        Body.setVelocity(world.player, { x: world.player.velocity.x, y: -9 });
        spawnParticle(o.position.x, o.position.y, d.color, d.type === 'boss' ? 28 : 14);
        addPopup(o.position.x, o.position.y, '+' + pts, d.color);
        playStomp();
        d.hp -= 1;
        if (d.hp <= 0) {
          if (d.type === 'boss') gameState.bossActive = false;
          Composite.remove(world.engine.world, o);
          enemies.splice(i, 1);
        }
        updateHUD();
      } else if (activeEffects.shield > 0) {
        activeEffects.shield = 0;
        spawnParticle(world.player.position.x, world.player.position.y, '#00e5ff', 18);
        Body.setVelocity(world.player, { x: 6, y: -5 });
        if (d.type !== 'boss') {
          Composite.remove(world.engine.world, o);
          enemies.splice(i, 1);
        }
      } else {
        spawnParticle(world.player.position.x, world.player.position.y, '#ff5555', 14);
        gameState.lives -= 1;
        gameState.combo = 1; gameState.comboTimer = 0;
        Body.setVelocity(world.player, { x: -8, y: -7 });
        playHurt();
        updateHUD();
        if (d.type !== 'tank' && d.type !== 'boss') {
          Composite.remove(world.engine.world, o);
          enemies.splice(i, 1);
        } else {
          Body.setVelocity(o, { x: d.speed, y: -4 });
        }
        if (gameState.lives <= 0) { gameOver(); return; }
      }
    } else if (o.position.x < -80) {
      if (d.type === 'boss') gameState.bossActive = false;
      Composite.remove(world.engine.world, o);
      enemies.splice(i, 1);
    }
  }

  // Falling obstacles
  if (now - lastFalling > 5000 - gameState.difficulty * 400 && fallingObstacles.length < 3) {
    spawnFallingObstacle();
    lastFalling = now;
  }
  for (let i = fallingObstacles.length - 1; i >= 0; i--) {
    const o = fallingObstacles[i];
    const dx = o.position.x - world.player.position.x;
    const dy = o.position.y - world.player.position.y;
    const hitDist = 28;
    if (Math.abs(dx) < hitDist && Math.abs(dy) < hitDist) {
      if (activeEffects.shield > 0) {
        activeEffects.shield = 0;
        spawnParticle(world.player.position.x, world.player.position.y, '#00e5ff', 18);
      } else {
        spawnParticle(world.player.position.x, world.player.position.y, '#ff5555', 12);
        gameState.lives -= 1;
        gameState.combo = 1; gameState.comboTimer = 0;
        playHurt();
        updateHUD();
        if (gameState.lives <= 0) { gameOver(); return; }
      }
      Composite.remove(world.engine.world, o);
      fallingObstacles.splice(i, 1);
    } else if (o.position.y > H() + 80) {
      Composite.remove(world.engine.world, o);
      fallingObstacles.splice(i, 1);
    }
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.gameData.life -= 1;
    if (b.gameData.life <= 0 || b.position.x < 0 || b.position.x > W() || b.position.y < 0 || b.position.y > H()) {
      Composite.remove(world.engine.world, b);
      bullets.splice(i, 1);
      continue;
    }
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const d = e.gameData;
      const dx = b.position.x - e.position.x;
      const dy = b.position.y - e.position.y;
      if (Math.abs(dx) < d.r && Math.abs(dy) < d.r) {
        d.hp -= 1;
        spawnExplosion(b.position.x, b.position.y, d.type === 'boss' ? '#7c4dff' : '#ff9800', 16);
        playExplosion();
        Composite.remove(world.engine.world, b);
        bullets.splice(i, 1);
        if (d.hp <= 0) {
          gameState.score += d.type === 'boss' ? 100 : 25;
          if (d.type === 'boss') gameState.bossActive = false;
          Composite.remove(world.engine.world, e);
          enemies.splice(j, 1);
        } else {
          Body.setVelocity(e, { x: e.velocity.x, y: -3 });
        }
        updateHUD();
        break;
      }
    }
  }

  // Explosions life
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    ex.life -= 0.03;
    for (const bit of ex.bits) {
      bit.x += bit.vx;
      bit.y += bit.vy;
      bit.vy += 0.15;
      bit.life -= 0.03;
    }
    ex.bits = ex.bits.filter(b => b.life > 0);
    if (ex.life <= 0 || ex.bits.length === 0) explosions.splice(i, 1);
  }

  // Particles life
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].life -= 0.04;
    if (particles[i].life <= 0) {
      Composite.remove(world.engine.world, particles[i].body);
      particles.splice(i, 1);
    }
  }

  // Popups
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].y += popups[i].vy;
    popups[i].life -= 0.018;
    if (popups[i].life <= 0) popups.splice(i, 1);
  }
}

function sectorFromX(x) {
  const rect = stage.getBoundingClientRect();
  const rx = (x - rect.left) / rect.width;
  if (rx < 0.34) return -1;
  if (rx > 0.66) return 1;
  return 0;
}

function recomputeTouch() {
  let dir = 0;
  for (const s of pointers.values()) { if (s === -1) dir = -1; else if (s === 1) dir = 1; }
  touchDir = dir;
}

function endPtr(e) {
  pointers.delete(e.pointerId);
  recomputeTouch();
}

export function initLogic() {
  startIntroBtn.addEventListener('click', () => { introEl.classList.remove('show'); startGame(); tryPlay(); });
  retryBtn.addEventListener('click', () => { reset(); introEl.classList.remove('show'); startGame(); tryPlay(); });

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (k === 'w' || k === 'arrowup' || k === ' ') { tryJump(); }
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });

  const canvas = world.render.canvas;
  canvas.addEventListener('pointerdown', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (e.button === 0) { mouse.down = true; shootIfReady(); }
  });
  canvas.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('pointerup', () => mouse.down = false);
  canvas.addEventListener('pointerleave', () => mouse.down = false);

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      mouse.x = e.clientX; mouse.y = e.clientY;
      if (e.button === 0) { mouse.down = true; shootIfReady(); }
      return;
    }
    if (!gameState.running) return;
    pointers.set(e.pointerId, sectorFromX(e.clientX));
    const s = sectorFromX(e.clientX);
    if (s === 0) { tryJump(); touchJumpQueued = true; }
    else touchDir = s;
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; return; }
    if (!pointers.has(e.pointerId)) return;
    const s = sectorFromX(e.clientX);
    pointers.set(e.pointerId, s);
  });
  stage.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') { mouse.down = false; return; }
    endPtr(e);
  });
  stage.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') { mouse.down = false; return; }
    endPtr(e);
  });
  stage.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'mouse') { mouse.down = false; return; }
    endPtr(e);
  });

  muteBtn.addEventListener('click', () => {
    const wasMuted = isMuted();
    setMuted(!wasMuted);
    if (!wasMuted) stopMusic(); else startMusic();
    muteBtn.textContent = !wasMuted ? '🔇' : '🔊';
  });

  Events.on(world.engine, 'beforeUpdate', beforeUpdate);

  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('mousedown', (e) => { if (e.button === 0) { mouse.down = true; shootIfReady(); } });
  window.addEventListener('mouseup', () => mouse.down = false);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  setTimeout(resize, 50);

  updateHUD();
}
