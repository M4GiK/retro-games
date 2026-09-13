/**
 * Deterministyczny RNG (mulberry32) — jedyny dozwolony losowacz w core/.
 * Stan to jedna liczba: serializuje się w snapshocie i seeduje przy
 * starcie rundy, więc host i testy widzą te same losowania.
 */

export type Rng = number;

export function makeRng(seed: number): Rng {
  return seed >>> 0 || 1;
}

/** Zwraca float [0,1) i przesuwa stan (mutacja pola sim.rng). */
export function nextFloat(state: { rng: Rng }): number {
  let s = (state.rng + 0x6d2b79f5) >>> 0;
  state.rng = s;
  s = Math.imul(s ^ (s >>> 15), s | 1);
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
}

/** Losowy int [0, n). */
export function nextInt(state: { rng: Rng }, n: number): number {
  return Math.floor(nextFloat(state) * n);
}
