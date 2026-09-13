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

// ---- Gracz (kurka) — fizyka w duchu Mario ----

/** Promień ciała fizycznego kurki — baza kolizji i detekcji ziemi. */
export const PLAYER_R = 14;
/** Prędkość marszu w poziomie (px/tick przy 60 Hz). */
export const MOVE_SPEED = 3.2;
/** Pionowy impet nadawany przy skoku (~70 px wysokości pełnego skoku). */
export const JUMP_VELOCITY = -6.6;
/** Dodatkowe przyspieszenie w dół podczas spadania — krótszy, "cięższy" łuk jak w Mario. */
export const FALL_EXTRA_G = 0.22;
/** Pułap prędkości spadania (px/tick). */
export const MAX_FALL_SPEED = 10;
/** Mnożnik prędkości wznoszenia po puszczeniu klawisza skoku (zmienna wysokość skoku). */
export const JUMP_CUT = 0.45;
/** Okno (ms) po zejściu z krawędzi, w którym skok jeszcze działa (coyote time). */
export const COYOTE_MS = 90;
/** Okno (ms) bufora skoku — wciśnięcie tuż przed lądowaniem wykona skok po dotknięciu ziemi. */
export const JUMP_BUFFER_MS = 120;
/** Interpolacja prędkości poziomej do celu na ziemi (0-1 na tick) — rozrzut/hamowanie. */
export const MOVE_ACCEL_GROUND = 0.5;
/** Interpolacja prędkości poziomej w powietrzu — mniejsza kontrola w locie. */
export const MOVE_ACCEL_AIR = 0.32;
/** Odbicie gracza w górę po stratowaniu wroga. */
export const STOMP_BOUNCE = -5.4;
/** Poziomy odrzut gracza po otrzymaniu trafienia. */
export const KNOCKBACK_X = 5.5;
/** Nietykalność (ms) po otrzymaniu trafienia. */
export const INVULN_MS = 1300;

// ---- Zasoby rundy ----

/** Życia na starcie rundy. */
export const START_LIVES = 3;
/** Maksymalna liczba żyć (limit power-upu "life" i bonusów za punkty). */
export const MAX_LIVES = 5;
/** Próg punktowy pierwszego bonusowego życia. */
export const EXTRA_LIFE_FIRST = 2_000;
/** Drugi próg — każdy kolejny jest podwojeniem poprzedniego (10k, 20k, 40k...). */
export const EXTRA_LIFE_SECOND = 5_000;
/** Mnożnik progu od trzeciego bonusowego życia wzwyż. */
export const EXTRA_LIFE_GROWTH = 2;
/** Maksymalny mnożnik combo. */
export const MAX_COMBO = 8;
/** Czas (ms), po którym seria zbierań bez straty jajka wygasa. */
export const COMBO_WINDOW_MS = 2200;
/** Pauza (ms) po stracie ostatniego życia — duszek odlatuje do nieba,
 *  dopiero potem pokazuje się tablica wyników. */
export const GAMEOVER_DELAY_MS = 2200;
/** Górny limit poziomu trudności. */
export const MAX_DIFFICULTY = 10;
/** Co ile milisekund rundy trudność rośnie o 1. */
export const DIFFICULTY_STEP_MS = 10_000;
/** Boss pojawia się co tyle poziomów trudności (koszmar). */
export const BOSS_EVERY_LEVELS = 4;

// ---- Arena bossa (przygoda: co BOSS_LEVEL_EVERY poziom) ----

/** Co który poziom przygody jest areną bossa — 5 = po 4 zwykłych poziomach. */
export const BOSS_LEVEL_EVERY = 5;
/** Dodatkowe HP wilka-bossa za każdy tier areny (coraz twardszy). */
export const BOSS_HP_PER_TIER = 3;
/** Odstęp (ms) między zrzutami bossa — skraca się o tier * BOSS_ATTACK_STEP_MS. */
export const BOSS_ATTACK_MS = 1500;
export const BOSS_ATTACK_STEP_MS = 150;
/** Interwał (ms) zrzutu głazów/pająków na arenie — skraca się z tierem. */
export const BOSS_FALLING_MS = 2600;
export const BOSS_FALLING_STEP_MS = 350;
/** Interwał (ms) spadania jajek na arenie bossa. */
export const BOSS_EGG_MS = 1200;
/** Premia punktowa za pokonanie bossa (mnożona przez tier areny). */
export const BOSS_CLEAR_PTS = 250;
/** Pauza (ms) między pokonaniem bossa a startem kolejnego poziomu. */
export const BOSS_CLEAR_DELAY_MS = 2400;
/** Odstęp (ms) między szarżami wilka — skraca się o tier * BOSS_CHARGE_STEP_MS. */
export const BOSS_CHARGE_EVERY_MS = 3400;
export const BOSS_CHARGE_STEP_MS = 250;
/** Czas (ms) pulsowania przed szarżą — okno ostrzeżenia dla gracza. */
export const BOSS_TELEGRAPH_MS = 750;
/** Prędkość szarży (px/tick) — wilk przelatuje przez całą arenę. */
export const BOSS_DASH_SPEED = 11;
/** Pauza (ms) wilka po doleceniu do krawędzi areny — okno na kontratak. */
export const BOSS_RECOVER_MS = 800;
/** Odstęp (ms) między poprawkami kierunku marszu bossa — wilk poluje
 *  "z zapamiętaniem", zamiast kleić się do kurki w każdej klatce. */
export const BOSS_STALK_MS = 1400;

// ---- Limity i interwały spawnów ----

/** Maksymalna liczba jajek jednocześnie na planszy. */
export const EGG_MAX = 6;
/** Maksymalna liczba spadających przeszkód na planszy. */
export const FALLING_MAX = 3;
/** Maksymalna liczba power-upów na planszy. */
export const POWERUP_MAX = 1;
/** Minimalny odstęp (ms) między spawnami power-upów. */
export const POWERUP_INTERVAL_MS = 12_000;

// ---- Koszmar (arena przetrwania) ----

/** Dodatkowe ekrany świata koszmaru w prawo od ekranu startowego. */
export const NIGHTMARE_EXTRA_SCREENS = 4;
/** Długość świata koszmaru w px (ekran startowy + ekrany w prawo). */
export const NIGHTMARE_LEN = VIEW_W * (1 + NIGHTMARE_EXTRA_SCREENS);
/** Opóźnienie (ms) pierwszej fali lisków po starcie rundy. */
export const FOX_START_DELAY_MS = 9_000;
/** Maksymalna liczba lisków na arenie naraz (wilk-boss się nie liczy).
 *  Twardy limit — bez niego ciężkie liski kopcowały pod kurką
 *  i solver fizyki wybijał ją w górę bez możliwości zejścia. */
export const FOX_MAX = 5;
/** Największa wielkość fali lisków. */
export const FOX_WAVE_MAX = 6;
/** Odstęp (ms) między kolejnymi liskami wewnątrz fali. */
export const FOX_WAVE_STEP_MS = 450;
/** Bazowa pauza (ms) między falami — kurczy się z trudnością. */
export const FOX_WAVE_PAUSE_MS = 6_500;
/** Skrócenie pauzy między falami za poziom trudności (ms). */
export const FOX_WAVE_PAUSE_STEP_MS = 350;
/** Najkrótsza możliwa pauza między falami (ms). */
export const FOX_WAVE_PAUSE_MIN_MS = 2_500;
/** Sufit przyspieszenia liska od wyniku (px/tick) — bez niego przy
 *  dużym score liski robiły się szybsze od kurki. */
export const ENEMY_SCORE_SPEED_MAX = 1.6;

// ---- Przygoda (tryb platformowy à la Mario) ----

/** Długość poziomu 1 w px — każdy kolejny poziom jest dłuższy o LEVEL_LEN_STEP. */
export const LEVEL_BASE_LEN = 1500;
/** Przyrost długości poziomu na poziom (px). */
export const LEVEL_LEN_STEP = 450;
/** Maksymalna długość poziomu (px). */
export const LEVEL_MAX_LEN = 5200;
/** Szerokość bezpiecznego odcinka startowego i mety (bez dziur i wrogów). */
export const LEVEL_SAFE_ZONE = 300;
/** Wysokość pływających platform (px). */
export const PLATFORM_H = 8;
/** Punkty za ukończenie poziomu (mnożone przez numer poziomu). */
export const LEVEL_CLEAR_PTS = 100;

// ---- Pora dnia (cykl doby) ----

/** Długość pełnego cyklu doby w ms — scena przechodzi płynnie przez
 *  noc, świt, dzień i zmierzch. Dotyczy wyłącznie oświetlenia/kolorystyki,
 *  mechanika gry jest niezależna od pory dnia. */
export const DAY_CYCLE_MS = 120_000;
