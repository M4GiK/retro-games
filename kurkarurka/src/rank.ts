// Ranking lokalny (localStorage): top 5 wyników z inicjałami i trybem gry.
export interface ScoreEntry {
  name: string;      // 3-litery inicjały
  score: number;
  eggs: number;
  mode: 'N' | 'H';   // normal / hard
}

const KEY = 'kvl-scores-v1';
const MAX = 5;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(s => typeof s?.score === 'number') : [];
  } catch {
    return [];
  }
}

export function qualifies(score: number): boolean {
  if (score <= 0) return false;
  const scores = loadScores();
  return scores.length < MAX || score > scores[scores.length - 1].score;
}

export function addScore(e: ScoreEntry): ScoreEntry[] {
  const scores = loadScores();
  scores.push(e);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch {
    // prywatny tryb / pełny storage — ranking nie zapisze się
  }
  return top;
}
