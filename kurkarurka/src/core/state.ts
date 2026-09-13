/**
 * Stan sesji gry — współdzielony "blackboard" modułów.
 *
 * Wzorzec: Singleton realizowany przez moduł ES — dokładnie jedna
 * instancja stanu na całą aplikację. Systemy (logika, renderer, UI)
 * czytają i piszą tu bez wzajemnych zależności: rejestry encji są
 * źródłem prawdy o zawartości planszy, a `gameState` — o przebiegu rundy.
 */
import type * as Matter from 'matter-js';
import type { GameState, ActiveEffects, Particle, Popup } from './types';
import { START_LIVES } from './config';

/** Liczniki rundy — resetowane przez Game.start(). */
export const gameState: GameState = {
  running: false,
  score: 0,
  lives: START_LIVES,
  collected: 0,
  combo: 1,
  comboTimer: 0,
  difficulty: 1,
  bossActive: false,
};

/** Pozostały czas działania efektów power-upów (ms; 0 = nieaktywny). */
export const activeEffects: ActiveEffects = { shield: 0, magnet: 0, slowTime: 0, doubleJump: 0 };

// ---- Rejestry żywych encji ----
// Fabryka dopisuje tu nowe ciała, logika odcina je po kolizji/śmierci,
// a renderer rysuje wszystko, co się w nich znajduje.

export const eggs: Matter.Body[] = [];
export const enemies: Matter.Body[] = [];
export const fallingObstacles: Matter.Body[] = [];
export const powerups: Matter.Body[] = [];
export const particles: Particle[] = [];
export const popups: Popup[] = [];
