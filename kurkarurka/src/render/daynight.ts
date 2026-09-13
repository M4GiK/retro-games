/**
 * Cykl doby — pora dnia jako czysta funkcja czasu.
 *
 * Doba to zapętlona oś 0..1 (długość: DAY_CYCLE_MS z configu). Tabela
 * DAY_KEYS trzyma klucze faz: noc -> świt -> dzień -> zmierzch -> noc,
 * a dayLight() płynnie miksuje sąsiednie klucze. Wynik opisuje światło
 * sceny: kolor nieba i ciała niebieskiego oraz ambient — docelowy kolor
 * i siłę domieszki, do której dąży każdy kolor świata (ziemia, kurka,
 * lisy), tak jak powierzchnie przejmują barwę światła zastanego.
 */
import { DAY_CYCLE_MS } from '../core/config';

/** Światło doby przeliczone dla jednej klatki. */
export interface DayLight {
  sky: string;     // kolor nieba po zmiksowaniu kluczy
  body: string;    // kolor słońca / księżyca
  moon: boolean;   // noc — na niebie sierp i gwiazdy zamiast słońca
  amb: string;     // kolor światła zastanego — cel domieszki kolorów
  amt: number;     // siła domieszki 0..1 (0 = pełne południowe słońce)
}

/** Klucz fazy doby: moment t w cyklu (0..1) + kolory światła. */
interface DayKey { t: number; sky: string; body: string; amb: string; amt: number }

/**
 * Fazy doby — czyste dane strojeniowe. Ostatni klucz przechodzi
 * z powrotem w pierwszy (t=0 to środek nocy).
 */
const DAY_KEYS: DayKey[] = [
  { t: 0.00, sky: '#0b102e', body: '#dce4f8', amb: '#3a4a7e', amt: 0.60 }, // głęboka noc
  { t: 0.10, sky: '#0b102e', body: '#dce4f8', amb: '#3a4a7e', amt: 0.60 }, // noc trwa
  { t: 0.20, sky: '#e8906c', body: '#f8b830', amb: '#e8a068', amt: 0.30 }, // świt
  { t: 0.30, sky: '#5c94fc', body: '#f8d800', amb: '#ffffff', amt: 0.00 }, // wschód -> dzień
  { t: 0.62, sky: '#5c94fc', body: '#f8d800', amb: '#ffffff', amt: 0.00 }, // dzień trwa
  { t: 0.72, sky: '#d85830', body: '#f86010', amb: '#f07838', amt: 0.38 }, // zmierzch
  { t: 0.82, sky: '#0b102e', body: '#dce4f8', amb: '#3a4a7e', amt: 0.60 }, // zapada noc
];

function chan(hex: string, i: number): number { return parseInt(hex.slice(i, i + 2), 16); }
function toCh(n: number): string { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }

/** Miesza dwa kolory #rrggbb w stosunku f (0 = a, 1 = b). */
function lerpHex(a: string, b: string, f: number): string {
  return '#' + toCh(chan(a, 1) + (chan(b, 1) - chan(a, 1)) * f)
    + toCh(chan(a, 3) + (chan(b, 3) - chan(a, 3)) * f)
    + toCh(chan(a, 5) + (chan(b, 5) - chan(a, 5)) * f);
}

/**
 * Światło doby dla timestampu (ms). Cykl płynie także na ekranach
 * menu — demo attract-mode od razu pokazuje zmiany oświetlenia.
 */
export function dayLight(ms: number): DayLight {
  const t = (ms % DAY_CYCLE_MS) / DAY_CYCLE_MS;
  // Ostatni klucz z t <= bieżący moment (keys[0].t = 0, więc zawsze jest).
  let i = DAY_KEYS.length - 1;
  for (let k = 0; k < DAY_KEYS.length; k++) if (DAY_KEYS[k].t <= t) i = k;
  const a = DAY_KEYS[i], b = DAY_KEYS[(i + 1) % DAY_KEYS.length];
  const span = (b.t - a.t + 1) % 1 || 1; // odcinek może zawijać się przez 1.0
  const f = Math.min(1, Math.max(0, ((t - a.t + 1) % 1) / span));
  const amt = a.amt + (b.amt - a.amt) * f;
  return {
    sky: lerpHex(a.sky, b.sky, f),
    body: lerpHex(a.body, b.body, f),
    moon: amt > 0.5,
    amb: lerpHex(a.amb, b.amb, f),
    amt,
  };
}

/** Kolor podporządkowany światłu doby — domieszka ambientu o sile amt. */
export function shade(hex: string, l: DayLight): string {
  return l.amt > 0 ? lerpHex(hex, l.amb, l.amt) : hex;
}

/** Cała paleta sprite'a/sceny w świetle doby (klucze zachowane). */
export function shadePal<P extends Record<string, string>>(pal: P, l: DayLight): P {
  const out: Record<string, string> = {};
  for (const k in pal) out[k] = shade(pal[k], l);
  return out as P;
}
