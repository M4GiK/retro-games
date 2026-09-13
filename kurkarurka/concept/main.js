import { initEngine, createWorld } from './mechanics.js';
import { initLogic } from './logic.js';
import { initGraphics } from './graphics.js';

const stage = document.getElementById('stage');
initEngine(stage);
createWorld();
initLogic();
initGraphics();
