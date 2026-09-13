/**
 * Definicje typów danych gry.
 *
 * Encje gry to ciała Matter.js, a ich atrybuty grywalnościowe siedzą
 * w polu `body.gameData` — tu zdefiniowane są kształty tych danych
 * (kontrakt między fabryką encji, logiką a rendererem).
 * Wybór konkretnego interfejsu zależy od `body.label`.
 */
import type * as Matter from 'matter-js';

declare module 'matter-js' {
  interface Body {
    /** Dane gry przypięte do ciała fizycznego (kształt zależy od body.label). */
    gameData: any;
  }
}

/** Dane kurki sterowanej przez gracza. */
export interface PlayerData {
  onGround: boolean;    // stoi na ziemi (warunek skoku i animacji chodu)
  jumps: number;        // skoki wykonane od oderwania od ziemi
  maxJumps: number;     // limit skoków (2 = podwójny skok w powietrzu)
  facing: number;       // kierunek patrzenia: -1 lewo / 1 prawo
  walkPhase: number;    // rosnący licznik fazy animacji nóg
  squash: number;       // spłaszczenie po lądaniu/skokach (zanika 1 -> 0)
  lastGroundAt: number; // timestamp ostatniego kontaktu z podłożem (coyote time)
}

/** Dane spadającego jajka do zebrania. */
export interface EggData {
  spin: number;      // prędkość obrotu w locie
  golden: boolean;   // złote jajko — 5x więcej punktów
  hue: number;       // odcień (zarezerwowane, nieużywane)
}

/** Tryb gry wybierany w menu: 'normal' = przygoda (platformówka),
 *  'hard' = koszmar (przetrwanie pod zrzutem jajek). */
export type GameMode = 'normal' | 'hard';

/** Typy wrogów (lisów) — determinują parametry i zachowanie AI. */
export type EnemyType = 'walker' | 'jumper' | 'dasher' | 'tank' | 'boss';

/** Fazy zachowania wilka-bossa (automat skończony): marsz z zapamiętanym
 *  kierunkiem → pulsowanie-ostrzeżenie → szarża przez arenę → odpoczynek. */
export type BossPhase = 'walk' | 'telegraph' | 'dash' | 'recover';

/** Dane wroga (lisa) — w tym bossa (EnemyType 'boss'). */
export interface EnemyData {
  type: EnemyType;
  r: number;             // promień ciała — baza kolizji i skali sprite'a
  speed: number;         // prędkość marszu (rośnie z trudnością i score)
  dirX: number;          // kierunek marszu: -1 lewo / 1 prawo
  patrolMin: number;     // lewa granica patrolu (przygoda); -inf = bez granicy
  patrolMax: number;     // prawa granica patrolu (przygoda); +inf = bez granicy
  walkPhase: number;     // faza animacji nóg
  facing: number;        // -1 lewo / 1 prawo (flip sprite'a)
  onGround: boolean;
  jumps: number;
  maxJumps: number;      // >0 = skoczek doskakujący do gracza
  nextJumpTime: number;  // najwcześniejszy moment kolejnego skoku (ms)
  chaseRange: number;    // zasięg wykrycia gracza przez skoczka (px)
  jumpCooldown: number;  // odstęp między skokami (ms)
  hp: number;            // życie: zwykły 1, tank 3, boss 8+
  color: string;         // kolor sierści lisa
  nextAttack: number;    // boss: czas następnego zrzutu przeszkody (ms)
  attackMs: number;      // boss: odstęp między zrzutami (ms)
  bossPhase: BossPhase;  // boss: faza zachowania (walk/telegraph/dash/recover)
  phaseUntil: number;    // boss: koniec fazy telegraph/recover (ms)
  nextChargeAt: number;  // boss: najwcześniejszy start kolejnej szarży (ms)
  nextStalkAt: number;   // boss: kolejna poprawka kierunku marszu (ms)
  chargeMs: number;      // boss: odstęp między szarżami (skala tieru areny)
  dashDir: number;       // boss: kierunek szarży (-1 lewo / 1 prawo)
}

/** Typy spadających przeszkód (różnią się tylko spritem). */
export type FallingType = 'rock' | 'bird' | 'spider';

/** Dane spadającej przeszkody (kamień / ptak). */
export interface FallingData {
  type: FallingType;   // rock = kamień, bird = ptak (tylko inny sprite)
  rotation: number;    // prędkość obrotu w locie
  flyer: boolean;      // przygoda: ptak leci poziomo (kinematycznie, bez grawitacji)
  flySpeed: number;    // prędkość lotu poziomego dla flyerów (px/tick)
}

/** Typy bonusów do odebrania. */
export type PowerupType = 'life' | 'shield' | 'magnet' | 'slow' | 'double';

/** Dane power-upa. */
export interface PowerupData {
  type: PowerupType;  // rodzaj bonusu do odebrania
  spin: number;       // prędkość obrotu w locie
}

/** Cząsteczka efektu (kurz, iskry) — ciało fizyczne z czasem życia. */
export interface Particle {
  body: Matter.Body;
  life: number;   // 1 -> 0: skaluje rozmiar i przezroczystość
  color: string;  // '#dust' = kolor kurzu z palety sceny
}

/** Wyskakujący tekst punktowy unoszący się w górę. */
export interface Popup {
  x: number;
  y: number;
  text: string;   // np. "+10", "SHIELD"
  color: string;
  life: number;   // 1 -> 0 (zanikanie)
  vy: number;     // prędkość unoszenia (ujemna = w górę)
}

/** Pozostały czas efektów power-upów w ms (0 = nieaktywny). */
export interface ActiveEffects {
  shield: number;      // osłona — amortyzuje jedno trafienie
  magnet: number;      // przyciąga jajka w promieniu ~90 px
  slowTime: number;    // wrogowie 2x wolniejsi
  doubleJump: number;  // +1 dodatkowy skok w powietrzu
}

/** Globalne liczniki rundy — źródło prawdy dla HUD i logiki. */
export interface GameState {
  running: boolean;      // trwa runda (false na ekranach menu)
  mode: GameMode;        // 'normal' przygoda / 'hard' koszmar
  score: number;
  lives: number;
  collected: number;     // zebrane jajka — statystyka do rankingu
  combo: number;         // mnożnik punktów za serię bez straty jajka
  comboTimer: number;    // czas do wygaśnięcia combo (ms)
  difficulty: number;    // koszmar: rośnie co 10 s; przygoda: = numer poziomu
  level: number;         // przygoda: numer poziomu (0 w koszmarze)
  invulnUntil: number;   // timestamp końca nietykalności po trafieniu (ms)
  bossActive: boolean;   // boss żyje na planszy
}
