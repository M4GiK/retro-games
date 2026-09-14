/**
 * Centralna konfiguracja gry.
 *
 * Wzorzec: konfiguracja jako dane — wszystkie "magiczne liczby" strojące
 * grywalność i sieć są wydzielone z logiki do jednego miejsca.
 *
 * Świat gry ma STAŁĄ rozdzielczość NES: 256×240 px — cała arena mieści
 * się na jednym ekranie (brak kamery, brak split-screenu: nie ma czego
 * podglądać). Canvas skaluje wyłącznie CSS.
 */

// ---- Świat ----

/** Szerokość świata gry w pikselach (stała). */
export const VIEW_W = 256;
/** Wysokość świata gry w pikselach (stała). */
export const VIEW_H = 240;
/**
 * Bok kafelka terenu w px. Małe kafelki = szczegółowe podłoże —
 * pociski wydrążają drobne kratery zamiast zjadać całe bloki.
 * Znaki mapy w level.ts są skalowane (parse(scale)) — jeden znak
 * to scale×scale kafelków.
 */
export const TILE = 4;

// ---- Czas / tick ----

/** Częstotliwość symulacji (Hz) — stały krok, niezależny od rAF. */
export const TICK_HZ = 60;
/** Długość ticka w ms. */
export const TICK_MS = 1000 / TICK_HZ;
/** Co który tick host rozsyła snapshot (3 = 20 Hz). */
export const SNAPSHOT_EVERY = 3;
/** Co ile ticków gość wysyła swój input (2 = 30 Hz). */
export const INPUT_EVERY = 2;
/** Opóźnienie interpolacji gościa w ms (bufor na 2 snapshoty). */
export const INTERP_DELAY_MS = 120;

// ---- Pokój / gracze ----

/** Maksymalna liczba graczy w pokoju (sloty 0..3). */
export const MAX_PLAYERS = 4;
/** Minimalna liczba graczy do startu rundy. */
export const MIN_PLAYERS = 2;
/** Długość kodu pokoju (znaki niejednoznaczne — bez O/0, I/1). */
export const ROOM_CODE_LEN = 4;
/** Alfabet kodów pokoju. */
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Id aplikacji dla trystero — wspólna przestrzeń nazw pokojów. */
export const APP_ID = 'm4gik-jetman-online';
/**
 * Timeout (ms) oczekiwania gościa na odpowiedź hosta po dołączeniu.
 * Musi przekraczać ICE timeout trystero (15 s): signaling nostr
 * (announce→offer→answer przez relaye) + alokacja TURN + handshake
 * DataChannel zajmują realnie 5-15 s na wolniejszych sieciach.
 */
export const JOIN_TIMEOUT_MS = 20000;

// ---- TURN (przejście przez NAT) ----

/**
 * Serwery ICE przekazywane do trystero (rtcConfig.iceServers).
 *
 * STUN działa tylko przy publicznym IP / łagodnym NAT — wystarczy do
 * grania w tej samej sieci. Przez internet (CGNAT, symmetric NAT,
 * firmowe WiFi) WebRTC nie zestawi się bez TURN, który relayuje ruch.
 *
 * Poświadczenia TURN NIE są w repo — build.mjs wstrzykuje je przez
 * esbuild `define` z gitignored `turn.secrets.json` (lokalnie) albo
 * env `TURN_ICE_SERVERS` (sekret GitHub w CI). Bez nich = sam STUN,
 * czyli gra online działa tylko w tej samej sieci.
 */
export interface TurnServer {
  urls: string;
  username?: string;
  credential?: string;
}

/** Wstrzykiwane przez esbuild define w build.mjs (brak w repo). */
declare const __TURN_ICE__: TurnServer[] | null;

/**
 * Fallback bez TURN — STUN metered + google/cloudflare. Wystarczy do
 * gry w jednej sieci; przez internet wymaga wstrzykniętych poświadczeń.
 */
const ICE_FALLBACK: TurnServer[] = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** Pełna lista ICE serverów — TURN jeśli wstrzyknięty, inaczej sam STUN. */
export const ICE_SERVERS: TurnServer[] =
  (typeof __TURN_ICE__ !== 'undefined' && __TURN_ICE__) || ICE_FALLBACK;

// ---- Jetman (fizyka w duchu Gravity Force / Jetmen Revival) ----

/** Promień jetmana (kolizja kołowa z tilemapą i pociskami). */
export const JET_R = 4;
/** Prędkość obrotu (rad/tick) przy wciśniętym ◀/▶. */
export const TURN_RATE = 0.11;
/** Przyspieszenie ciągu jetpacka (px/tick²) wzdłuż kierunku lotu. */
export const THRUST = 0.16;
/** Grawitacja (px/tick²) ciągnąca w dół. */
export const GRAVITY = 0.055;
/** Opór powietrza — mnożnik prędkości na tick (delikatny). */
export const DRAG = 0.992;
/** Pułap prędkości jetmana (px/tick). */
export const JET_MAX_SPEED = 4.5;
/** Prędkość uderzenia w teren, powyżej której jetman ginie (px/tick). */
export const CRASH_SPEED = 2.6;
/** Czas (ms) od śmierci do respawnu w bazie. */
export const RESPAWN_MS = 2000;
/** Nietykalność (ms) po respawnie. */
export const INVULN_MS = 2000;

// ---- Pociski ----

/** Prędkość pocisku (px/tick) wzdłuż kierunku lotu jetmana. */
export const BULLET_SPEED = 5;
/** Ile prędkości jetmana dziedziczy pocisk (0-1). */
export const BULLET_INHERIT = 0.4;
/** Grawitacja działająca na pocisk (px/tick²) — łuk jak w oryginale. */
export const BULLET_G = 0.02;
/** Życie pocisku (ms). */
export const BULLET_LIFE_MS = 1400;
/** Odstęp (ms) między strzałami jednego jetmana. */
export const FIRE_COOLDOWN_MS = 280;
/** Maksymalna liczba pocisków na planszy. */
export const BULLET_MAX = 32;

// ---- Zasady (jak w AngryJets/Jetmen Revival) ----

/** Punkty za dostarczenie flagi wroga do własnej bazy. */
export const SCORE_FLAG = 5;
/** Punkty za fraga. */
export const SCORE_KILL = 1;
/** Życia na start rundy — ich utrata kończy udział w rundzie. */
export const START_LIVES = 5;
/** Flaga upuszczona po śmierci nosiciela wraca do bazy po tylu ms. */
export const FLAG_RETURN_MS = 8000;

// ---- Paliwo i energia (statek) ----

/** Pełny bak paliwa statku. */
export const FUEL_MAX = 100;
/** Zużycie paliwa na tick przy trzymanym ciągu (~4.7 s pełnego ognia). */
export const FUEL_THRUST = 0.35;
/** Wolna regeneracja paliwa bez ciągu (/tick). */
export const FUEL_REGEN = 0.12;
/** Szybka regeneracja paliwa na własnej bazie (/tick). */
export const FUEL_BASE_REGEN = 1.6;
/** Energia statku (HP) — trafienia i uderzenia zadają obrażenia. */
export const ENERGY_MAX = 100;
/** Regeneracja energii na własnej bazie (/tick). */
export const ENERGY_BASE_REGEN = 1.4;
/** Promień bazy: wewnątrz = lądowanie/regen/doniesienie flagi. */
export const BASE_R = 16;
/** Uderzenie wolniejsze niż to = bezpieczne (0 obrażeń). */
export const CRASH_SAFE = 2.0;
/** Obrażenia od uderzenia: (impact - CRASH_SAFE) * skala. */
export const CRASH_DMG_SCALE = 16;

// ---- Pilot na jetpacku (bail-out po zniszczeniu statku) ----

/** Promień pilota (mniejszy, wolniejszy, kruchy). */
export const PILOT_R = 3;
/** Ciąg jetpacka pilota w GÓRĘ — głowa zawsze do góry, jak w oryginale. */
export const PILOT_THRUST = 0.115;
/** Sterowanie boczne pilota (◀▶ = przyspieszenie w bok, nie obrót). */
export const PILOT_SIDE_THRUST = 0.085;
/** Bak jetpacka pilota. */
export const PILOT_FUEL_MAX = 45;
/** Uderzenie pilota w teren powyżej tej prędkości = śmierć. */
export const PILOT_CRASH = 1.3;
/** Zapas rakiet samonaprowadzających pilota po bail-oucie. */
export const PILOT_ROCKETS = 3;

// ---- Lina flagi (ciągnięta jak orb w Thrust) ----

/** Docelowa długość wirtualnej liny nosiciel–flaga (px). */
export const TETHER_LEN = 16;
/** Sprężystość liny — siła ściągania przy rozciągnięciu. */
export const TETHER_SPRING = 0.07;
/** Tłumienie prędkości flagi na linie (/tick). */
export const TETHER_DAMP = 0.90;
/** Grawitacja działająca na flagę (/tick²). */
export const FLAG_G = 0.03;

// ---- Strefy terenu (woda/śnieg/klej — siły w fizyce) ----

/** Woda: silny opór + wyporność (dryf ku górze). */
export const ZONE_WATER_DRAG = 0.90;
export const ZONE_WATER_BUOY = -0.035;
/** Śnieg: lekkie hamowanie. */
export const ZONE_SNOW_DRAG = 0.985;
/** Klej: prawie unieruchamia. */
export const ZONE_GLUE_DRAG = 0.55;
/** Pociski w wodzie: mnożnik prędkości na tick (nurkują wolniej). */
export const ZONE_WATER_BULLET_DRAG = 0.96;

// ---- Eksplozje AoE ----

/** Obrażenia od eksplozji spadają liniowo do 0 na krawędzi promienia. */
export const BOOM_DMG = 45;
/** Ile ticków po śmierci nosiciela flaga "pamięta" tether (natychmiast = 0). */
export const TETHER_DROP_TICKS = 0;
