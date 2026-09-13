# Kurkarurka (TypeScript)

Gra zręcznościowa w estetyce NES/Pegasus: kurka zbiera jajka i skacze na lisy.
TypeScript + Matter.js, kompilowana do **jednego offline'owego pliku HTML** —
można go otworzyć bez serwera i bez internetu.

Wizualnie: stała rozdzielczość 256×240 skalowana przez `image-rendering: pixelated`,
sprite'y rysowane z map znakowych (`render.ts`), kafelkowe tło, dithering,
scanliny CRT. Audio: kanały w stylu NES (square/triangle/noise, WebAudio).

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
- **Skok:** `W`, `↑` lub `spacja` (podwójny skok w powietrzu) · na dotyku — `⤒`
  lub stuknięcie ekranu poza padem
- **Cel:** zbieraj jajka (złote = 5× punktów), skacz lisom na łeb, unikaj
  spadających przeszkód. Utrata jajka lub trafienie resetuje combo.
- **Tryby:** `PRZYGODA` — od poziomu 1 · `KOSZMAR` — start na poziomie 4
  z bossem od pierwszych sekund.
- **Power-upy:** serce (+1 życie), tarcza, magnes na jajka, spowolnienie
  czasu, dodatkowy skok.
- **Boss:** co 4 poziom trudności — duży lis z 8 HP, zrzuca przeszkody.
- Ranking top 5 z inicjałami trzymany jest lokalnie w `localStorage`.

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
    factory.ts        — EntityFactory: tworzenie encji (jajka, lisy, boss, bonusy, fx)
  systems/
    input.ts          — InputManager: klawiatura + ekranowy pad dotykowy
    game.ts           — Game: pętla rozgrywki (beforeUpdate), start(mode), gameOver
  render/
    sprites.ts        — atlas sprite'ów (mapy znakowe + palety) i rasteryzer
    scene.ts          — SceneRenderer: klatka gry, HUD, demo attract-mode, CRT
  audio/
    audio.ts          — AudioSystem: SFX WebAudio + muzyka (mp3 / chiptune fallback)
  ui/
    screens.ts        — ScreenManager: maszyna stanów ekranów i nawigacja
    splash.ts         — SplashScreen: animacja CRT (power-on/off) + jingle
    leaderboard.ts    — Leaderboard: repozytorium rekordów (localStorage, top 5)
assets/               — Quarter_in_the_Slot.mp3 (osadzany w buildzie jako data URI)
concept/              — stare wersje gry (referencja)
dist/                 — wynik kompilacji (pojedynczy plik HTML)
```

## Uwagi

- Muzyka: `assets/Quarter_in_the_Slot.mp3` jest osadzana w buildzie jako
  data URI — `build.mjs` podmienia `__MUSIC_SRC__` w `src/index.html`.
  Gdy odtworzenie mp3 się nie powiedzie, gra odpala syntezowany
  chiptune (`AudioSystem.startMusic` w `audio/audio.ts`).
- Dane encji siedzą w `body.gameData` — typy zdefiniowane w `core/types.ts`,
  rzutowanie przez `as PlayerData` / `as EggData` / `as EnemyData`.
