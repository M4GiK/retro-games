/**
 * Centralna konfiguracja gry.
 *
 * Wzorzec: konfiguracja jako dane (data-driven tuning) — wszystkie
 * "magiczne liczby" strojące grywalność są wydzielone z logiki do jednego
 * miejsca. Balans gry zmienia się tu, bez dotykania systemów.
 *
 * Świat gry ma STAŁĄ rozdzielczość w duchu NES: 256×240 pikseli.
 * Canvas jest skalowany w górę przez CSS (image-rendering: pixelated),
 * dlatego wszystkie wymiary i prędkości są dopracowane do tej siatki.
 */

// ---- Rozdzielczość wewnętrzna ----

/** Szerokość świata gry w pikselach (stała, niezależna od okna). */
export const VIEW_W = 256;
/** Wysokość świata gry w pikselach (stała, niezależna od okna). */
export const VIEW_H = 240;
/** Wysokość pasa ziemi na dole ekranu. */
export const GROUND_H = 32;

/** Szerokość świata gry (skrót funkcyjny dla czytelności wzorów). */
export const W = () => VIEW_W;
/** Wysokość świata gry (skrót funkcyjny dla czytelności wzorów). */
export const H = () => VIEW_H;

// ---- Gracz (kurka) ----

/** Promień ciała fizycznego kurki — baza kolizji i detekcji ziemi. */
export const PLAYER_R = 14;
/** Prędkość marszu w poziomie (px/tick przy 60 Hz). */
export const MOVE_SPEED = 3.2;
/** Pionowy impet nadawany przy skoku. */
export const JUMP_VELOCITY = -10;
/** Odbicie gracza w górę po stratowaniu wroga. */
export const STOMP_BOUNCE = -8;
/** Poziomy odrzut gracza po otrzymaniu trafienia. */
export const KNOCKBACK_X = 5.5;

// ---- Zasoby rundy ----

/** Życia na starcie rundy. */
export const START_LIVES = 3;
/** Maksymalna liczba żyć (limit power-upu "life"). */
export const MAX_LIVES = 5;
/** Maksymalny mnożnik combo. */
export const MAX_COMBO = 8;
/** Czas (ms), po którym seria zbierań bez straty jajka wygasa. */
export const COMBO_WINDOW_MS = 2200;
/** Górny limit poziomu trudności. */
export const MAX_DIFFICULTY = 8;
/** Co ile milisekund rundy trudność rośnie o 1. */
export const DIFFICULTY_STEP_MS = 10_000;
/** Boss pojawia się co tyle poziomów trudności. */
export const BOSS_EVERY_LEVELS = 4;

// ---- Limity i interwały spawnów ----

/** Maksymalna liczba jajek jednocześnie na planszy. */
export const EGG_MAX = 6;
/** Maksymalna liczba spadających przeszkód na planszy. */
export const FALLING_MAX = 3;
/** Maksymalna liczba power-upów na planszy. */
export const POWERUP_MAX = 1;
/** Minimalny odstęp (ms) między spawnami power-upów. */
export const POWERUP_INTERVAL_MS = 12_000;
