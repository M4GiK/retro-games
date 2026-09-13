// Logika gry: HUD, przebieg rundy, pętla beforeUpdate.
import * as Matter from 'matter-js';
import {
  GROUND_H, world, gameState, activeEffects,
  eggs, enemies, fallingObstacles, powerups, particles, popups, W, H,
} from './state';
import {
  spawnEgg, spawnEnemy, spawnFallingObstacle, spawnPowerup, spawnBoss,
  spawnParticle, addPopup, clearEntities, resetPlayer,
} from './physics';
import { getMoveDir, clearInput, initInput } from './input';
import {
  initMusic, tryPlay, stopAllMusic, setMuted, isMuted,
  playJump, playCollect, playGolden, playStomp, playHurt, playGameOver,
  playLevelUp, playPowerUp, playBoss,
} from './audio';
import { handleGameOver } from './menu';
import type { PlayerData, EggData, EnemyData, PowerupData, GameMode } from './types';

const { Events, Body, Composite } = Matter;

// Skrót do getElementById z rzutowaniem na konkretny typ elementu.
function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const stage = el<HTMLElement>('stage');
const muteBtn = el<HTMLButtonElement>('mute');
const musicEl = document.getElementById('bgMusic') as HTMLAudioElement | null;

// Timery spawnów — resetowane na starcie rundy do bieżącego timestampu,
// żeby czas spędzony na ekranie intro nie powodował natychmiastowych spawnów.
let lastEgg = 0, lastEnemy = 0, lastFalling = 0, lastPowerup = 0, lastLevelUp = 0;
// Poziom trudności, dla którego boss już się pojawił (spawn raz na poziom).
let bossSpawnedAt = 0;
let currentMode: GameMode = 'normal';

const playerData = () => world.player.gameData as PlayerData;

// Strojenie grywalności pod świat 256×240
const MOVE_SPEED = 3.2;
const JUMP_VELOCITY = -10;
const STOMP_BOUNCE = -8;
const KNOCKBACK_X = 5.5;
const PLAYER_R = 14;


// Rozpoczyna nową rundę w danym trybie. 'hard' = start na poziomie 4
// (natychmiast boss + grupy wrogów).
export function startGame(mode: GameMode = 'normal') {
  currentMode = mode;
  gameState.running = true;
  gameState.score = 0; gameState.lives = 3; gameState.collected = 0;
  gameState.combo = 1; gameState.comboTimer = 0;
  gameState.difficulty = mode === 'hard' ? 4 : 1;
  gameState.bossActive = false;
  activeEffects.shield = 0; activeEffects.magnet = 0;
  activeEffects.slowTime = 0; activeEffects.doubleJump = 0;
  const now = world.engine.timing.timestamp;
  lastEgg = lastEnemy = lastFalling = lastPowerup = lastLevelUp = now;
  bossSpawnedAt = 0;
  clearInput();
  resetPlayer();
  clearEntities();
}

// Kończy rundę: stop muzyki, jingle przegranej i ekran rekordu/game over.
export function gameOver() {
  gameState.running = false;
  clearInput();
  stopAllMusic();
  playGameOver();
  handleGameOver(gameState.score, gameState.collected);
}

// Skok gracza: dozwolony do maxJumps (2 bazowo, +1 przy efekcie double).
// Każdy kolejny skok to osobny "podkop" — stąd licznik jumps.
export function tryJump() {
  if (!gameState.running) return;
  const d = playerData();
  const maxJumps = d.maxJumps + (activeEffects.doubleJump > 0 ? 1 : 0);
  if (d.jumps < maxJumps) {
    Body.setVelocity(world.player, { x: world.player.velocity.x, y: JUMP_VELOCITY });
    d.jumps++;
    d.squash = 1;
    spawnParticle(world.player.position.x, world.player.position.y + PLAYER_R, d.jumps >= d.maxJumps ? '#00e5ff' : '#ffffff', 6);
    playJump();
  }
}

// Korekta anty-zapadania: gdy ciało przebije ziemię, cofamy je na powierzchnię
// i zerujemy opadanie (zabezpieczenie na silne uderzenia/wąskie okna kolizji).
function keepAboveGround(body: Matter.Body, r: number) {
  const limit = H() - GROUND_H - r;
  if (body.position.y > limit + 1) {
    Body.setPosition(body, { x: body.position.x, y: limit });
    Body.setVelocity(body, { x: body.velocity.x, y: Math.min(0, body.velocity.y) });
  }
}

// Główna pętla gry (60 Hz, przed krokiem fizyki): sterowanie, kolizje
// grywalnościowe, spawny encji, skalowanie trudności, cząsteczki i popupy.
function beforeUpdate() {
  if (!gameState.running) return;
  const now = world.engine.timing.timestamp;
  const player = world.player;
  const d = playerData();

  // Anty-zapadanie: jajka, power-upy i przeszkody nie mogą przebić ziemi
  eggs.forEach(o => keepAboveGround(o, 8));
  powerups.forEach(o => keepAboveGround(o, 12));
  fallingObstacles.forEach(o => keepAboveGround(o, 10));

  // Ruch poziomy
  const dir = getMoveDir();
  if (dir !== 0) {
    d.facing = dir;
    Body.setVelocity(player, { x: dir * MOVE_SPEED, y: player.velocity.y });
    if (d.onGround) d.walkPhase += 0.35;
  } else if (d.onGround) {
    Body.setVelocity(player, { x: player.velocity.x * 0.7, y: player.velocity.y });
  }

  // Wykrywanie ziemi
  const onGround = player.position.y + PLAYER_R >= H() - GROUND_H - 1 && Math.abs(player.velocity.y) < 1.2;
  if (onGround && !d.onGround) {
    if (d.jumps > 0) spawnParticle(player.position.x, player.position.y + PLAYER_R, '#dust', 5);
    d.squash = 0.6;
  }
  d.onGround = onGround;
  if (onGround) d.jumps = 0;

  // Anty-bug: gracz nie może zapaść się pod ziemię
  const groundY = H() - GROUND_H - PLAYER_R;
  if (player.position.y > groundY + 2) {
    Body.setPosition(player, { x: player.position.x, y: groundY });
    Body.setVelocity(player, { x: player.velocity.x, y: Math.min(0, player.velocity.y) });
    d.onGround = true;
    d.jumps = 0;
  }

  // Zanikanie spłaszczenia
  d.squash *= 0.85;

  // Timer combo
  if (gameState.comboTimer > 0) {
    gameState.comboTimer -= 16.6;
    if (gameState.comboTimer <= 0) { gameState.combo = 1; }
  }

  // Timery aktywnych efektów
  for (const k of Object.keys(activeEffects) as (keyof typeof activeEffects)[]) {
    if (activeEffects[k] > 0) {
      activeEffects[k] -= 16.6;
      if (activeEffects[k] <= 0) activeEffects[k] = 0;
    }
  }

  // Magnes przyciąga jajka
  if (activeEffects.magnet > 0) {
    for (const e of eggs) {
      const dx = player.position.x - e.position.x;
      const dy = player.position.y - e.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 90 && dist > 14) {
        Body.setVelocity(e, { x: e.velocity.x + dx / dist * 0.6, y: e.velocity.y + dy / dist * 0.6 });
      }
    }
  }

  // Spawn power-upów
  if (now - lastPowerup > 12000 && powerups.length < 1) {
    spawnPowerup();
    lastPowerup = now;
  }

  // Boss co 4 poziomy trudności — dokładnie raz na dany poziom
  if (gameState.difficulty % 4 === 0 && !gameState.bossActive && bossSpawnedAt !== gameState.difficulty) {
    spawnBoss();
    bossSpawnedAt = gameState.difficulty;
    playBoss();
  }

  // Skalowanie trudności
  if (now - lastLevelUp > 10000) {
    gameState.difficulty = Math.min(8, gameState.difficulty + 1);
    lastLevelUp = now;
    playLevelUp();
  }

  // Spawn encji
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

  // Zbieranie jajek / czyszczenie
  for (let i = eggs.length - 1; i >= 0; i--) {
    const o = eggs[i];
    const dx = o.position.x - player.position.x;
    const dy = o.position.y - player.position.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      const eg = o.gameData as EggData;
      const pts = (eg.golden ? 50 : 10) * gameState.combo;
      gameState.score += pts;
      gameState.collected += 1;
      gameState.combo = Math.min(8, gameState.combo + 1);
      gameState.comboTimer = 2200;
      spawnParticle(o.position.x, o.position.y, eg.golden ? '#ffd700' : '#fff5cc', eg.golden ? 16 : 10);
      addPopup(o.position.x, o.position.y, '+' + pts, eg.golden ? '#ffd700' : '#ffffff');
      if (eg.golden) playGolden(); else playCollect();
      Composite.remove(world.engine.world, o);
      eggs.splice(i, 1);
    } else if (o.position.y > H() + 60) {
      Composite.remove(world.engine.world, o);
      eggs.splice(i, 1);
      if (gameState.combo > 1) { gameState.combo = 1; gameState.comboTimer = 0; }
    }
  }

  // Power-upy
  for (let i = powerups.length - 1; i >= 0; i--) {
    const o = powerups[i];
    const dx = o.position.x - player.position.x;
    const dy = o.position.y - player.position.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      const t = (o.gameData as PowerupData).type;
      playPowerUp();
      if (t === 'life') gameState.lives = Math.min(5, gameState.lives + 1);
      if (t === 'shield') activeEffects.shield = 6000;
      if (t === 'magnet') activeEffects.magnet = 5000;
      if (t === 'slow') activeEffects.slowTime = 4000;
      if (t === 'double') activeEffects.doubleJump = 6000;
      addPopup(o.position.x, o.position.y, t.toUpperCase(), '#00e5ff');
      Composite.remove(world.engine.world, o);
      powerups.splice(i, 1);
    } else if (o.position.y > H() + 60) {
      Composite.remove(world.engine.world, o);
      powerups.splice(i, 1);
    }
  }

  // Wrogowie (lisy)
  for (let i = enemies.length - 1; i >= 0; i--) {
    const o = enemies[i];
    const ed = o.gameData as EnemyData;

    // Wykrywanie ziemi dla skoczków
    const eOnGround = o.position.y + ed.r >= H() - GROUND_H - 1 && Math.abs(o.velocity.y) < 1.2;
    if (eOnGround && !ed.onGround) ed.jumps = 0;
    ed.onGround = eOnGround;

    // AI skoczka: doskakuje do gracza w zasięgu
    if (ed.maxJumps > 0 && eOnGround && ed.jumps < ed.maxJumps) {
      const dx = player.position.x - o.position.x;
      const dy = player.position.y - o.position.y;
      if (Math.abs(dx) < ed.chaseRange && Math.abs(dy) < 120 && now > ed.nextJumpTime) {
        Body.setVelocity(o, { x: dx * 0.035, y: -10 - Math.random() * 2 });
        ed.facing = dx >= 0 ? 1 : -1;
        ed.jumps++;
        ed.nextJumpTime = now + ed.jumpCooldown;
      }
    }

    // Atak bossa: spadające przeszkody
    if (ed.type === 'boss' && now > ed.nextAttack) {
      spawnFallingObstacle();
      ed.nextAttack = now + 1500;
    }

    // Ruch
    if (ed.type !== 'jumper' || eOnGround) {
      let vx = -ed.speed;
      if (activeEffects.slowTime > 0) vx *= 0.5;
      if (ed.type === 'dasher' && player.position.x < o.position.x) vx *= 1.4;
      Body.setVelocity(o, { x: vx, y: o.velocity.y });
      ed.facing = vx < 0 ? -1 : 1;
    }
    ed.walkPhase += 0.25;

    const edx = o.position.x - player.position.x;
    const edy = o.position.y - player.position.y;
    const hitDist = ed.r + PLAYER_R;
    if (Math.abs(edx) < hitDist && Math.abs(edy) < hitDist) {
      const stomping = player.velocity.y > 1 && player.position.y < o.position.y - ed.r * 0.5;
      if (stomping) {
        const pts = ed.type === 'boss' ? 100 : 25;
        gameState.score += pts;
        Body.setVelocity(player, { x: player.velocity.x, y: STOMP_BOUNCE });
        spawnParticle(o.position.x, o.position.y, ed.color, ed.type === 'boss' ? 28 : 14);
        addPopup(o.position.x, o.position.y, '+' + pts, ed.color);
        playStomp();
        ed.hp -= 1;
        if (ed.hp <= 0) {
          if (ed.type === 'boss') gameState.bossActive = false;
          Composite.remove(world.engine.world, o);
          enemies.splice(i, 1);
        }
      } else if (activeEffects.shield > 0) {
        activeEffects.shield = 0;
        spawnParticle(player.position.x, player.position.y, '#00e5ff', 18);
        Body.setVelocity(player, { x: edx > 0 ? -6 : 6, y: -5 });
        if (ed.type !== 'boss') {
          Composite.remove(world.engine.world, o);
          enemies.splice(i, 1);
        }
      } else {
        spawnParticle(player.position.x, player.position.y, '#ff5555', 14);
        gameState.lives -= 1;
        gameState.combo = 1; gameState.comboTimer = 0;
        // Odrzut w stronę przeciwną do wroga
        Body.setVelocity(player, { x: edx > 0 ? -KNOCKBACK_X : KNOCKBACK_X, y: -6 });
        playHurt();
        if (ed.type !== 'tank' && ed.type !== 'boss') {
          Composite.remove(world.engine.world, o);
          enemies.splice(i, 1);
        } else {
          Body.setVelocity(o, { x: ed.speed, y: -4 });
        }
        if (gameState.lives <= 0) { gameOver(); return; }
      }
    } else if (o.position.x < -80 || o.position.x > W() + 120) {
      if (ed.type === 'boss') gameState.bossActive = false;
      Composite.remove(world.engine.world, o);
      enemies.splice(i, 1);
    }
  }

  // Spadające przeszkody
  if (now - lastFalling > 5000 - gameState.difficulty * 400 && fallingObstacles.length < 3) {
    spawnFallingObstacle();
    lastFalling = now;
  }
  for (let i = fallingObstacles.length - 1; i >= 0; i--) {
    const o = fallingObstacles[i];
    const dx = o.position.x - player.position.x;
    const dy = o.position.y - player.position.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      if (activeEffects.shield > 0) {
        activeEffects.shield = 0;
        spawnParticle(player.position.x, player.position.y, '#00e5ff', 18);
      } else {
        spawnParticle(player.position.x, player.position.y, '#ff5555', 12);
        gameState.lives -= 1;
        gameState.combo = 1; gameState.comboTimer = 0;
        playHurt();
        if (gameState.lives <= 0) { gameOver(); return; }
      }
      Composite.remove(world.engine.world, o);
      fallingObstacles.splice(i, 1);
    } else if (o.position.y > H() + 80) {
      Composite.remove(world.engine.world, o);
      fallingObstacles.splice(i, 1);
    }
  }

  // Życie cząsteczek
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].life -= 0.04;
    if (particles[i].life <= 0) {
      Composite.remove(world.engine.world, particles[i].body);
      particles.splice(i, 1);
    }
  }

  // Wyskakujące punkty
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].y += popups[i].vy;
    popups[i].life -= 0.018;
    if (popups[i].life <= 0) popups.splice(i, 1);
  }
}

// Podpina moduły: wejście (klawiatura+pad), przycisk mute i pętlę gry.
export function initLogic() {
  if (musicEl) initMusic(musicEl);

  initInput(stage, () => gameState.running, { onJump: tryJump });

  muteBtn.addEventListener('click', async () => {
    const m = !isMuted();
    setMuted(m);
    if (musicEl) musicEl.muted = m;
    muteBtn.textContent = m ? '🔇' : '🔊';
    if (!m) await tryPlay();
  });

  Events.on(world.engine, 'beforeUpdate', beforeUpdate);

}
