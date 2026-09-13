const { Engine, Render, Runner, Bodies, Composite, Events, Body, Vector } = window.Matter;

export { Engine, Render, Runner, Bodies, Composite, Events, Body, Vector };

export const GROUND_H = 46;

export const gameState = { running: false, score: 0, lives: 3, collected: 0, combo: 1, comboTimer: 0, started: false, difficulty: 1, bossActive: false };
export const mouse = { x: 0, y: 0, down: false };
export const activeEffects = { shield: 0, magnet: 0, slowTime: 0, doubleJump: 0 };

export const world = {
  engine: null,
  render: null,
  runner: null,
  player: null,
  ground: null,
  leftWall: null,
  rightWall: null
};

export const eggs = [];
export const enemies = [];
export const fallingObstacles = [];
export const powerups = [];
export const bullets = [];
export const explosions = [];
export const particles = [];
export const popups = [];

export const W = () => world.render.options.width;
export const H = () => world.render.options.height;
