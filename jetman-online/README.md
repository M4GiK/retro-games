# Jetman Online

Klon Jetmen Revival na 2–4 graczy online — pokoje na kody, wspólny
widok z kamerą na dużych mapach. WebRTC (trystero), zero serwera —
działa z GitHub Pages.

## Mechanika (jak w oryginale)

- **Statek**: obrót + ciąg + grawitacja, **paliwo** na ciąg, **energia**
  jako HP (trafienia i twarde uderzenia w teren).
- **Bail-out**: zniszczony statek → pilot na jetpacku z **karabinkiem**
  i **rakietami samonaprowadzającymi** — może nieść flagę, ale pada
  od jednego trafienia.
- **Bronie do wyboru w lobby** (primary `▼/CTRL` + secondary `X`):
  minigun, rakieta, shotgun, laser, mina.
- **Flaga na linie** ciągnięta za nosicielem; doniesienie do bazy = 5 pkt,
  frag = 1 pkt, pula żyć.
- **Niszczalny teren** (eksplozje wydrążają skałę) i **strefy**:
  woda (wyporność+opór), śnieg (hamowanie), klej (unieruchamia).
- Mapy: `klasyk` (arena) i `jaskinie` (64×60 kafelków, tunele, jezioro).

## Komendy

```bash
npm install
npm run dev        # watch → dist/jetman-dev.html
npm run build      # produkcja → dist/jetman.html
npm run typecheck  # tsc --noEmit
npm run test:sim   # testy symulacji headless
```

## Struktura

```
src/
  core/        czysta logika (bez DOM/sieci): config, types, protocol,
               rng, weapons (tabela broni), level (mutowalny teren+strefy),
               physics (tether, homing, kolizje), sim — autorytet gry
  net/         transport (trystero/local) + session (lobby, sloty, loadout)
  game/        hostLoop (autorytet + snapshoty + ack inputów)
               / guestLoop (replay predykcji + adaptacyjna interpolacja)
  systems/     input (klawiatura → bitmaska, IN_FIRE2 = broń 2)
  render/      scene (kamera, warstwa terenu, radar), sprites, hud, effects
  ui/          menu — nakładki DOM (menu/join/lobby: bronie+mapa/over),
               splash — intro M4GIK SOFTWARE (CRT, pac-man) jak w kurkarurce
  audio/       sfx — SimEvent → WebAudio (+ blipy UI, jingle splasha),
               music — mp3 z data URI: menu = Last Frame of Glory,
               runda = Thrusters at Maximum (assets/, markery w build.mjs)
  index.html   szablon (markery <!-- GAME_BUNDLE -->, __MUSIC_SRC_*__)
  main.ts      boot + sklejanie modułów
test/          headless testy core/ przez esbuild → node
```

Podział prac na równoległe tickety dla agentów: `AGENTS.md`.
