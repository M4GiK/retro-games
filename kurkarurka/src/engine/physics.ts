/**
 * Rdzeń fizyki świata gry.
 *
 * Klasa PhysicsEngine jest fasadą (wzorzec Façade) nad Matter.js:
 * ukrywa ceremonię tworzenia silnika, renderera i pętli gry oraz jest
 * właścicielem ciał stałych świata (gracz, ziemia, ściany boczne).
 * Eksportowana instancja `physics` pełni rolę singletona — rejestru
 * świata fizycznego, do którego odwołują się pozostałe systemy.
 *
 * Świat ma stałą rozdzielczość 256×240 — rozmiary encji są do niej
 * dopracowane (patrz core/config.ts).
 */
import * as Matter from 'matter-js';
import { GROUND_H, VIEW_W, VIEW_H, W, H } from '../core/config';
import { eggs, enemies, fallingObstacles, powerups, particles, popups, grounds, platforms } from '../core/state';
import type { PlayerData } from '../core/types';

const { Engine, Render, Bodies, Composite, Body } = Matter;

/** Stały krok fizyki: 60 Hz niezależnie od częstotliwości odświeżania ekranu. */
const STEP = 1000 / 60;
/**
 * Maksymalny czas rzeczywisty nadrabiany w jednej klatce — przy dłuższym
 * lagach gra po prostu zwolni, zamiast wpaść w spiralę kroków fizyki.
 */
const MAX_FRAME_MS = 250;

export class PhysicsEngine {
  /** Silnik fizyki Matter (integracja, broadphase, solver kolizji). */
  engine!: Matter.Engine;
  /** Renderer Matter — dostarcza canvas 256×240 w #stage; sprite'y i tak rysuje SceneRenderer. */
  render!: Matter.Render;
  /**
   * Ułamek kroku fizyki, który upłynął od ostatniego update'u (0–1).
   * Faza interpolacji renderingu — patrz renderPos().
   */
  alpha = 0;
  /** Pozycje ciał sprzed ostatniego kroku fizyki — baza lerp w renderPos(). */
  private prevPos = new WeakMap<Matter.Body, { x: number; y: number }>();

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
   * Tworzy silnik Matter, renderer (canvas 256×240 w #stage) i startuje
   * pętlę gry ze stałym krokiem 60 Hz. Zwiększone iteracje solvera =
   * stabilniejsze stosy ciał przy gwałtownych kolizjach.
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

    Render.run(this.render);
    this.startLoop();
  }

  /**
   * Pętla gry z akumulatorem czasu. Matter.Runner przy isFixed robił jeden
   * krok na każdy requestAnimationFrame — na ekranach >60 Hz (albo przy
   * rAF bez limitu vsync) gra przyspieszała proporcjonalnie do fps.
   * Akumulator liczy realny czas między klatkami i wykonuje tyle kroków
   * STEP, ile faktycznie upłynęło, więc tempo gry jest stałe wszędzie.
   * Pauza działa dalej przez timeScale=0 — kroki lecą, ale zegar silnika stoi.
   */
  private startLoop(): void {
    let last: number | undefined;
    let acc = 0;
    const loop = (time: number) => {
      requestAnimationFrame(loop);
      if (last !== undefined) acc += Math.min(time - last, MAX_FRAME_MS);
      last = time;
      while (acc >= STEP) {
        // Snapshot przed krokiem — renderer lerp'uje prev -> position o alpha.
        for (const b of Composite.allBodies(this.engine.world)) {
          if (!b.isStatic) this.prevPos.set(b, { x: b.position.x, y: b.position.y });
        }
        Engine.update(this.engine, STEP);
        acc -= STEP;
      }
      this.alpha = acc / STEP;
    };
    requestAnimationFrame(loop);
  }

  /**
   * Pozycja ciała do narysowania — interpolacja między stanem sprzed
   * i po ostatnim kroku fizyki (o ułamek `alpha`). Stały krok 60 Hz
   * kwantuje ruch, a klatki dostają nieregularnie 0–2 kroki; lerp
   * przywraca płynny ruch niezależnie od odświeżania ekranu.
   */
  renderPos(body: Matter.Body): { x: number; y: number } {
    const prev = this.prevPos.get(body);
    if (!prev) return body.position;
    return {
      x: prev.x + (body.position.x - prev.x) * this.alpha,
      y: prev.y + (body.position.y - prev.y) * this.alpha,
    };
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
    player.gameData = { onGround: false, jumps: 0, maxJumps: 2, facing: 1, walkPhase: 0, squash: 0, lastGroundAt: 0 } as PlayerData;
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
    grounds.forEach(g => Composite.remove(worldComposite, g));
    platforms.forEach(p => Composite.remove(worldComposite, p));
    enemies.length = 0;
    eggs.length = 0;
    fallingObstacles.length = 0;
    powerups.length = 0;
    particles.length = 0;
    popups.length = 0;
    grounds.length = 0;
    platforms.length = 0;
  }

  /**
   * Przełącza geometrię świata pod tryb gry.
   * Koszmar: jedna ciągła ziemia + prawa ściana na końcu areny (worldLen).
   * Przygoda: ziemię zdejmujemy (rolę podłogi pełnią segmenty z dziurami),
   * a prawą ścianę odsuwamy na koniec poziomu.
   */
  setAdventure(on: boolean, worldLen: number): void {
    const world = this.engine.world;
    const hasGround = Composite.get(world, this.ground.id, 'body') != null;
    if (on && hasGround) Composite.remove(world, this.ground);
    if (!on && !hasGround) Composite.add(world, this.ground);
    Body.setPosition(this.rightWall, { x: worldLen + 30, y: H() / 2 });
  }

  /** Pozycja startowa gracza: na ziemi (lub pierwszym segmencie), zero prędkości. */
  resetPlayer(x = 48): void {
    Body.setPosition(this.player, { x, y: H() - GROUND_H - 14 });
    Body.setVelocity(this.player, { x: 0, y: 0 });
    Body.setAngle(this.player, 0);
    const d = this.player.gameData as PlayerData;
    d.facing = 1;
    d.jumps = 0;
  }
}

/** Singleton świata fizycznego — współdzielony przez wszystkie systemy. */
export const physics = new PhysicsEngine();
