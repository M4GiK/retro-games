// Punkt wejścia gry. Kolejność initów ma znaczenie:
// engine -> świat fizyki -> logika -> renderer -> menu (splash).
// Menu po wejściu gracza woła onStart -> startGame + start muzyki.
import { initEngine, createWorld } from './physics';
import { initLogic, startGame } from './logic';
import { initRender } from './render';
import { initMenu } from './menu';
import { tryPlay } from './audio';

const stage = document.getElementById('stage') as HTMLElement;
initEngine(stage);
createWorld();
initLogic();
initRender();
initMenu({
  onStart: (mode) => { startGame(mode); tryPlay(); },
});
