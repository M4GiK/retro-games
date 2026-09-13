// Ekrany NES: splash -> boot -> tytuł (demo w tle) -> menu -> gra / ranking.
// Nawigacja: klawiatura (↑↓ Enter Esc) + dotyk. Ranking i wpis inicjałów.
import { setDemo } from './render';
import { clearEntities, resetPlayer } from './physics';
import { loadScores, addScore, qualifies } from './rank';
import { playCollect, playJump } from './audio';
import { runSplash } from './splash';
import type { GameMode } from './types';

type Screen = 'splash' | 'boot' | 'title' | 'menu' | 'rank' | 'hs' | 'over' | 'game';

export interface MenuDeps {
  onStart: (mode: GameMode) => void;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const screens: Record<Exclude<Screen, 'game'>, HTMLElement> = {
  splash: el('splash'),
  boot: el('boot'),
  title: el('title'),
  menu: el('menu'),
  rank: el('rank'),
  hs: el('hs'),
  over: el('over'),
};

const menuItems = Array.from(document.querySelectorAll<HTMLElement>('#menuList li'));
const rankList = el<HTMLOListElement>('rankList');
const overText = el('overText');
const retryBtn = el<HTMLButtonElement>('retry');
const toTitleBtn = el<HTMLButtonElement>('toTitle');
const hsScoreEl = el('hsScore');
const hsOkBtn = el<HTMLButtonElement>('hsOk');
const hsLets = Array.from(document.querySelectorAll<HTMLElement>('.hsLet'));

let current: Screen = 'splash';
let menuSel = 0;
let currentMode: GameMode = 'normal';
let deps: MenuDeps;
let splashInput: (() => void) | null = null;
let splashDone = false;

// Stan wpisu rekordu
let pendingScore = 0;
let pendingEggs = 0;
const hsLetters = ['A', 'A', 'A'];
let hsPos = 0;

function show(name: Screen) {
  current = name;
  for (const key of Object.keys(screens) as (keyof typeof screens)[]) {
    screens[key].classList.toggle('show', key === name);
  }
  // Demo w tle tylko na ekranach menu — nigdy w trakcie gry ani na "over".
  const ghost = name === 'boot' || name === 'title' || name === 'menu' || name === 'rank' || name === 'hs';
  setDemo(ghost);
  if (ghost) { clearEntities(); resetPlayer(); }
}

function goTitle() {
  show('title');
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Boot = prawdziwa bramka ładowania: czekamy na fonty i bufor muzyki.
// Pasek pokazuje realny postęp; limity czasu pilnują, by gra nie stanęła.
async function loadResources() {
  const startedAt = performance.now();
  const fill = el<HTMLElement>('bootFill');
  const setFill = (p: number) => {
    fill.style.animation = 'none';
    fill.style.width = p + '%';
  };

  // Krok 1: font pixel-art (menu/splash rysują nim tekst na canvasie)
  setFill(15);
  try {
    await Promise.race([document.fonts?.ready ?? Promise.resolve(), delay(2000)]);
  } catch { /* fonty niedostępne — fallback monospace */ }
  setFill(45);

  // Krok 2: muzyka — bufor mp3 gotowy do grania (canplaythrough), max 8 s.
  const audio = document.getElementById('bgMusic') as HTMLAudioElement | null;
  if (audio && audio.readyState < 3) {
    audio.load();
    await Promise.race([
      new Promise<void>(r => {
        audio.addEventListener('canplaythrough', () => r(), { once: true });
        audio.addEventListener('error', () => r(), { once: true });
      }),
      delay(8000),
    ]);
  }
  setFill(100);

  // Minimum 1.6 s — logo i pasek mają się "wyświetlić", nie mignąć.
  const elapsed = performance.now() - startedAt;
  if (elapsed < 1600) await delay(1600 - elapsed);
}

// Splash skończony (animacja dobiegła końca) -> boot -> tytuł.
function enterBoot() {
  splashDone = true;
  splashInput = null;
  show('boot');
  // Po załadowaniu przechodzimy do tytułu — chyba że user już skipnął
  // i zdążył pójść dalej (menu/gra).
  void loadResources().then(() => { if (current === 'boot') goTitle(); });
}

// Input w trakcie splasha: na "INSERT COIN" odpala animację (gest odblokowuje
// dźwięk), w trakcie animacji — skipuje do boot.
function skipSplash() {
  if (splashDone) return;
  splashInput?.();
}

function activateMenuItem() {
  if (current !== 'menu') return;
  const mode = menuItems[menuSel].dataset.mode;
  playCollect();
  if (mode === 'rank') {
    renderRank();
    show('rank');
  } else {
    currentMode = mode as GameMode;
    show('game');
    deps.onStart(currentMode);
  }
}

function renderRank() {
  const scores = loadScores();
  if (scores.length === 0) {
    rankList.innerHTML = '<li class="empty">Brak rekordów — bądź pierwszy!</li>';
    return;
  }
  rankList.innerHTML = scores.map((s, i) =>
    `<li><span>${i + 1}. <b>${s.name}</b></span><span>${s.score} · 🥚${s.eggs} <span class="m">${s.mode}</span></span></li>`
  ).join('');
}

// ---- Wpis rekordu ----
function hsRender() {
  hsLets.forEach((s, i) => {
    s.textContent = hsLetters[i];
    s.classList.toggle('cur', i === hsPos);
  });
}

function hsCycle(d: number) {
  const c = hsLetters[hsPos].charCodeAt(0);
  hsLetters[hsPos] = String.fromCharCode(65 + ((c - 65 + d + 26) % 26));
  hsRender();
}

function hsConfirm() {
  addScore({ name: hsLetters.join(''), score: pendingScore, eggs: pendingEggs, mode: currentMode === 'hard' ? 'H' : 'N' });
  renderRank();
  show('rank');
}

// Wywoływane z logic.ts po zakończeniu gry.
export function handleGameOver(score: number, eggsCollected: number) {
  if (qualifies(score)) {
    pendingScore = score;
    pendingEggs = eggsCollected;
    hsScoreEl.textContent = String(score);
    hsLetters[0] = 'A'; hsLetters[1] = 'A'; hsLetters[2] = 'A';
    hsPos = 0;
    hsRender();
    show('hs');
  } else {
    overText.textContent = 'Twój wynik: ' + score + '  ·  Jajka: ' + eggsCollected;
    show('over');
  }
}

// ---- Nawigacja ----
function onKey(e: KeyboardEvent) {
  const k = e.key;
  switch (current) {
    case 'splash':
      skipSplash();
      break;
    case 'boot':
      goTitle(); // skip — zasoby dokończą się w tle
      break;
    case 'title':
      if (k === 'Enter' || k === ' ') show('menu');
      break;
    case 'menu':
      if (k === 'ArrowUp' || k === 'w' || k === 'W') {
        menuSel = (menuSel - 1 + menuItems.length) % menuItems.length;
        menuItems.forEach((li, i) => li.classList.toggle('sel', i === menuSel));
        playJump();
      } else if (k === 'ArrowDown' || k === 's' || k === 'S') {
        menuSel = (menuSel + 1) % menuItems.length;
        menuItems.forEach((li, i) => li.classList.toggle('sel', i === menuSel));
        playJump();
      } else if (k === 'Enter' || k === ' ') {
        activateMenuItem();
      }
      break;
    case 'rank':
      if (k === 'Escape' || k === 'Enter' || k === ' ') show('menu');
      break;
    case 'hs':
      if (k === 'ArrowUp' || k === 'w' || k === 'W') hsCycle(1);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') hsCycle(-1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { hsPos = Math.min(2, hsPos + 1); hsRender(); }
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { hsPos = Math.max(0, hsPos - 1); hsRender(); }
      else if (k === 'Enter') hsConfirm();
      break;
    case 'over':
      if (k === 'Enter') activateRetry();
      else if (k === 'Escape') goTitle();
      break;
    default:
      break;
  }
}

function activateRetry() {
  if (current !== 'over') return;
  show('game');
  deps.onStart(currentMode);
}

export function initMenu(d: MenuDeps) {
  deps = d;

  window.addEventListener('keydown', onKey);

  // Dotyk/klik na ekranach
  screens.splash.addEventListener('pointerdown', skipSplash);
  screens.boot.addEventListener('pointerdown', goTitle);
  screens.title.addEventListener('pointerdown', () => show('menu'));
  screens.rank.addEventListener('pointerdown', () => show('menu'));

  // Dotyk/mysz: jedno dotknięcie pozycji = wybór + start.
  // (preventDefault na pointerdown tłumi 'click' na iOS — dlatego
  //  aktywujemy bezpośrednio w pointerdown, a nie w click).
  menuItems.forEach((li, i) => {
    li.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      menuSel = i;
      menuItems.forEach((l, j) => l.classList.toggle('sel', j === menuSel));
      activateMenuItem();
    });
  });

  hsLets.forEach((s, i) => {
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      hsPos = i;
      hsCycle(1);
    });
  });
  hsOkBtn.addEventListener('click', hsConfirm);

  retryBtn.addEventListener('click', activateRetry);
  toTitleBtn.addEventListener('click', goTitle);

  // Splash M4GIK -> boot -> tytuł
  show('splash');
  splashDone = false;
  splashInput = runSplash(el<HTMLCanvasElement>('splashFx'), enterBoot);
}
