/**
 * Punkt wejścia gry — korzeń kompozycji (Composition Root).
 *
 * Jedyne miejsce, które zna wszystkie moduły: tworzy instancje systemów
 * i łączy je wstrzykiwanymi zależnościami (Dependency Injection).
 * Moduły między sobą komunikują się przez singletony stanu
 * (core/state.ts, engine/physics.ts) i callbacki — bez cyklicznych
 * importów między warstwami.
 *
 * Kolejność initów ma znaczenie:
 *   fizyka -> świat -> wejście -> pętla gry -> renderer -> ekrany (splash).
 * Menu po wejściu gracza woła onStart -> game.start + start muzyki.
 */
import { gameState } from './core/state';
import { physics } from './engine/physics';
import { EntityFactory } from './engine/factory';
import { InputManager } from './systems/input';
import { Game } from './systems/game';
import { SceneRenderer } from './render/scene';
import { AudioSystem } from './audio/audio';
import { ScreenManager } from './ui/screens';

// ---- Kompozycja systemów ----

const stage = document.getElementById('stage') as HTMLElement;

// Warstwa fizyczna: silnik, canvas 256×240, ciała stałe świata.
physics.init(stage);
physics.createWorld();

// Systemy gry — zależności płyną od dołu (rdzeń) do góry (UI).
const audio = new AudioSystem(
  document.getElementById('bgMusic') as HTMLAudioElement | null,
  document.getElementById('bgMusicHard') as HTMLAudioElement | null,
);
const factory = new EntityFactory();
const input = new InputManager(stage, () => gameState.running, {
  onJump: () => game.tryJump(),
  onExtraLife: () => game.cheatLife(),
});
const game = new Game(input, audio, factory, {
  onGameOver: (score, eggs) => screens.handleGameOver(score, eggs),
});
const renderer = new SceneRenderer();
const screens = new ScreenManager(
  { onStart: (mode) => { game.start(mode); void audio.tryPlay(mode); } },
  audio,
  renderer,
);

// ---- Start ----

input.init();
game.init();
renderer.init();
screens.init();

// Przycisk wyciszenia — globalny element chrome'u gry.
const muteBtn = document.getElementById('mute') as HTMLButtonElement;
muteBtn.addEventListener('click', async () => {
  const m = audio.toggleMuted();
  muteBtn.textContent = m ? '🔇' : '🔊';
  if (!m) await audio.tryPlay(gameState.mode);
});
