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
  FALL_EXTRA_G, MAX_FALL_SPEED, JUMP_CUT, COYOTE_MS, JUMP_BUFFER_MS,
  MOVE_ACCEL_GROUND, MOVE_ACCEL_AIR, INVULN_MS, LEVEL_CLEAR_PTS,
  START_LIVES, MAX_LIVES, EXTRA_LIFE_FIRST, EXTRA_LIFE_SECOND, EXTRA_LIFE_GROWTH,
  MAX_COMBO, COMBO_WINDOW_MS, GAMEOVER_DELAY_MS,
  MAX_DIFFICULTY, DIFFICULTY_STEP_MS, BOSS_EVERY_LEVELS,
  EGG_MAX, FALLING_MAX, POWERUP_MAX, POWERUP_INTERVAL_MS,
  NIGHTMARE_LEN, FOX_START_DELAY_MS, FOX_KILLS_PER_STEP,
  BOSS_LEVEL_EVERY, BOSS_FALLING_MS, BOSS_FALLING_STEP_MS,
  BOSS_EGG_MS, BOSS_CLEAR_PTS, BOSS_CLEAR_DELAY_MS,
  BOSS_TELEGRAPH_MS, BOSS_DASH_SPEED, BOSS_RECOVER_MS, BOSS_STALK_MS,
} from '../core/config';
import { gameState, activeEffects, eggs, enemies, fallingObstacles, powerups, particles, popups, grounds, platforms, levelState, ghost } from '../core/state';
import { physics } from '../engine/physics';
import { buildLevel, buildBossArena } from '../engine/level';
import type { EntityFactory } from '../engine/factory';
import type { InputManager } from './input';
import type { AudioSystem } from '../audio/audio';
import type { PlayerData, EggData, EnemyData, FallingData, PowerupData, GameMode } from '../core/types';

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
  private lastFlyer = 0;
  /** Poziom trudności, dla którego boss już się pojawił (spawn raz na poziom). */
  private bossSpawnedAt = 0;
  private currentMode: GameMode = 'normal';
  /** Koszmar: moment pierwszego spawnu lisków, licznik zabójstw i flaga ostrzeżenia. */
  private foxStartAt = 0;
  private foxKills = 0;
  private foxWarned = false;
  /** Próg punktowy kolejnego bonusowego życia (2k, 5k, potem ×2). */
  private nextLifeAt = EXTRA_LIFE_FIRST;
  /** Bufor skoku — wciśnięcie tuż przed lądowaniem wykona skok po dotknięciu ziemi. */
  private jumpBufferUntil = 0;
  /** Poprzedni stan "trzymanego" skoku — wykrywa puszczenie (cięcie skoku). */
  private prevJumpHeld = false;

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

  /** Arena bez mety: koszmar albo poziom bossa (ciągła ziemia, spawny czasowe). */
  private get arena(): boolean {
    return gameState.mode === 'hard' || levelState.bossArena;
  }

  /** Podpina pętlę gry pod zdarzenie beforeUpdate silnika (60 Hz). */
  init(): void {
    Events.on(physics.engine, 'beforeUpdate', () => this.update());
  }

  /**
   * Rozpoczyna nową rundę w danym trybie.
   * 'normal' = przygoda (platformówka z generowanymi poziomami),
   * 'hard' = koszmar (arena przetrwania przewijana na NIGHTMARE_LEN).
   */
  start(mode: GameMode = 'normal'): void {
    this.currentMode = mode;
    gameState.mode = mode;
    gameState.running = true;
    gameState.score = 0;
    gameState.lives = START_LIVES;
    gameState.collected = 0;
    gameState.combo = 1;
    gameState.comboTimer = 0;
    gameState.difficulty = 1;
    gameState.level = mode === 'normal' ? 1 : 0;
    gameState.invulnUntil = 0;
    gameState.bossActive = false;
    levelState.bossArena = false;
    levelState.bossTier = 0;
    ghost.active = false;
    activeEffects.shield = 0;
    activeEffects.magnet = 0;
    activeEffects.slowTime = 0;
    activeEffects.doubleJump = 0;
    const now = physics.now;
    this.lastEgg = this.lastEnemy = this.lastFalling = this.lastPowerup = this.lastLevelUp = this.lastFlyer = now;
    this.bossSpawnedAt = 0;
    this.foxStartAt = now + FOX_START_DELAY_MS;
    this.foxKills = 0;
    this.foxWarned = false;
    this.nextLifeAt = EXTRA_LIFE_FIRST;
    this.jumpBufferUntil = 0;
    this.prevJumpHeld = false;
    this.input.clear();
    physics.clearEntities();
    if (mode === 'normal') {
      buildLevel(gameState.level, this.factory);
      physics.setAdventure(true, levelState.len);
      this.playerData.maxJumps = 1; // w przygodzie pojedynczy skok jak u Mario
    } else {
      levelState.len = NIGHTMARE_LEN;
      physics.setAdventure(false, NIGHTMARE_LEN);
      this.playerData.maxJumps = 2;
    }
    physics.resetPlayer();
  }

  /**
   * Kończy rundę: stop muzyki i wejścia, a potem chwila żałoby —
   * duszek kurki odlatuje do nieba i dopiero po GAMEOVER_DELAY_MS
   * wybrzmiewa jingle przegranej i wjeżdża ekran rekordu/game over.
   */
  gameOver(): void {
    gameState.running = false;
    levelState.bossArena = false;
    this.input.clear();
    this.audio.stopAllMusic();
    ghost.active = true;
    ghost.x = physics.player.position.x;
    // Przy upadku w przepaść duszek startuje znad krawędzi, nie spod ekranu
    ghost.y = Math.min(physics.player.position.y, H() - GROUND_H - PLAYER_R);
    ghost.startedAt = performance.now();
    this.audio.playSoul();
    setTimeout(() => {
      ghost.active = false;
      this.audio.playGameOver();
      this.deps.onGameOver(gameState.score, gameState.collected);
    }, GAMEOVER_DELAY_MS);
  }

  /**
   * Wciśnięcie skoku — zapisuje je do bufora (JUMP_BUFFER_MS).
   * Właściwy odbicie wykonuje updatePlayer, gdy gracz stoi na podłożu
   * albo jest w oknie coyote / ma wolny skok w powietrzu.
   */
  tryJump(): void {
    if (!gameState.running) return;
    this.jumpBufferUntil = physics.now + JUMP_BUFFER_MS;
  }

  /** Hax: klawisz H w trakcie rundy dokłada życie — bez limitu power-upu. */
  cheatLife(): void {
    if (!gameState.running) return;
    gameState.lives += 1;
    this.factory.addPopup(physics.player.position.x, physics.player.position.y - PLAYER_R, '+1 LIFE', '#00e5ff');
    this.audio.playPowerUp();
  }

  /** Właściwe odbicie gracza — impet, licznik skoków, kurz i dźwięk. */
  private doJump(jumps: number): void {
    const d = this.playerData;
    Body.setVelocity(physics.player, { x: physics.player.velocity.x, y: JUMP_VELOCITY });
    d.jumps = jumps;
    d.squash = 1;
    this.factory.spawnParticles(
      physics.player.position.x,
      physics.player.position.y + PLAYER_R,
      jumps > 1 ? '#00e5ff' : '#ffffff',
      6,
    );
    this.audio.playJump();
  }

  /**
   * Główna pętla gry (60 Hz, przed krokiem fizyki). Kolejność kroków
   * ma znaczenie — np. spawny przed kolizjami, żeby nowe encje
   * od razu uczestniczyły w rozgrywce.
   */
  private update(): void {
    if (!gameState.running) return;
    const now = physics.now;
    const arena = this.arena;

    if (arena) this.fixEntitiesAboveGround();
    this.updatePlayer(now);
    if (!gameState.running) return; // upadek w przepaść mógł skończyć rundę
    this.updateTimers();
    this.applyMagnet();
    if (arena) this.updateSpawning(now);
    this.collectEggs();
    this.collectPowerups();
    this.updateEnemies(now);
    if (!gameState.running) return; // wróg mógł zadać ostatnie trafienie
    this.updateObstacles(now);
    if (!gameState.running) return;
    this.updateParticles();
    this.updatePopups();
    if (!arena) this.checkGoal();
    this.checkExtraLife();
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
   * Czy ciało stoi na podłożu: stopy w pasie tolerancji nad górną
   * płaszczyzną dowolnego segmentu/platformy (przygoda) albo ciągłej
   * ziemi (koszmar), bez wyraźnej prędkości pionowej.
   */
  private standingOn(body: Matter.Body, r: number): boolean {
    if (Math.abs(body.velocity.y) > 1.2) return false;
    const feet = body.position.y + r;
    if (this.arena) return feet >= H() - GROUND_H - 1;
    for (const s of grounds) {
      if (body.position.x > s.bounds.min.x - 4 && body.position.x < s.bounds.max.x + 4
        && feet >= s.bounds.min.y - 2 && feet <= s.bounds.min.y + 6) return true;
    }
    for (const p of platforms) {
      if (body.position.x > p.bounds.min.x - 4 && body.position.x < p.bounds.max.x + 4
        && feet >= p.bounds.min.y - 2 && feet <= p.bounds.min.y + 6) return true;
    }
    return false;
  }

  /**
   * Sterowanie graczem — fizyka w duchu Mario:
   *  - rozruch i hamowanie zamiast natychmiastowej prędkości,
   *  - bufor skoku + coyote time + podwójny skok (zależnie od trybu),
   *  - puszczenie klawisza skoku ucina wznoszenie (zmienna wysokość),
   *  - spadanie szybsze niż wznoszenie, z pułapem prędkości.
   */
  private updatePlayer(now: number): void {
    const player = physics.player;
    const d = this.playerData;
    const adventure = !this.arena;

    // Platformy jednokierunkowe: solidne tylko gdy gracz spada z góry —
    // test przecięcia (stopy przed krokiem nad krawędzią) zapobiega
    // tunelowaniu przy szybkim spadku; od spodu i z boku przechodzi wylot.
    if (adventure) {
      const feet = player.position.y + PLAYER_R;
      const vy = player.velocity.y;
      for (const p of platforms) {
        p.isSensor = !(vy >= -0.1 && feet - vy <= p.bounds.min.y + 1);
      }
    }

    // Ruch poziomy z rozruchem i hamowaniem
    const dir = this.input.getMoveDir();
    if (dir !== 0) {
      d.facing = dir;
      const accel = d.onGround ? MOVE_ACCEL_GROUND : MOVE_ACCEL_AIR;
      const vx = player.velocity.x + (dir * MOVE_SPEED - player.velocity.x) * accel;
      Body.setVelocity(player, { x: vx, y: player.velocity.y });
      if (d.onGround) d.walkPhase += 0.35;
    } else if (d.onGround) {
      Body.setVelocity(player, { x: player.velocity.x * 0.7, y: player.velocity.y });
    }

    // Wykrywanie podłoża (ziemia / segmenty / platformy)
    const onGround = this.standingOn(player, PLAYER_R);
    if (onGround && !d.onGround) {
      if (d.jumps > 0) this.factory.spawnParticles(player.position.x, player.position.y + PLAYER_R, '#dust', 5);
      d.squash = 0.6;
    }
    d.onGround = onGround;
    if (onGround) {
      d.jumps = 0;
      d.lastGroundAt = now;
    }

    // Bufor skoku + coyote: odroczone odbicie
    if (now < this.jumpBufferUntil) {
      const grounded = onGround || now - d.lastGroundAt < COYOTE_MS;
      const j = grounded ? 0 : Math.max(1, d.jumps);
      const maxJumps = d.maxJumps + (activeEffects.doubleJump > 0 ? 1 : 0);
      if (j < maxJumps) {
        this.jumpBufferUntil = 0;
        this.doJump(j + 1);
      }
    }

    // Cięcie skoku: puszczenie klawisza w wznoszeniu = niższy skok
    const held = this.input.isJumpHeld();
    if (!held && this.prevJumpHeld && player.velocity.y < 0) {
      Body.setVelocity(player, { x: player.velocity.x, y: player.velocity.y * JUMP_CUT });
    }
    this.prevJumpHeld = held;

    // Spadanie szybsze niż wznoszenie + pułap prędkości
    if (player.velocity.y > 0) {
      Body.setVelocity(player, {
        x: player.velocity.x,
        y: Math.min(player.velocity.y + FALL_EXTRA_G, MAX_FALL_SPEED),
      });
    }

    if (adventure) {
      // Wpadnięcie w przepaść — strata życia i powrót na start poziomu
      if (player.position.y > H() + 30) { this.pitFall(); return; }
    } else {
      // Anty-bug: gracz nie może zapaść się pod ziemię
      const groundY = H() - GROUND_H - PLAYER_R;
      if (player.position.y > groundY + 2) {
        Body.setPosition(player, { x: player.position.x, y: groundY });
        Body.setVelocity(player, { x: player.velocity.x, y: Math.min(0, player.velocity.y) });
        d.onGround = true;
        d.jumps = 0;
      }
    }

    // Zanikanie spłaszczenia
    d.squash *= 0.85;
  }

  /** Upadek w przepaść (przygoda): strata życia, respawn na starcie poziomu. */
  private pitFall(): void {
    this.factory.spawnParticles(physics.player.position.x, H() - GROUND_H, '#ff5555', 14);
    gameState.lives -= 1;
    gameState.combo = 1;
    gameState.comboTimer = 0;
    this.audio.playDeath();
    if (gameState.lives <= 0) { this.gameOver(); return; }
    physics.resetPlayer();
    gameState.invulnUntil = physics.now + INVULN_MS;
    this.jumpBufferUntil = 0;
  }

  /**
   * Wejście na metę (przygoda): premia punktowa i budowa kolejnego
   * poziomu — co BOSS_LEVEL_EVERY poziomów to arena z wilkiem-bossem
   * zamiast platformówki.
   */
  private checkGoal(): void {
    if (physics.player.position.x < levelState.goalX) return;
    gameState.score += LEVEL_CLEAR_PTS * gameState.level;
    gameState.level += 1;
    gameState.difficulty = Math.min(MAX_DIFFICULTY, gameState.level);
    this.audio.playLevelUp();
    physics.clearEntities();
    gameState.bossActive = false;
    const now = physics.now;
    if (gameState.level % BOSS_LEVEL_EVERY === 0) {
      buildBossArena(gameState.level, this.factory);
      physics.setAdventure(false, levelState.len);
      this.playerData.maxJumps = 2; // arena jak koszmar — podwójny skok
      // Chwila luzu przed pierwszym zrzutem głazów i jajek.
      this.lastFalling = this.lastEgg = this.lastPowerup = now;
      this.audio.playBoss();
      void this.audio.tryPlay('hard');
      this.factory.addPopup(128, H() - GROUND_H - 80, 'WIELKI WILK!', '#f83800');
    } else {
      buildLevel(gameState.level, this.factory);
      physics.setAdventure(true, levelState.len);
      this.playerData.maxJumps = 1;
      this.factory.addPopup(128, H() - GROUND_H - 80, 'POZIOM ' + gameState.level, '#ffcc00');
    }
    physics.resetPlayer();
    gameState.invulnUntil = now + 800;
  }

  /**
   * Pokonanie wilka na arenie bossa: premia, fanfara zwycięstwa i po
   * krótkiej chwili triumphu powrót do standardowej przygody (level+1).
   */
  private onBossArenaClear(x: number, y: number): void {
    const pts = BOSS_CLEAR_PTS * levelState.bossTier;
    gameState.score += pts;
    this.factory.addPopup(x, y - 24, 'POKONANY! +' + pts, '#f8d800');
    this.audio.playVictory();
    // Nietykalność na czas celebracji — zrzuty lecą dalej do przejścia.
    gameState.invulnUntil = physics.now + BOSS_CLEAR_DELAY_MS;
    setTimeout(() => {
      if (!gameState.running) return; // gracz mógł zginąć podczas fanfary
      gameState.level += 1;
      gameState.difficulty = Math.min(MAX_DIFFICULTY, gameState.level);
      physics.clearEntities();
      buildLevel(gameState.level, this.factory);
      physics.setAdventure(true, levelState.len);
      this.playerData.maxJumps = 1;
      physics.resetPlayer();
      const now = physics.now;
      gameState.invulnUntil = now + 1200;
      this.lastEgg = this.lastEnemy = this.lastFalling = this.lastPowerup = now;
      void this.audio.tryPlay('normal');
      this.factory.addPopup(128, H() - GROUND_H - 80, 'POZIOM ' + gameState.level, '#ffcc00');
    }, BOSS_CLEAR_DELAY_MS);
  }

  /**
   * Trafienie gracza: strata życia, reset combo, odrzut i chwilowa
   * nietykalność. lives <= 0 kończy rundę.
   */
  private hurtPlayer(kickX: number): void {
    this.factory.spawnParticles(physics.player.position.x, physics.player.position.y, '#ff5555', 14);
    gameState.lives -= 1;
    gameState.combo = 1;
    gameState.comboTimer = 0;
    gameState.invulnUntil = physics.now + INVULN_MS;
    Body.setVelocity(physics.player, { x: kickX, y: -4.5 });
    this.audio.playDeath();
    if (gameState.lives <= 0) this.gameOver();
  }

  /**
   * Bonusowe życie za próg punktowy — jeden check na tick łapie punkty
   * ze wszystkich źródeł (jajka, deptanie, premie za poziom i bossa).
   * Progi: EXTRA_LIFE_FIRST, EXTRA_LIFE_SECOND, potem ×EXTRA_LIFE_GROWTH.
   */
  private checkExtraLife(): void {
    if (gameState.score < this.nextLifeAt) return;
    this.nextLifeAt = this.nextLifeAt < EXTRA_LIFE_SECOND
      ? EXTRA_LIFE_SECOND
      : this.nextLifeAt * EXTRA_LIFE_GROWTH;
    gameState.lives = Math.min(MAX_LIVES, gameState.lives + 1);
    this.factory.addPopup(physics.player.position.x, physics.player.position.y - PLAYER_R, '+1 LIFE', '#00e5ff');
    this.audio.playPowerUp();
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

  /** Lewa krawędź widoku — ta sama reguła kamery co w rendererze. */
  private camX(): number {
    return Math.max(0, Math.min(physics.player.position.x - 90, levelState.len - W()));
  }

  /**
   * Strona spawnu liska w koszmarze: tuż za krawędzią kamery, z marszem
   * w stronę gracza. Od trudności 3 część grup zaskakuje od lewej.
   */
  private foxSpawnSide(): { x: number; dirX: number } {
    const cam = this.camX();
    const fromLeft = gameState.difficulty >= 3 && Math.random() < 0.3;
    return fromLeft ? { x: cam - 24, dirX: 1 } : { x: cam + W() + 24, dirX: -1 };
  }

  /**
   * Zabity lisek nasila koszmar — licznik napędza tempo i wielkość
   * kolejnych grup, a co FOX_KILLS_PER_STEP zabójstw rośnie trudność.
   */
  private onFoxKilled(): void {
    if (gameState.mode !== 'hard') return;
    this.foxKills += 1;
    if (this.foxKills % FOX_KILLS_PER_STEP === 0) {
      gameState.difficulty = Math.min(MAX_DIFFICULTY, gameState.difficulty + 1);
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
   * trudności co 10 s oraz strumień jajek po całej arenie. Liski ruszają
   * po FOX_START_DELAY_MS; ich tempo i wielkość grup rosną z trudnością
   * i liczbą zabójstw (patrz onFoxKilled).
   */
  private updateSpawning(now: number): void {
    // Power-upy — rzadkie, max 1 na planszy
    if (now - this.lastPowerup > POWERUP_INTERVAL_MS && powerups.length < POWERUP_MAX) {
      this.factory.spawnPowerup();
      this.lastPowerup = now;
    }

    // Arena bossa: strumień jajek, ale żadnych lisków ani wzrostu
    // trudności — jedynym zagrożeniem jest wilk (+ zrzuty z updateObstacles).
    if (levelState.bossArena) {
      if (now - this.lastEgg > BOSS_EGG_MS && eggs.length < EGG_MAX) {
        this.factory.spawnEgg();
        this.lastEgg = now;
      }
      return;
    }

    // Boss co 4 poziomy trudności — dokładnie raz na dany poziom
    if (gameState.difficulty % BOSS_EVERY_LEVELS === 0 && !gameState.bossActive && this.bossSpawnedAt !== gameState.difficulty) {
      this.factory.spawnEnemy('boss', this.foxSpawnSide());
      this.bossSpawnedAt = gameState.difficulty;
      this.audio.playBoss();
    }

    // Skalowanie trudności
    if (now - this.lastLevelUp > DIFFICULTY_STEP_MS) {
      gameState.difficulty = Math.min(MAX_DIFFICULTY, gameState.difficulty + 1);
      this.lastLevelUp = now;
      this.audio.playLevelUp();
    }

    // Jajka — strumień wolniejszy niż dawniej, spadają po całej arenie
    const eggInterval = Math.max(450, 1050 - gameState.difficulty * 55);
    if (now - this.lastEgg > eggInterval && eggs.length < EGG_MAX) {
      this.factory.spawnEgg();
      this.lastEgg = now;
    }

    // Liski — po początkowej pauzie wpadają grupami znad krawędzi kamery
    // (co 450 ms kolejny); zabójstwa przyspieszają tempo i rosną grupy.
    if (now >= this.foxStartAt) {
      if (!this.foxWarned) {
        this.foxWarned = true;
        this.factory.addPopup(physics.player.position.x, H() - GROUND_H - 80, 'LISKI!', '#f83800');
      }
      const enemyInterval = Math.max(1200, 4200 - gameState.difficulty * 240 - this.foxKills * 80);
      if (now - this.lastEnemy > enemyInterval) {
        const groupSize = Math.min(4, 1 + Math.floor(this.foxKills / 5) + (gameState.difficulty >= 6 ? 1 : 0));
        for (let k = 0; k < groupSize; k++) {
          const side = this.foxSpawnSide();
          setTimeout(() => {
            if (gameState.running) this.factory.spawnEnemy(null, side);
          }, k * 450);
        }
        this.lastEnemy = now;
      }
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
   * maszyna stanów wilka-bossa (updateBoss), marsz w lewo z modyfikatorami
   * efektów, a na końcu rozstrzygnięcie kolizji z graczem:
   *  - skok na łeb = punkty i obrażenie wroga,
   *  - aktywna tarcza = amortyzuje trafienie,
   *  - w przeciwnym razie strata życia + odrzut.
   */
  private updateEnemies(now: number): void {
    const player = physics.player;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const o = enemies[i];
      const ed = o.gameData as EnemyData;

      // Wykrywanie podłoża dla skoczków (ziemia / segmenty)
      const eOnGround = this.standingOn(o, ed.r);
      if (eOnGround && !ed.onGround) ed.jumps = 0;
      ed.onGround = eOnGround;

      // AI skoczka: doskakuje do gracza w zasięgu
      if (ed.maxJumps > 0 && eOnGround && ed.jumps < ed.maxJumps) {
        const dx = player.position.x - o.position.x;
        const dy = player.position.y - o.position.y;
        if (Math.abs(dx) < ed.chaseRange && Math.abs(dy) < 120 && now > ed.nextJumpTime) {
          Body.setVelocity(o, { x: dx * 0.035, y: -7.2 - Math.random() * 1.4 });
          ed.facing = dx >= 0 ? 1 : -1;
          ed.jumps++;
          ed.nextJumpTime = now + ed.jumpCooldown;
        }
      }

      // Wilk-boss ma własną maszynę stanów (marsz → pulsowanie → szarża
      // → odpoczynek) zamiast prostego gonienia — patrz updateBoss.
      // Ruch reszty: skoczek steruje sobą tylko w powietrzu, pozostali
      // maszerują w kierunku dirX i zawracają na granicach patrolu; na
      // arenie liski gonią gracza; slowTime zwalnia, dasher przyspiesza.
      if (ed.type === 'boss') {
        this.updateBoss(o, ed, player, now, eOnGround);
      } else if (ed.type !== 'jumper' || eOnGround) {
        if (o.position.x <= ed.patrolMin) ed.dirX = 1;
        else if (o.position.x >= ed.patrolMax) ed.dirX = -1;
        else if (this.arena && Math.abs(player.position.x - o.position.x) > 4) {
          ed.dirX = player.position.x > o.position.x ? 1 : -1;
        }
        let vx = ed.dirX * ed.speed;
        if (activeEffects.slowTime > 0) vx *= 0.5;
        if (ed.type === 'dasher' && Math.sign(player.position.x - o.position.x) === ed.dirX) vx *= 1.4;
        Body.setVelocity(o, { x: vx, y: o.velocity.y });
        ed.facing = vx < 0 ? -1 : 1;
      }
      ed.walkPhase += 0.25;

      const edx = o.position.x - player.position.x;
      const edy = o.position.y - player.position.y;
      const hitDist = ed.r + PLAYER_R;
      if (Math.abs(edx) < hitDist && Math.abs(edy) < hitDist) {
        // Stopy w górnej części liska = kontakt "od góry" — nigdy nie rani.
        // Deptanie wymaga spadania/postoju (velocity.y > -1): test widzi
        // stan po solverze, który już stłumił impet spadku, a po odbiciu
        // kurka wznosi się jeszcze przez ten pas — bez szkody.
        const aboveHead = player.position.y + PLAYER_R <= o.position.y + ed.r * 0.3;
        if (aboveHead && player.velocity.y > -1) {
          const pts = ed.type === 'boss' ? 100 : 25;
          gameState.score += pts;
          Body.setVelocity(player, { x: player.velocity.x, y: STOMP_BOUNCE });
          this.factory.spawnParticles(o.position.x, o.position.y, ed.color, ed.type === 'boss' ? 28 : 14);
          this.factory.addPopup(o.position.x, o.position.y, '+' + pts, ed.color);
          this.audio.playStomp();
          ed.hp -= 1;
          if (ed.hp <= 0) {
            if (ed.type === 'boss') {
              gameState.bossActive = false;
              if (levelState.bossArena) this.onBossArenaClear(o.position.x, o.position.y);
            } else this.onFoxKilled();
            Composite.remove(physics.engine.world, o);
            enemies.splice(i, 1);
          }
        } else if (!aboveHead && activeEffects.shield > 0) {
          activeEffects.shield = 0;
          this.factory.spawnParticles(player.position.x, player.position.y, '#00e5ff', 18);
          Body.setVelocity(player, { x: edx > 0 ? -6 : 6, y: -5 });
          if (ed.type !== 'boss') {
            this.onFoxKilled();
            Composite.remove(physics.engine.world, o);
            enemies.splice(i, 1);
          }
        } else if (!aboveHead && now >= gameState.invulnUntil) {
          // Odrzut w stronę przeciwną do wroga
          this.hurtPlayer(edx > 0 ? -KNOCKBACK_X : KNOCKBACK_X);
          if (ed.type !== 'tank' && ed.type !== 'boss') {
            Composite.remove(physics.engine.world, o);
            enemies.splice(i, 1);
          } else if (ed.type !== 'boss' || ed.bossPhase !== 'dash') {
            // Tank i boss nie giną od kontaktu — tylko się odbijają;
            // szarżący wilk jest nie do zatrzymania i leci dalej.
            Body.setVelocity(o, { x: -ed.dirX * ed.speed, y: -4 });
            ed.dirX = -ed.dirX;
          }
          if (!gameState.running) return;
        }
      } else if (this.arena ? (o.position.x < -80 || o.position.x > levelState.len + 120) : o.position.y > H() + 120) {
        // Arena: wylot poza planszę; przygoda: upadek w przepaść
        if (ed.type === 'boss') {
          gameState.bossActive = false;
          // Zabezpieczenie: gdyby wilk jakoś wypadł z areny — licz jak wygraną.
          if (levelState.bossArena) this.onBossArenaClear(o.position.x, o.position.y);
        }
        Composite.remove(physics.engine.world, o);
        enemies.splice(i, 1);
      }
    }
  }

  /**
   * Wilk-boss — automat skończony zamiast ciągłego gonienia kurki:
   *  - walk:      marsz z "zapamiętanym" kierunkiem — wilk poprawia cel
   *               dopiero co BOSS_STALK_MS, więc przestrzeliwuje uciekającą
   *               kurkę; tylko w tej fazie zrzuca przeszkody,
   *  - telegraph: stoi i pulsuje (renderer błyska) przez BOSS_TELEGRAPH_MS,
   *               patrząc na gracza — zdradza stronę nadchodzącej szarży,
   *  - dash:      szarża z prędkością BOSS_DASH_SPEED aż do krawędzi areny
   *               (szlak kurzu, szybsza animacja nóg),
   *  - recover:   odpoczynek BOSS_RECOVER_MS po uderzeniu w krawędź —
   *               okno na kontratak, potem powrót do marszu.
   */
  private updateBoss(o: Matter.Body, ed: EnemyData, player: Matter.Body, now: number, eOnGround: boolean): void {
    const slow = activeEffects.slowTime > 0 ? 0.5 : 1;
    switch (ed.bossPhase) {
      case 'telegraph':
        Body.setVelocity(o, { x: 0, y: o.velocity.y });
        // Celowanie — wilk patrzy na kurkę; renderer pokazuje to błyskiem.
        ed.facing = player.position.x >= o.position.x ? 1 : -1;
        if (now >= ed.phaseUntil) {
          ed.bossPhase = 'dash';
          ed.dashDir = ed.facing;
          // Awaryjne odcięcie szarży, gdyby wilk utknął o przeszkody.
          ed.phaseUntil = now + 4000;
          this.audio.playDash();
        }
        break;
      case 'dash': {
        Body.setVelocity(o, { x: ed.dashDir * BOSS_DASH_SPEED * slow, y: o.velocity.y });
        ed.facing = ed.dashDir;
        ed.walkPhase += 0.5; // szarża — nogi tłuką szybciej
        if (Math.random() < 0.5) {
          this.factory.spawnParticles(o.position.x - ed.dashDir * ed.r, o.position.y + ed.r - 4, '#dust', 1);
        }
        const edge = ed.dashDir < 0
          ? Math.max(ed.patrolMin, 36)
          : Math.min(ed.patrolMax, levelState.len - 36);
        if ((ed.dashDir < 0 ? o.position.x <= edge : o.position.x >= edge) || now >= ed.phaseUntil) {
          ed.bossPhase = 'recover';
          ed.phaseUntil = now + BOSS_RECOVER_MS;
          Body.setVelocity(o, { x: 0, y: o.velocity.y });
          this.factory.spawnParticles(o.position.x, o.position.y + ed.r, '#dust', 14);
          this.audio.playStomp(); // łupnięcie o krawędź areny
        }
        break;
      }
      case 'recover':
        Body.setVelocity(o, { x: 0, y: o.velocity.y });
        if (now >= ed.phaseUntil) {
          ed.bossPhase = 'walk';
          ed.nextChargeAt = now + ed.chargeMs;
        }
        break;
      default: {
        // walk — granice patrolu/areny zawracają wilka; kierunek poprawiany
        // dopiero co BOSS_STALK_MS, więc da się go wyprzeć i zmylić.
        const minB = Math.max(ed.patrolMin, 34);
        const maxB = Math.min(ed.patrolMax, levelState.len - 34);
        if (o.position.x <= minB) ed.dirX = 1;
        else if (o.position.x >= maxB) ed.dirX = -1;
        else if (now >= ed.nextStalkAt) {
          ed.dirX = player.position.x >= o.position.x ? 1 : -1;
          ed.nextStalkAt = now + BOSS_STALK_MS;
        }
        Body.setVelocity(o, { x: ed.dirX * ed.speed * slow, y: o.velocity.y });
        ed.facing = ed.dirX;
        // Zrzut przeszkody celowanej w okolice gracza — tylko podczas marszu.
        if (now > ed.nextAttack) {
          this.factory.spawnFallingObstacle(player.position.x + (Math.random() - 0.5) * 70);
          ed.nextAttack = now + ed.attackMs;
        }
        // Szarża rusza tylko z ziemi — pulsowanie musi się dobrze czytać.
        if (eOnGround && now >= ed.nextChargeAt) {
          ed.bossPhase = 'telegraph';
          ed.phaseUntil = now + BOSS_TELEGRAPH_MS;
          this.audio.playCharge();
        }
        break;
      }
    }
  }

  /**
   * Przeszkody: w koszmarze — zrzut kamieni/ptaków sterowany trudnością
   * (interwał kurczy się z poziomem); w przygodzie — ptaki przelatujące
   * poziomo od poziomu 2 (kinematyczne, bez grawitacji). Trafienie
   * gracza: tarcza amortyzuje, inaczej strata życia.
   */
  private updateObstacles(now: number): void {
    if (levelState.bossArena) {
      // Arena bossa: coraz gęstszy deszcz głazów i pająków, celowany w gracza.
      const interval = Math.max(800, BOSS_FALLING_MS - levelState.bossTier * BOSS_FALLING_STEP_MS);
      if (now - this.lastFalling > interval && fallingObstacles.length < FALLING_MAX + levelState.bossTier) {
        this.factory.spawnFallingObstacle(physics.player.position.x + (Math.random() - 0.5) * 140);
        this.lastFalling = now;
      }
    } else if (gameState.mode === 'normal') {
      if (gameState.level >= 2
        && now - this.lastFlyer > Math.max(2600, 6500 - gameState.level * 450)
        && fallingObstacles.length < 2) {
        this.factory.spawnFlyer(H() - GROUND_H - 50 - Math.random() * 80);
        this.lastFlyer = now;
      }
    } else if (now - this.lastFalling > Math.max(1400, 5600 - gameState.difficulty * 350) && fallingObstacles.length < FALLING_MAX) {
      this.factory.spawnFallingObstacle();
      this.lastFalling = now;
    }
    const player = physics.player;
    for (let i = fallingObstacles.length - 1; i >= 0; i--) {
      const o = fallingObstacles[i];
      const fd = o.gameData as FallingData;
      if (fd.flyer) {
        const vx = activeEffects.slowTime > 0 ? fd.flySpeed * 0.5 : fd.flySpeed;
        Body.setPosition(o, { x: o.position.x + vx, y: o.position.y });
        if (o.position.x < -60) {
          Composite.remove(physics.engine.world, o);
          fallingObstacles.splice(i, 1);
          continue;
        }
      }
      const dx = o.position.x - player.position.x;
      const dy = o.position.y - player.position.y;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        // Kontakt od góry nie rani: stopy w górnej części przeszkody
        // (40% wysokości AABB — pokrywa penetrację, zanim box ją zobaczy).
        // Zeskok z prędkością = lekkie odbicie, jak przy deptaniu liska.
        const feet = player.position.y + PLAYER_R;
        const onTop = feet <= o.bounds.min.y + (o.bounds.max.y - o.bounds.min.y) * 0.4;
        if (onTop) {
          if (player.velocity.y > 1) {
            Body.setVelocity(player, { x: player.velocity.x, y: STOMP_BOUNCE });
            this.factory.spawnParticles(player.position.x, feet, '#dust', 6);
            this.audio.playStomp();
          }
          continue;
        }
        if (activeEffects.shield > 0) {
          activeEffects.shield = 0;
          this.factory.spawnParticles(player.position.x, player.position.y, '#00e5ff', 18);
        } else if (now >= gameState.invulnUntil) {
          this.hurtPlayer(dx > 0 ? -KNOCKBACK_X : KNOCKBACK_X);
          if (!gameState.running) {
            Composite.remove(physics.engine.world, o);
            fallingObstacles.splice(i, 1);
            return;
          }
        } else {
          continue; // nietykalność — przeszkoda przelatuje bez szkody
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
