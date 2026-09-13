// Typy danych gry + rozszerzenie Matter.Body o pole gameData.
import type * as Matter from 'matter-js';

declare module 'matter-js' {
  interface Body {
    // Dane gry przypięte do ciała fizycznego (kształt zależy od body.label).
    gameData: any;
  }
}

export interface PlayerData {
  onGround: boolean;  // stoi na ziemi (warunek skoku i animacji chodu)
  jumps: number;      // skoki wykonane od oderwania od ziemi
  maxJumps: number;   // limit skoków (2 = podwójny skok w powietrzu)
  facing: number;     // kierunek patrzenia: -1 lewo / 1 prawo
  walkPhase: number;  // rosnący licznik fazy animacji nóg
  squash: number;     // spłaszczenie po lądaniu/skokach (zanika 1 -> 0)
}

export interface EggData {
  spin: number;      // prędkość obrotu w locie
  golden: boolean;   // złote jajko — 5x więcej punktów
  hue: number;       // odcień (zarezerwowane, nieużywane)
}

export type GameMode = 'normal' | 'hard';

export type EnemyType = 'walker' | 'jumper' | 'dasher' | 'tank' | 'boss';

export interface EnemyData {
  type: EnemyType;
  r: number;             // promień ciała — baza kolizji i skali sprite'a
  speed: number;         // prędkość marszu w lewo (rośnie ze score)
  walkPhase: number;     // faza animacji nóg
  facing: number;        // -1 lewo / 1 prawo (flip sprite'a)
  onGround: boolean;
  jumps: number;
  maxJumps: number;      // >0 = skoczek doskakujący do gracza
  nextJumpTime: number;  // najwcześniejszy moment kolejnego skoku (ms)
  chaseRange: number;    // zasięg wykrycia gracza przez skoczka (px)
  jumpCooldown: number;  // odstęp między skokami (ms)
  hp: number;            // życie: zwykły 1, tank 3, boss 8
  color: string;         // kolor sierści lisa
  nextAttack: number;    // boss: czas następnego zrzutu przeszkody (ms)
}

export type FallingType = 'rock' | 'bird';

export interface FallingData {
  type: FallingType;  // rock = kamień, bird = ptak (tylko inny sprite)
  rotation: number;   // prędkość obrotu w locie
}

export type PowerupType = 'life' | 'shield' | 'magnet' | 'slow' | 'double';

export interface PowerupData {
  type: PowerupType;  // rodzaj bonusu do odebrania
  spin: number;       // prędkość obrotu w locie
}

export interface Particle {
  body: Matter.Body;
  life: number;   // 1 -> 0: skaluje rozmiar i przezroczystość
  color: string;  // '#dust' = kolor kurzu z palety sceny
}

export interface Popup {
  x: number;
  y: number;
  text: string;   // np. "+10", "SHIELD"
  color: string;
  life: number;   // 1 -> 0 (zanikanie)
  vy: number;     // prędkość unoszenia (ujemna = w górę)
}

// Pozostały czas efektów power-upów w ms (0 = nieaktywny).
export interface ActiveEffects {
  shield: number;      // osłona — amortyzuje jedno trafienie
  magnet: number;      // przyciąga jajka w promieniu ~90 px
  slowTime: number;    // wrogowie 2x wolniejsi
  doubleJump: number;  // +1 dodatkowy skok w powietrzu
}

export interface GameState {
  running: boolean;    // trwa runda (false na ekranach menu)
  score: number;
  lives: number;
  collected: number;   // zebrane jajka — statystyka do rankingu
  combo: number;       // mnożnik punktów za serię bez straty jajka
  comboTimer: number;  // czas do wygaśnięcia combo (ms)
  difficulty: number;  // poziom 1-8, rośnie co 10 s rundy
  bossActive: boolean; // boss żyje na planszy
}
