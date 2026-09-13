/**
 * Pełny ekran na urządzeniach mobilnych — dwie drogi:
 *
 *  - Fullscreen API (Android / desktop-dotykowy): InputManager woła
 *    requestFullscreen przy pierwszym dotknięciu ekranu — przeglądarka
 *    chowa pasek URL i nawigację systemu.
 *  - iOS Safari: Fullscreen API na iPhonie nie działa — jedyną drogą
 *    jest „Udostępnij → Dodaj do ekranu początkowego" (A2HS). Meta tagi
 *    w index.html sprawiają, że taka ikona odpala grę standalone, bez
 *    chrome'u Safari — wtedy w menu pokazujemy instrukcję.
 *
 * Nie ma API „czy user już dodał ikonę do ekranu głównego" — wykrywalna
 * jest tylko bieżąca sesja standalone (isStandalone). To wystarcza, by
 * schować instrukcję tam, gdzie przestała być potrzebna.
 */

/** Czy bieżąca sesja działa bez chrome'u przeglądarki (A2HS / PWA). */
export function isStandalone(): boolean {
  // iOS Safari: niestandardowe navigator.standalone; reszta: display-mode.
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches;
}

/**
 * Wypełnia i odsłania instrukcję A2HS w menu — wyłącznie na urządzeniach
 * dotykowych bez Fullscreen API (czyt. iOS), które nie są już standalone.
 */
export function initInstallHint(): void {
  const hint = document.getElementById('a2hs');
  if (!hint) return;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (!coarse || document.fullscreenEnabled || isStandalone()) return;
  hint.textContent = 'Pełny ekran: udostępnij → dodaj do ekranu początkowego';
  hint.hidden = false;
}
