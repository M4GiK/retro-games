/**
 * Kontroler rozgrywki — pętla gry i zasady rundy.
 *
 * Klasa Game jest "mózgiem" sesji: podpięta pod zdarzenie beforeUpdate
 * silnika (wzorzec Obserwator na Matter.Events) orkiestruje co klatkę
 * całą mechanikę — sterowanie, wykrywanie ziemi, timery efektów,
 * spawny, kolizje grywalnościowe i czyszczenie encji.
 *
 * Każda klatka przechodzi sekwencyjnie przez prywatne systemy-update:
 *   fizyka pomocnicza → gracz → timery → magnes → spawny →
 *   zbieranie → wrogowie → przeszkody → cząsteczki → popupy.
 * Zależności (wejście, audio, fabryka, ekrany) są wstrzykiwane
 * przez konstruktor — wzorzec Dependency Injection.
 */
import * as Matter from 'matter-js';
import {
  GROUND_H, W, H, PLAYER_R, MOVE_SPEED, JUMP_VELOCITY, STOMP_BOUNCE, KNOCKBACK_X,
  START_LIVES, MAX_LIVES, MAX_COMBO, COMBO_WINDOW_MS,
  MAX_DIFFICULTY, DIFFICULTY_STEP_MS, BOSS_EVERY_LEVELS,
  EGG_MAX, FALLING_MAX, POWERUP_MAX, POWERUP_INTERVAL_MS,
} from '../core/config';
import { gameState, activeEffects, eggs, enemies, fallingObstacles, powerups, particles, popups } from '../core/state';
import { physics } from '../engine/physics';
import type { EntityFactory } from '../engine/factory';
import type { InputManager } from './input';
import type { AudioSystem } from '../audio/audio';
import type { PlayerData, EggData, EnemyData, PowerupData, GameMode } from '../core/types';

const { Events, Body, Composite } = Matter;

/** Callbacki zewnętrzne gry — zakończenie rundy delegowane do warstwy UI. */
export interface GameDeps {
  onGameOver: (score: number, eggsCollected: number) => void;
}

export class Game {
  // Timery spawnów — resetowane na starcie rundy do bieżącego timestampu,
  // żeby czas spędzony na ekranie intro nie powodował natychmiastowych spawnów.
  private lastEgg = 0;
  private lastEnemy = 0;
  private lastFalling = 0;
  private lastPowerup = 0;
  private lastLevelUp = 0;
  /** Poziom trudności, dla którego boss już się pojawił (spawn raz na poziom). */
  private bossSpawnedAt = 0;
  private currentMode: GameMode = 'normal';

  constructor(
    private readonly input: InputManager,
    private readonly audio: AudioSystem,
    private readonly factory: EntityFactory,
    private readonly deps: GameDeps,
  ) {}

  /** Skrót do danych grywalnościowych ciała gracza. */
  private get playerData(): PlayerData {
    return physics.player.gameData as PlayerData;
  }

  /** Podpina pętlę gry pod zdarzenie beforeUpdate silnika (60 Hz). */
  init(): void {
    Events.on(physics.engine, 'beforeUpdate', () => this.update());
  }

  /**
   * Rozpoczyna nową rundę w danym trybie. 'hard' = start na poziomie 4
   * (natychmiast boss + grupy wrogów).
   */
  start(mode: GameMode = 'normal'): void {
    this.currentMode = mode;
    gameState.running = true;
    gameState.score = 0;
    gameState.lives = START_LIVES;
    gameState.collected = 0;
    gameState.combo = 1;
    gameState.comboTimer = 0;
    gameState.difficulty = mode === 'hard' ? 4 : 1;
    gameState.bossActive = false;
    activeEffects.shield = 0;
    activeEffects.magnet = 0;
    activeEffects.slowTime = 0;
    activeEffects.doubleJump = 0;
    const now = physics.now;
    this.lastEgg = this.lastEnemy = this.lastFalling = this.lastPowerup = this.lastLevelUp = now;
    this.bossSpawnedAt = 0;
    this.input.clear();
    physics.resetPlayer();
    physics.clearEntities();
  }

  /** Kończy rundę: stop muzyki, jingle przegranej i ekran rekordu/game over. */
  gameOver(): void {
    gameState.running = false;
    this.input.clear();
    this.audio.stopAllMusic();
    this.audio.playGameOver();
    this.deps.onGameOver(gameState.score, gameState.collected);
  }

  /**
   * Skok gracza: dozwolony do maxJumps (2 bazowo, +1 przy efekcie double).
   * Każdy kolejny skok to osobny "podkop" — stąd licznik jumps.
   */
  tryJump(): void {
    if (!gameState.running) return;
    const d = this.playerData;
    const maxJumps = d.maxJumps + (activeEffects.doubleJump > 0 ? 1 : 0);
    if (d.jumps < maxJumps) {
      Body.setVelocity(physics.player, { x: physics.player.velocity.x, y: JUMP_VELOCITY });
      d.jumps++;
      d.squash = 1;
      this.factory.spawnParticles(
        physics.player.position.x,
        physics.player.position.y + PLAYER_R,
        d.jumps >= d.maxJumps ? '#00e5ff' : '#ffffff',
        6,
      );
      this.audio.playJump();
    }
  }

  /**
   * Główna pętla gry (60 Hz, przed krokiem fizyki). Kolejność kroków
   * ma znaczenie — np. spawny przed kolizjami, żeby nowe encje
   * od razu uczestniczyły w rozgrywce.
   */
  private update(): void {
    if (!gameState.running) return;
    const now = physics.now;

    this.fixEntitiesAboveGround();
    this.updatePlayer();
    this.updateTimers();
    this.applyMagnet();
    this.updateSpawning(now);
    this.collectEggs();
    this.collectPowerups();
    this.updateEnemies(now);
    if (!gameState.running) return; // wróg mógł zadać ostatnie trafienie
    this.updateObstacles(now);
    if (!gameState.running) return;
    this.updateParticles();
    this.updatePopups();
  }

  /**
   * Korekta anty-zapadania: gdy ciało przebije ziemię, cofamy je na
   * powierzchnię i zerujemy opadanie (zabezpieczenie na silne uderzenia
   * i wąskie okna kolizji).
   */
  private keepAboveGround(body: Matter.Body, r: number): void {
    const limit = H() - GROUND_H - r;
    if (body.position.y > limit + 1) {
      Body.setPosition(body, { x: body.position.x, y: limit });
      Body.setVelocity(body, { x: body.velocity.x, y: Math.min(0, body.velocity.y) });
    }
  }

  /** Jajka, power-upy i przeszkody nie mogą przebić ziemi. */
  private fixEntitiesAboveGround(): void {
    eggs.forEach(o => this.keepAboveGround(o, 8));
    powerups.forEach(o => this.keepAboveGround(o, 12));
    fallingObstacles.forEach(o => this.keepAboveGround(o, 10));
  }

  /**
   * Sterowanie graczem: ruch poziomy z inercją, wykrywanie ziemi
   * (reset licznika skoków + efekt lądowania), korekta anty-zapadania
   * i zanikanie spłaszczenia po skokach.
   */
  private updatePlayer(): void {
    const player = physics.player;
    const d = this.playerData;

    // Ruch poziomy
    const dir = this.input.getMoveDir();
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
      if (d.jumps > 0) this.factory.spawnParticles(player.position.x, player.position.y + PLAYER_R, '#dust', 5);
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
  }

  /** Odlicza timer combo i czasy trwania aktywnych efektów power-upów. */
  private updateTimers(): void {
    if (gameState.comboTimer > 0) {
      gameState.comboTimer -= 16.6;
      if (gameState.comboTimer <= 0) gameState.combo = 1;
    }

    for (const k of Object.keys(activeEffects) as (keyof typeof activeEffects)[]) {
      if (activeEffects[k] > 0) {
        activeEffects[k] -= 16.6;
        if (activeEffects[k] <= 0) activeEffects[k] = 0;
      }
    }
  }

  /** Aktywny magnes przyciąga jajka w promieniu ~90 px do gracza. */
  private applyMagnet(): void {
    if (activeEffects.magnet <= 0) return;
    const player = physics.player;
    for (const e of eggs) {
      const dx = player.position.x - e.position.x;
      const dy = player.position.y - e.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 90 && dist > 14) {
        Body.setVelocity(e, { x: e.velocity.x + dx / dist * 0.6, y: e.velocity.y + dy / dist * 0.6 });
      }
    }
  }

  /**
   * Spawny sterowane czasem: power-upy, boss co 4 poziomy, skalowanie
   * trudności co 10 s oraz strumień jajek i grup wrogów (interwały
   * kurczą się wraz z poziomem trudności).
   */
  private updateSpawning(now: number): void {
    // Power-upy — rzadkie, max 1 na planszy
    if (now - this.lastPowerup > POWERUP_INTERVAL_MS && powerups.length < POWERUP_MAX) {
      this.factory.spawnPowerup();
      this.lastPowerup = now;
    }

    // Boss co 4 poziomy trudności — dokładnie raz na dany poziom
    if (gameState.difficulty % BOSS_EVERY_LEVELS === 0 && !gameState.bossActive && this.bossSpawnedAt !== gameState.difficulty) {
      this.factory.spawnBoss();
      this.bossSpawnedAt = gameState.difficulty;
      this.audio.playBoss();
    }

    // Skalowanie trudności
    if (now - this.lastLevelUp > DIFFICULTY_STEP_MS) {
      gameState.difficulty = Math.min(MAX_DIFFICULTY, gameState.difficulty + 1);
      this.lastLevelUp = now;
      this.audio.playLevelUp();
    }

    // Jajka — interwał kurczy się z trudnością, limit sztuk na planszy
    const eggInterval = Math.max(350, 650 - gameState.difficulty * 40);
    if (now - this.lastEgg > eggInterval && eggs.length < EGG_MAX) {
      this.factory.spawnEgg();
      this.lastEgg = now;
    }

    // Wrogowie — od poziomu 4 wpadają grupami (co 350 ms kolejny lis)
    const enemyInterval = Math.max(500, 1700 - gameState.difficulty * 150);
    if (now - this.lastEnemy > enemyInterval) {
      const groupSize = gameState.difficulty >= 4 ? 1 + Math.floor(Math.random() * Math.min(3, gameState.difficulty - 2)) : 1;
      for (let k = 0; k < groupSize; k++) {
        setTimeout(() => { if (gameState.running) this.factory.spawnEnemy(); }, k * 350);
      }
      this.lastEnemy = now;
    }
  }

  /**
   * Zbieranie jajek: punkty z mnożnikiem combo (złote 5x), cząsteczki,
   * popup i dźwięk. Jajko, które spadnie poza ekran, przerywa combo.
   */
  private collectEggs(): void {
    const player = physics.player;
    for (let i = eggs.length - 1; i >= 0; i--) {
      const o = eggs[i];
      const dx = o.position.x - player.position.x;
      const dy = o.position.y - player.position.y;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
        const eg = o.gameData as EggData;
        const pts = (eg.golden ? 50 : 10) * gameState.combo;
        gameState.score += pts;
        gameState.collected += 1;
        gameState.combo = Math.min(MAX_COMBO, gameState.combo + 1);
        gameState.comboTimer = COMBO_WINDOW_MS;
        this.factory.spawnParticles(o.position.x, o.position.y, eg.golden ? '#ffd700' : '#fff5cc', eg.golden ? 16 : 10);
        this.factory.addPopup(o.position.x, o.position.y, '+' + pts, eg.golden ? '#ffd700' : '#ffffff');
        if (eg.golden) this.audio.playGolden(); else this.audio.playCollect();
        Composite.remove(physics.engine.world, o);
        eggs.splice(i, 1);
      } else if (o.position.y > H() + 60) {
        Composite.remove(physics.engine.world, o);
        eggs.splice(i, 1);
        if (gameState.combo > 1) { gameState.combo = 1; gameState.comboTimer = 0; }
      }
    }
  }

  /**
   * Zbieranie power-upów — mapowanie typu na efekt (wzorzec Strategia
   * w wersji tablicowej): life=+1 życie, shield/magnet/slow/double
   * ustawiają czas trwania odpowiedniego efektu.
   */
  private collectPowerups(): void {
    const player = physics.player;
    for (let i = powerups.length - 1; i >= 0; i--) {
      const o = powerups[i];
      const dx = o.position.x - player.position.x;
      const dy = o.position.y - player.position.y;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        const t = (o.gameData as PowerupData).type;
        this.audio.playPowerUp();
        if (t === 'life') gameState.lives = Math.min(MAX_LIVES, gameState.lives + 1);
        if (t === 'shield') activeEffects.shield = 6000;
        if (t === 'magnet') activeEffects.magnet = 5000;
        if (t === 'slow') activeEffects.slowTime = 4000;
        if (t === 'double') activeEffects.doubleJump = 6000;
        this.factory.addPopup(o.position.x, o.position.y, t.toUpperCase(), '#00e5ff');
        Composite.remove(physics.engine.world, o);
        powerups.splice(i, 1);
      } else if (o.position.y > H() + 60) {
        Composite.remove(physics.engine.world, o);
        powerups.splice(i, 1);
      }
    }
  }

  /**
   * Wrogowie (lisy): detekcja ziemi, AI skoczka doskakującego do gracza,
   * atak bossa (zrzut przeszkód), marsz w lewo z modyfikatorami efektów,
   * a na końcu rozstrzygnięcie kolizji z graczem:
   *  - skok na łeb = punkty i obrażenie wroga,
   *  - aktywna tarcza = amortyzuje trafienie,
   *  - w przeciwnym razie strata życia + odrzut.
   */
  private updateEnemies(now: number): void {
    const player = physics.player;
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
        this.factory.spawnFallingObstacle();
        ed.nextAttack = now + 1500;
      }

      // Ruch — skoczek steruje sobą tylko w powietrzu, reszta maszeruje w lewo;
      // slowTime zwalnia wszystkich, dasher przyspiesza gdy gracz jest z lewej
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
          this.factory.spawnParticles(o.position.x, o.position.y, ed.color, ed.type === 'boss' ? 28 : 14);
          this.factory.addPopup(o.position.x, o.position.y, '+' + pts, ed.color);
          this.audio.playStomp();
          ed.hp -= 1;
          if (ed.hp <= 0) {
            if (ed.type === 'boss') gameState.bossActive = false;
            Composite.remove(physics.engine.world, o);
            enemies.splice(i, 1);
          }
        } else if (activeEffects.shield > 0) {
          activeEffects.shield = 0;
          this.factory.spawnParticles(player.position.x, player.position.y, '#00e5ff', 18);
          Body.setVelocity(player, { x: edx > 0 ? -6 : 6, y: -5 });
          if (ed.type !== 'boss') {
            Composite.remove(physics.engine.world, o);
            enemies.splice(i, 1);
          }
        } else {
          this.factory.spawnParticles(player.position.x, player.position.y, '#ff5555', 14);
          gameState.lives -= 1;
          gameState.combo = 1;
          gameState.comboTimer = 0;
          // Odrzut w stronę przeciwną do wroga
          Body.setVelocity(player, { x: edx > 0 ? -KNOCKBACK_X : KNOCKBACK_X, y: -6 });
          this.audio.playHurt();
          if (ed.type !== 'tank' && ed.type !== 'boss') {
            Composite.remove(physics.engine.world, o);
            enemies.splice(i, 1);
          } else {
            // Tank i boss nie giną od kontaktu — tylko się odbijają
            Body.setVelocity(o, { x: ed.speed, y: -4 });
          }
          if (gameState.lives <= 0) { this.gameOver(); return; }
        }
      } else if (o.position.x < -80 || o.position.x > W() + 120) {
        if (ed.type === 'boss') gameState.bossActive = false;
        Composite.remove(physics.engine.world, o);
        enemies.splice(i, 1);
      }
    }
  }

  /**
   * Spadające przeszkody: spawn sterowany trudnością (interwał kurczy się
   * z poziomem) oraz rozstrzyganie trafień gracza (tarcza amortyzuje,
   * inaczej strata życia).
   */
  private updateObstacles(now: number): void {
    if (now - this.lastFalling > 5000 - gameState.difficulty * 400 && fallingObstacles.length < FALLING_MAX) {
      this.factory.spawnFallingObstacle();
      this.lastFalling = now;
    }
    const player = physics.player;
    for (let i = fallingObstacles.length - 1; i >= 0; i--) {
      const o = fallingObstacles[i];
      const dx = o.position.x - player.position.x;
      const dy = o.position.y - player.position.y;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        if (activeEffects.shield > 0) {
          activeEffects.shield = 0;
          this.factory.spawnParticles(player.position.x, player.position.y, '#00e5ff', 18);
        } else {
          this.factory.spawnParticles(player.position.x, player.position.y, '#ff5555', 12);
          gameState.lives -= 1;
          gameState.combo = 1;
          gameState.comboTimer = 0;
          this.audio.playHurt();
          if (gameState.lives <= 0) { this.gameOver(); return; }
        }
        Composite.remove(physics.engine.world, o);
        fallingObstacles.splice(i, 1);
      } else if (o.position.y > H() + 80) {
        Composite.remove(physics.engine.world, o);
        fallingObstacles.splice(i, 1);
      }
    }
  }

  /** Wygaszanie cząsteczek — po life <= 0 ciało wraca do puli świata. */
  private updateParticles(): void {
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].life -= 0.04;
      if (particles[i].life <= 0) {
        Composite.remove(physics.engine.world, particles[i].body);
        particles.splice(i, 1);
      }
    }
  }

  /** Unoszenie i zanikanie wyskakujących punktów. */
  private updatePopups(): void {
    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].y += popups[i].vy;
      popups[i].life -= 0.018;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
  }
}
