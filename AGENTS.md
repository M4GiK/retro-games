# AGENTS.md — retro-games

Monorepo gier retro/8-bit (M4GiK Software). Launcher `index.html` w root
+ gry w podkatalogach (obecnie `kurkarurka/`).

## Filozofia (w duchu Karpathy'ego)

- **Najlepszy kod to brak kodu.** Wolisz usunąć niż dodać. Każda linia to
  zobowiązanie. Nie dodawaj ficzerów, opcji ani "użytecznych" utili, o które
  nikt nie prosił.
- **Prosty, nudny kod wygrywa.** Plain TypeScript + esbuild → jeden HTML.
  Bez frameworków, bez dodatkowych build-stepów, bez magii.
- **Zero nowych zależności bez pytania.** Dependency to dług. Stack to
  `matter-js` + `esbuild` + `typescript` — i tak ma zostać. Zanim zaproponujesz
  paczkę, napisz te ~30 linii sam.
- **Nie abstrahuj po jednym użyciu.** Kopiuj-wklej dwa razy, zanim wyciągniesz
  wspólną funkcję. Konkretna pętla > sprytna abstrakcja. Żadnych klas-
  menedżerów-fabryk tam, gdzie wystarczy funkcja.
- **Małe, działające kroki.** Jedna zmiana naraz, minimalny diff, po każdej
  zmianie projekt ma się budować. Nie zostawiaj repo w stanie popsutym.
- **Dane ponad logikę.** Magiczne liczby i strojenie grywalności trzymaj
  w jednym miejscu (`core/config.ts`), nie rozrzucaj po systemach.
- **Czytelność > spryt.** Komentarze tłumaczą *dlaczego*, nie *co*.
  Jednolinijkowce i chaining, który trzeba debugować w głowie — odpadają.
- **Ograniczenia to feature.** Gra MUSI działać offline jako jeden plik HTML:
  zero fetchy, zero assetów sieciowych, zero fontów CDN — wszystko inline
  lub osadzone przez `build.mjs`.

## Struktura

- `index.html` (root) — launcher w stylu Switch/NES. Nowa gra = wpis
  w tablicy `GAMES` (szczegóły w root README).
- `kurkarurka/` — gra TypeScript + Matter.js → pojedynczy HTML w `dist/`.
- `kurkarurka/src/index.html` — szablon strony; `build.mjs` podmienia
  `<!-- GAME_BUNDLE -->` i `__MUSIC_SRC__` — nie dublować tej logiki.
- `kurkarurka/concept/` — stare wersje gry. Tylko referencja: nie edytować,
  nie importować, nie "porządkować".

## Komendy (kurkarurka/)

```bash
npm run dev        # watch → dist/kurnik-dev.html (sourcemap)
npm run build      # produkcja → dist/kurnik-physics.html + dist/index.html
npm run typecheck  # tsc --noEmit
```

Po każdej zmianie w `src/`: `npm run typecheck` MUSI przechodzić.
Przy zmianach w buildzie/szablonie: dodatkowo `npm run build`.

## Konwencje

- Język: komentarze, teksty UI i commity **po polsku**; identyfikatory
  w kodzie po angielsku. Commity krótkie, tryb oznajmiający
  (np. `Dodaj workflow publikujący grę na GitHub Pages`).
- TypeScript `strict` — bez `any`. Dane encji siedzą w `body.gameData`,
  typy w `types.ts`, rzutowanie `as PlayerData` / `as EggData` itd.
- Świat gry ma STAŁE 256×240 — fizyka i gameplay nigdy nie skalują się
  od rozmiaru okna; skaluje tylko CSS (`image-rendering: pixelated`).
- Fizyka wyłącznie przez Matter.js — nie pisz równoległej detekcji kolizji.
- Estetyka NES/Pegasus: pixelated, scanliny CRT, kafelki, dithering,
  sprite'y z map znakowych, audio square/triangle/noise (WebAudio).
- Trwa refactor `src/*.ts` → `core/ engine/ systems/ render/ ui/ audio/`:
  przy przenoszeniu plików aktualizuj importy, README i usuwaj martwe
  moduły — nigdy nie zostawiaj dwóch równoległych struktur.
- Sekcja "Struktura" w `kurkarurka/README.md` ma odzwierciedlać
  rzeczywistość — przy zmianach w layoucie `src/` aktualizuj ją.
