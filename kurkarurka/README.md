# Kurkarurka (TypeScript)

Gra zręcznościowa w estetyce NES/Pegasus: kurka zbiera jajka i skacze na lisy.
TypeScript + Matter.js, kompilowana do **jednego offline'owego pliku HTML** —
można go otworzyć bez serwera i bez internetu.

Wizualnie: stała rozdzielczość 256×240 skalowana przez `image-rendering: pixelated`,
sprite'y rysowane z map znakowych (`sprites.ts`), kafelkowe tło, dithering,
scanliny CRT. Płynny cykl doby (`daynight.ts`) domieszkowuje ambient fazy do
kolorów świata — świt, dzień, zmierzch i noc zmieniają odcień ziemi, kurki
i lisów; nocą na niebie sierp księżyca i gwiazdy. Audio: kanały w stylu NES
(square/triangle/noise, WebAudio).

## Wymagania

- Node.js 18+ i npm

## Komendy

```bash
npm install        # jednorazowo
npm run dev        # watch: dist/kurnik-dev.html (bez minifikacji + sourcemap)
npm run build      # produkcja: dist/kurnik-physics.html (zminifikowany, ~100 KB)
npm run typecheck  # tsc --noEmit
```

## Jak grać

- **Ruch:** `A`/`D` lub `←`/`→` · na dotyku — ekranowy pad `◀ ▶`
- **Skok:** `W`, `↑` lub `spacja` · na dotyku — `⤒` lub stuknięcie ekranu
  poza padem. Fizyka à la Mario: przytrzymanie = wyższy skok, puszczenie
  ucina wznoszenie; działa coyote time i bufor skoku przy lądowaniu.
- **Tryby:**
  - `PRZYGODA` — platformówka: przewijane poziomy z przepaściami,
    platformami i patrolującymi lisami; zbieraj jajka i dotrzyj do gniazda
    na końcu. Każdy kolejny poziom jest dłuższy i trudniejszy (nowe typy
    wrogów, szersze dziury, ptaki przelatujące od poziomu 2). Co 5. poziom
    to arena bossa: wielki wilk pod deszczem głazów i pająków — po
    pokonaniu fanfara i powrót do przygody.
  - `KOSZMAR` — arena przetrwania przewijana na 5 ekranów w prawo:
    zbieraj jajka spadające po całej arenie, unikaj kamieni, skacz
    liskom na łeb. Liski ruszają po ~9 s i wpadają falami znad
    krawędzi ekranu (max 5 naraz; od trudności 3 część fal
    zaskakuje z obu stron). Trudność rośnie co 10 s — fale robią
    się większe i częstsze; wilk-boss co 4. poziom, a podczas
    walki z nim fale lisków czekają.
- **Wspólne:** skok na łeb lisa = punkty (u Mario), utrata jajka lub
  trafienie resetuje combo; trafienie daje chwilę nietykalności.
- **Power-upy:** serce (+1 życie), tarcza, magnes na jajka (koszmar),
  spowolnienie czasu, dodatkowy skok (w przygodzie jedyny sposób
  na podwójny skok).
- **Boss:** wielki wilk z 8+ HP, zrzuca przeszkody — w koszmarze co
  4. poziom trudności; w przygodzie co 5. poziom to osobna arena (jajka,
  głazy i pająki celowane w gracza), a każda kolejna arena jest twardsza.
- Ranking top 5 z inicjałami trzymany jest lokalnie w `localStorage`.
- **Pełny ekran na mobile:** na Androidzie gra sama wchodzi w fullscreen
  przy pierwszym dotknięciu; na iPhonie — `Udostępnij → Dodaj do ekranu
  początkowego`, ikona odpala grę standalone, bez paska Safari (wymaga
  serwowania po http/https, np. GitHub Pages).

## Struktura

```
src/
  index.html          — szablon strony (CSS + markup), znacznik <!-- GAME_BUNDLE -->
  main.ts             — punkt wejścia / korzeń kompozycji (składa systemy, DI)
  core/
    config.ts         — stałe strojenia: rozdzielczość, prędkości, interwały
    types.ts          — typy gameData (PlayerData, EggData, EnemyData...) + augmentacja Matter.Body
    state.ts          — stan sesji: gameState, efekty, rejestry encji (singleton)
  engine/
    physics.ts        — PhysicsEngine: fasada nad Matter.js, ciała stałe świata
    factory.ts        — EntityFactory: tworzenie encji (jajka, lisy, bonusy, segmenty, platformy)
    level.ts          — generator poziomów przygody (segmenty, przepaści, patrole, meta)
  systems/
    input.ts          — InputManager: klawiatura + ekranowy pad + fullscreen na dotyk
    game.ts           — Game: pętla rozgrywki (beforeUpdate), start(mode), gameOver
  render/
    sprites.ts        — atlas sprite'ów (mapy znakowe + palety) i rasteryzer
    daynight.ts       — cykl doby: klucze faz, miks ambientu, cieniowanie palet
    scene.ts          — SceneRenderer: klatka gry, HUD, demo attract-mode, CRT
  audio/
    audio.ts          — AudioSystem: SFX WebAudio + muzyka (mp3 / chiptune fallback)
  ui/
    screens.ts        — ScreenManager: maszyna stanów ekranów i nawigacja
    splash.ts         — SplashScreen: animacja CRT (power-on/off) + jingle
    leaderboard.ts    — Leaderboard: repozytorium rekordów (localStorage, top 5)
    fullscreen.ts     — detekcja standalone + instrukcja A2HS dla iOS
assets/               — mp3 per tryb: Quarter_in_the_Slot.mp3 (przygoda),
                        The_Giant_s_Pounce.mp3 (koszmar) — data URI w buildzie
concept/              — stare wersje gry (referencja)
dist/                 — wynik kompilacji (pojedynczy plik HTML)
```

## Uwagi

- Muzyka: utwory z `assets/` są osadzane w buildzie jako data URI —
  `build.mjs` podmienia `__MUSIC_SRC__` (przygoda) i `__MUSIC_SRC_HARD__`
  (koszmar) w `src/index.html`; `AudioSystem.tryPlay(mode)` wybiera
  właściwą ścieżkę. Gdy odtworzenie mp3 się nie powiedzie, gra odpala
  syntezowany chiptune (`AudioSystem.startMusic` w `audio/audio.ts`).
- Dane encji siedzą w `body.gameData` — typy zdefiniowane w `core/types.ts`,
  rzutowanie przez `as PlayerData` / `as EggData` / `as EnemyData`.
