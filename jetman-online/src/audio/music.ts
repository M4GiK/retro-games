/**
 * Muzyka tła — mp3 osadzone w buildzie jako data URI (zero fetchy, offline).
 *
 * #bgmMenu ("Last Frame of Glory") gra pod ekranami menu/lobby,
 * #bgmGame ("Thrusters at Maximum") podczas rundy. Elementy <audio>
 * siedzą w index.html; tu tylko przełączanie play/pause.
 *
 * Autoplay: play() przed pierwszym gestem użytkownika odrzuca się —
 * wtedy pierwszy pointerdown/keydown odpala wyczekujący utwór.
 */

type Track = 'menu' | 'game';

const IDS: Record<Track, string> = { menu: 'bgmMenu', game: 'bgmGame' };
// Gra ciszej — syntezowane SFX muszą się przebić przez utwór.
const VOL: Record<Track, number> = { menu: 0.8, game: 0.55 };

let current: Track | null = null;
let muted = false;
let gestureHooked = false;

function trackEl(t: Track): HTMLAudioElement | null {
  return document.getElementById(IDS[t]) as HTMLAudioElement | null;
}

/** Pierwszy gest po zablokowanym autoplay odpala bieżącą ścieżkę. */
function hookGesture(): void {
  if (gestureHooked) return;
  gestureHooked = true;
  const retry = () => {
    if (!current || muted) return;
    const a = trackEl(current);
    if (a && a.paused) void a.play().catch(() => {});
  };
  window.addEventListener('pointerdown', retry);
  window.addEventListener('keydown', retry);
}

/** Przełącza muzykę na ścieżkę t; ta sama już gra = nic nie rób. */
export function playMusic(t: Track): void {
  if (current === t) return;
  current = t;
  for (const k of Object.keys(IDS) as Track[]) {
    const a = trackEl(k);
    if (!a) continue;
    if (k !== t) { a.pause(); continue; }
    a.volume = VOL[k];
    if (!a.paused || muted) continue;
    void a.play().catch(hookGesture);
  }
}

/**
 * Wycisza/przywraca samą muzykę — SFX syntezuje sfx.ts osobno i gra dalej.
 * Stan przeżywa zmianę ścieżki: wyciszony w grze nie wróci w menu.
 * Zwraca stan po zmianie (true = wyciszona).
 */
export function toggleMusicMute(): boolean {
  muted = !muted;
  const a = current ? trackEl(current) : null;
  if (a) {
    if (muted) a.pause();
    else void a.play().catch(hookGesture);
  }
  return muted;
}
