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
- **Mobile**: na ekranach dotykowych doklejany jest RetroPad —
  krzyżak + A (ogień) + B (broń 2) w klimacie NES; w menu D-pad nawiguje,
  A/START = OK, B/SELECT = wstecz. Na desktopie `?pad` wymusza widok.
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

## Gra online (TURN — przejście przez NAT)

WebRTC potrzebuje **TURN**, żeby zestawić połączenie przez internet
(CGNAT, symmetric NAT, firmowe WiFi). Sam STUN działa tylko w tej samej
sieci / przy publicznym IP — bez TURN dołączenie kończy się timeoutem
„Pokój nie odpowiada".

**Poświadczenia NIE są w repo.** `build.mjs` wstrzykuje je do bundla
przez esbuild `define` z dwóch źródeł:

- lokalnie: `jetman-online/turn.secrets.json` (gitignored) — JSON
  z tablicą ICE servers,
- CI (GitHub Pages): sekret repo `TURN_ICE_SERVERS` (Settings →
  Secrets and variables → Actions) z tą samą tablicą.

Obecny credential (`jetman-online`, konto **kams** na metered.ca,
darmowy plan 20 GB/mies.) utworzony przez REST API. Bez pliku/sekretu
build ma sam STUN i gra działa tylko w tej samej sieci
(`?transport=local` — dwie karty w przeglądarce).

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
               splash — intro M4GIK SOFTWARE (CRT, pac-man) jak w kurkarurce,
               gamepad — RetroPad: ekranowy pad NES (bits + onAction),
               samowystarczalny komponent do przeniesienia do innych gier
  audio/       sfx — SimEvent → WebAudio (+ blipy UI, jingle splasha),
               music — mp3 z data URI: menu = Last Frame of Glory,
               runda = Thrusters at Maximum (assets/, markery w build.mjs)
  index.html   szablon (markery <!-- GAME_BUNDLE -->, __MUSIC_SRC_*__)
  main.ts      boot + sklejanie modułów
test/          headless testy core/ przez esbuild → node
```

Podział prac na równoległe tickety dla agentów: `AGENTS.md`.
