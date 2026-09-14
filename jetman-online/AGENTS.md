# AGENTS.md — jetman-online

Klon **Jetmen Revival** (jak open-source'owy AngryJets) na przeglądarkę:
2–4 graczy online, pokoje na 4-znakowe kody, jeden wspólny widok
z kamerą — koniec z podglądaniem split-screenu.

Mechaniki z oryginału (megaplan): paliwo + energia statku, wybór
broni primary/secondary w lobby (minigun/rakieta/shotgun/laser/mina),
niszczalny teren (eksplozje wydrążają skałę, diffy lecą siecią),
strefy wody/śniegu/kleja zmieniające fizykę, flaga na linie ciągnięta
za nosicielem, **bail-out**: zniszczony statek → pilot na jetpacku
z karabinkiem i rakietami samonaprowadzającymi — może nieść flagę,
jedno trafienie = śmierć.

Obowiązują zasady z root `AGENTS.md` (prosty kod, zero zbędnych
zależności, komentarze/UI/commity po polsku, strict TS).

## Architektura — DLACZEGO tak

- **Zero serwera.** GitHub Pages = statyka. Transport = `trystero`
  (WebRTC DataChannel, signaling po publicznych relayach nostr).
  Do devu: `?transport=local` = BroadcastChannel między kartami.
- **Host-authoritative.** Twórca pokoju symuluje świat (`HostLoop`)
  i rozsyła snapshoty co `SNAPSHOT_EVERY` ticków; goście wysyłają
  tylko bitmaski inputu (`GuestLoop`) i robią predykcję własnego jeta.
- **`core/` to czysty TS** — zero DOM, zero sieci, zero `Math.random`
  (tylko `rng.ts`). Dzięki temu: testowalne headless (`npm run test:sim`),
  identyczne u hosta i gościa, przenośne na serwer gdyby kiedyś powstał.
- **Kontrakty przed implementacją:** `core/types.ts` (SimState,
  SimEvent, InputBits), `core/protocol.ts` (NetMsg, Snap),
  `net/transport.ts` (Transport). Zmiana kontraktu = zmiana
  skutkująca u innych — najpierw uzgodnij, potem kod.

## Podział na tickety (równoległa praca agentów)

Zasada: jeden agent = jeden ticket = własne pliki. Pliki z kolumny
"kontrakt" są READ-ONLY dla ticketów (zmiana tylko po uzgodnieniu).

| Ticket | Pliki | Kontrakt | Zadanie |
|--------|-------|----------|---------|
| **A — sim** | `core/physics.ts`, `core/sim.ts` | `types.ts`, `config.ts`, `weapons.ts`, `level.ts` | fizyka statku/pilota (paliwo, energia, tether flagi, bail-out), bronie z tabeli WEAPONS, niszczenie terenu, flagi CTF, życia. Weryfikacja: `npm run test:sim` |
| **B — netcode** | `net/session.ts`, `net/local.ts`, `net/trystero.ts`, `game/hostLoop.ts`, `game/guestLoop.ts` | `protocol.ts`, `transport.ts` | lobby+loadout, inputy→host (seq/ack), snapshoty→goście, replay predykcji, adaptacyjna interpolacja |
| **C — render** | `render/scene.ts`, `render/sprites.ts`, `render/hud.ts`, `render/effects.ts` | `types.ts` (SimState), `SimEvent` | sprite'y statek/pilot, warstwa terenu (invalidateTerrain po 'terrain'), kamera, radar, HUD pasków. Dev bez sieci: `?demo` |
| **D — UI** | `ui/menu.ts`, `src/index.html` (warstwa DOM) | `protocol.ts` (PlayerSlot) | ekrany menu/join/lobby/over, wybór broni (w1/w2) i mapy, `?room=KOD` deep-link |
| **E — audio** | `audio/sfx.ts` | `types.ts` (SimEvent) | syntezowane SFX: ogień per broń, boom, bail-out, splash stref |
| **F — poziomy** | `core/level.ts` (tablica LEVELS) | `LevelData`, znaki tilemapy | mapy dowolnego rozmiaru; znaki: `#` skała, `X` twarda, `w/s/g` strefy, `0-3` bazy |

Zasada: jeden agent = jeden ticket = własne pliki. Pliki z kolumny
"kontrakt" są READ-ONLY dla ticketów (zmiana tylko po uzgodnieniu).

## Przepływ rozgrywki

```
menu.ts → Session.create/join (lobby, sloty 0-3, loadout w1/w2)
        → host START → 'start' {seed, level}
host:   HostLoop  — setInterval TICK_MS → stepSim(sim, inputs)
                  → co 3. tick 'snap' {Snap{ack}, ev} broadcast
guest:  GuestLoop — 'input' 30 Hz → host; 'snap' → reset do autorytetu
                  → replay niepotwierdzonych inputów (seq > ack)
                  → interp cudzych jetów z adaptacyjnym delay
render: rAF → drawScene(SimState, kamera) + effects(SimEvent) + drawHud
        'terrain' events → invalidateTerrain (dziury w warstwie mapy)
```

Wyjście hosta = koniec pokoju (brak migracji w v1).

## Komendy

```bash
npm run dev        # watch → dist/jetman-dev.html
npm run build      # produkcja → dist/jetman.html + dist/index.html
npm run typecheck  # tsc --noEmit — MUSI przechodzić po każdej zmianie
npm run test:sim   # headless testy core/ (node, bez przeglądarki)
npm run test:net   # headless testy netcode'u (2+ graczy, BroadcastChannel)
npm run test:guest # headless repro widoku gościa (śmierć/respawn, regresja)
```

## Testowanie ręczne

- `dist/jetman-dev.html?demo` — solo z botem (dev renderu/audio).
- Serwuj `dist/` (`python3 -m http.server`) i otwórz
  `jetman-dev.html?transport=local` w dwóch kartach → gra bez internetu.
- Prawdziwe WebRTC: ta sama strona na 2 urządzeniach, jeden tworzy
  pokój i podaje 4-znakowy kod.

## Uwagi

- `?demo` i `?transport=local` są celowymi ścieżkami dev — nie usuwać.
- Trystero default = strategia nostr (publiczne relaye). Jak padają,
  `net/trystero.ts` może importować `trystero/torrent` zamiast `.`.
- Snapshoty to JSON (czytelne przy debugowaniu). Binarne dopiero,
  gdy stanie się wąskim gardłem — nie wcześniej.
