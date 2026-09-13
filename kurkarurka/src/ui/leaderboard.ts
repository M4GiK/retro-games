/**
 * Ranking lokalny — repozytorium rekordów w localStorage.
 *
 * Wzorzec Repozytorium: klasa Leaderboard izoluje szczegóły składowania
 * (klucz, format JSON, limit top 5) za prostym API load/qualifies/add.
 * Reszta gry operuje na typie ScoreEntry i nie wie, skąd biorą się dane.
 */

/** Wpis w rankingu — inicjały gracza, wynik i statystyki rundy. */
export interface ScoreEntry {
  name: string;      // 3-litery inicjały
  score: number;
  eggs: number;
  mode: 'N' | 'H';   // normal / hard
}

export class Leaderboard {
  /** Klucz w localStorage (wersjonowany — v1). */
  private static readonly KEY = 'kvl-scores-v1';
  /** Rozmiar tabeli rekordów (top N). */
  private static readonly MAX = 5;

  /** Wczytuje posortowaną tabelę rekordów (malejąco po score). */
  load(): ScoreEntry[] {
    try {
      const raw = localStorage.getItem(Leaderboard.KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(s => typeof s?.score === 'number') : [];
    } catch {
      return [];
    }
  }

  /** Czy wynik kwalifikuje się do tabeli rekordów (top 5). */
  qualifies(score: number): boolean {
    if (score <= 0) return false;
    const scores = this.load();
    return scores.length < Leaderboard.MAX || score > scores[scores.length - 1].score;
  }

  /** Dopisuje rekord, sortuje i przycina tabelę do top 5. */
  add(e: ScoreEntry): ScoreEntry[] {
    const scores = this.load();
    scores.push(e);
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, Leaderboard.MAX);
    try {
      localStorage.setItem(Leaderboard.KEY, JSON.stringify(top));
    } catch {
      // prywatny tryb / pełny storage — ranking nie zapisze się
    }
    return top;
  }
}
