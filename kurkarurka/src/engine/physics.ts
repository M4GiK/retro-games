/**
 * Rdzeń fizyki świata gry.
 *
 * Klasa PhysicsEngine jest fasadą (wzorzec Façade) nad Matter.js:
 * ukrywa ceremonię tworzenia silnika, renderera i runnera oraz jest
 * właścicielem ciał stałych świata (gracz, ziemia, ściany boczne).
 * Eksportowana instancja `physics` pełni rolę singletona — rejestru
 * świata fizycznego, do którego odwołują się pozostałe systemy.
 *
 * Świat ma stałą rozdzielczość 256×240 — rozmiary encji są do niej
 * dopracowane (patrz core/config.ts).
 */
import * as Matter from 'matter-js';
import { GROUND_H, VIEW_W, VIEW_H, W, H } from '../core/config';
import { eggs, enemies, fallingObstacles, powerups, particles, popups } from '../core/state';
import type { PlayerData } from '../core/types';

const { Engine, Render, Runner, Bodies, Composite, Body } = Matter;

export class PhysicsEngine {
  /** Silnik fizyki Matter (integracja, broadphase, solver kolizji). */
  engine!: Matter.Engine;
  /** Renderer Matter — dostarcza canvas 256×240 w #stage; sprite'y i tak rysuje SceneRenderer. */
  render!: Matter.Render;
  /** Pętla runnera ze stałym krokiem czasowym 60 Hz (deterministyczna fizyka). */
  runner!: Matter.Runner;

  /** Ciało gracza (kurka). */
  player!: Matter.Body;
  /** Statyczna ziemia na dole ekranu. */
  ground!: Matter.Body;
  /** Niewidzialna ściana lewa — nie wypuszcza encji poza ekran. */
  leftWall!: Matter.Body;
  /** Niewidzialna ściana prawa — wypycha spawnujących się wrogów w stronę ekranu. */
  rightWall!: Matter.Body;

  /**
   * Bieżący czas zegara silnika w ms — baza wszystkich timerów gry
   * (spawny, cooldowny AI, ataki bossa).
   */
  get now(): number {
    return this.engine.timing.timestamp;
  }

  /**
   * Tworzy silnik Matter, renderer (canvas 256×240 w #stage) i runner
   * ze stałym krokiem 60 FPS. Zwiększone iteracje solvera = stabilniejsze
   * stosy ciał przy gwałtownych kolizjach.
   */
  init(stage: HTMLElement): void {
    const engine = Engine.create({ enableSleeping: false });
    engine.positionIterations = 12;
    engine.velocityIterations = 10;
    engine.world.gravity.y = 1;
    this.engine = engine;

    this.render = Render.create({
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

    this.runner = Runner.create();
    this.runner.isFixed = true;
    this.runner.delta = 1000 / 60;

    Render.run(this.render);
    Runner.run(this.runner, engine);
  }

  /**
   * Tworzy ciała stałe świata: gracz (kurka), ziemia, ściany boczne.
   * Sprite'y rysuje SceneRenderer — wszystkie ciała mają render.visible=false.
   */
  createWorld(): void {
    const player = Bodies.circle(48, 0, 14, {
      friction: 0.001,
      frictionAir: 0.01,
      restitution: 0.05,
      density: 0.002,
      render: { visible: false },
    });
    player.label = 'player';
    player.gameData = { onGround: false, jumps: 0, maxJumps: 2, facing: 1, walkPhase: 0, squash: 0 } as PlayerData;
    this.player = player;

    const ground = Bodies.rectangle(0, 0, 10000, GROUND_H, {
      isStatic: true, friction: 1, restitution: 0.15, render: { visible: false },
    });
    ground.label = 'ground';
    this.ground = ground;

    this.leftWall = Bodies.rectangle(-30, 0, 60, 10000, { isStatic: true, render: { visible: false } });
    this.rightWall = Bodies.rectangle(0, 0, 60, 10000, { isStatic: true, render: { visible: false } });

    this.layoutWalls();
    Composite.add(this.engine.world, [player, ground, this.leftWall, this.rightWall]);
  }

  /**
   * Pozycjonuje ziemię i niewidzialne ściany boczne pod stały widok 256×240.
   * Ściana prawa zachodzi na strefę spawnu wrogów (x > W) — fizyka sama
   * wypycha ich w kierunku ekranu, skąd maszerują w lewo.
   */
  layoutWalls(): void {
    Body.setPosition(this.ground, { x: W() / 2, y: H() - GROUND_H / 2 });
    Body.setPosition(this.leftWall, { x: -30, y: H() / 2 });
    Body.setPosition(this.rightWall, { x: W() + 30, y: H() / 2 });
  }

  /** Usuwa wszystkie encje ze świata i czyści rejestry — reset przed rundą. */
  clearEntities(): void {
    const worldComposite = this.engine.world;
    enemies.forEach(e => Composite.remove(worldComposite, e));
    eggs.forEach(e => Composite.remove(worldComposite, e));
    fallingObstacles.forEach(o => Composite.remove(worldComposite, o));
    powerups.forEach(p => Composite.remove(worldComposite, p));
    particles.forEach(p => Composite.remove(worldComposite, p.body));
    enemies.length = 0;
    eggs.length = 0;
    fallingObstacles.length = 0;
    powerups.length = 0;
    particles.length = 0;
    popups.length = 0;
  }

  /** Pozycja startowa gracza: lewa strona ekranu, na ziemi, zero prędkości. */
  resetPlayer(): void {
    Body.setPosition(this.player, { x: 48, y: H() - GROUND_H - 14 });
    Body.setVelocity(this.player, { x: 0, y: 0 });
  }
}

/** Singleton świata fizycznego — współdzielony przez wszystkie systemy. */
export const physics = new PhysicsEngine();
