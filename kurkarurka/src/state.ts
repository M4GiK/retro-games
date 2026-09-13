// Współdzielony stan gry: świat fizyki, encje i liczniki.
import type * as Matter from 'matter-js';
import type { GameState, ActiveEffects, Particle, Popup } from './types';

// Rozdzielczość wewnętrzna w duchu NES — canvas ma fizycznie 256×240
// i jest skalowany w górę przez CSS (image-rendering: pixelated).
export const VIEW_W = 256;
export const VIEW_H = 240;
export const GROUND_H = 32;

// Wypełniane przez initEngine()/createWorld() zanim odpalą się eventy.
export const world = {} as {
  engine: Matter.Engine;
  render: Matter.Render;
  runner: Matter.Runner;
  player: Matter.Body;
  ground: Matter.Body;
  leftWall: Matter.Body;
  rightWall: Matter.Body;
};

export const gameState: GameState = {
  running: false,
  score: 0,
  lives: 3,
  collected: 0,
  combo: 1,
  comboTimer: 0,
  difficulty: 1,
  bossActive: false,
};

// Aktywne efekty power-upów (czas pozostały w ms).
export const activeEffects: ActiveEffects = { shield: 0, magnet: 0, slowTime: 0, doubleJump: 0 };

export const eggs: Matter.Body[] = [];
export const enemies: Matter.Body[] = [];
export const fallingObstacles: Matter.Body[] = [];
export const powerups: Matter.Body[] = [];
export const particles: Particle[] = [];
export const popups: Popup[] = [];

// Świat gry ma stały rozmiar 256×240 niezależnie od rozmiaru okna.
export const W = () => VIEW_W;
export const H = () => VIEW_H;
