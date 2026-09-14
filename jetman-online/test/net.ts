// Test netcode'u: dwóch graczy przez BroadcastChannel (jak ?transport=local).
// Node 22 ma wbudowany BroadcastChannel — ten sam kod co w przeglądarce.
import { Session, type SessionEvents } from '../src/net/session';
import { createLocalTransport } from '../src/net/local';
import type { PlayerSlot } from '../src/core/protocol';

let passed = 0, failed = 0;
function ok(name: string, cond: boolean, extra = ''): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function run(): Promise<void> {
  console.log('Test netcode — dwóch graczy przez transport lokalny\n');

  // ---- 1. Host tworzy pokój ----
  console.log('[1] Host tworzy pokój');
  const hostEv: SessionEvents = {
    onLobby: (_p: PlayerSlot[], _s: number) => {},
    onStart: (_seed: number, _level: number) => {},
    onMsg: () => {},
    onHostGone: () => {},
    onPeerGone: () => {},
  };
  const host = Session.create(createLocalTransport(), 'HOST', 'minigun', 'rocket', hostEv);
  ok('host ma slot 0', host.slot === 0);
  ok('host ma kod 4-znakowy', host.code.length === 4);
  ok('host ma 1 gracza w lobby', host.players.length === 1);

  // ---- 2. Gość dołącza kodem ----
  console.log('[2] Gość dołącza kodem');
  const guestState: { lobby?: PlayerSlot[]; slot: number; started?: boolean; seed?: number; level?: number } = { slot: -1 };
  const guestEv = {
    onLobby: (p: PlayerSlot[], s: number) => { guestState.lobby = p; guestState.slot = s; },
    onStart: (seed: number, level: number) => { guestState.started = true; guestState.seed = seed; guestState.level = level; },
    onMsg: () => {},
    onHostGone: () => {},
    onPeerGone: () => {},
  };
  const guestTransport = createLocalTransport();
  const guest = await Session.join(guestTransport, 'GUEST', host.code, 'laser', 'mine', guestEv);
  await sleep(100); // daj czas na propagację lobby do hosta
  ok('gość dostał slot 1', guestState.slot === 1, `slot=${guestState.slot}`);
  ok('gość widzi 2 graczy', guest.players.length === 2, `len=${guest.players.length}`);
  ok('host widzi 2 graczy', host.players.length === 2, `len=${host.players.length}`);
  ok('gość ma nick GUEST', guest.players[1]?.name === 'GUEST');
  ok('gość ma w1=laser', guest.players[1]?.w1 === 'laser');

  // ---- 3. Host widzi loadout gościa ----
  console.log('[3] Loadout gościa u hosta');
  ok('host widzi w1 gościa = laser', host.players[1]?.w1 === 'laser', `w1=${host.players[1]?.w1}`);
  ok('host widzi w2 gościa = mine', host.players[1]?.w2 === 'mine', `w2=${host.players[1]?.w2}`);

  // ---- 4. Zmiana loadoutu propaguje się ----
  console.log('[4] Gość zmienia loadout');
  guest.setLoadout('shotgun', 'laser');
  await sleep(100);
  ok('host widzi nowy w1 gościa = shotgun', host.players[1]?.w1 === 'shotgun', `w1=${host.players[1]?.w1}`);

  // ---- 5. Host startuje rundę ----
  console.log('[5] Host startuje rundę');
  const seed = 12345, level = 0;
  let hostStarted = false;
  hostEv.onStart = () => { hostStarted = true; };
  host.startRound(seed, level);
  await sleep(100);
  ok('host dostał onStart', hostStarted);
  ok('gość dostał onStart', guestState.started === true);
  ok('gość dostał poprawny seed', guestState.seed === seed, `seed=${guestState.seed}`);
  ok('gość dostał poprawny level', guestState.level === level, `level=${guestState.level}`);

  // ---- 6. Wyjście gościa zwalnia slot ----
  console.log('[6] Gość wychodzi');
  let peerGoneSlot = -1;
  hostEv.onPeerGone = (_id: string, slot: number) => { peerGoneSlot = slot; };
  guest.leave();
  await sleep(100);
  ok('host dostał onPeerGone dla slotu 1', peerGoneSlot === 1, `slot=${peerGoneSlot}`);
  ok('host ma znowu 1 gracza', host.players.length === 1, `len=${host.players.length}`);

  host.leave();

  // ---- 7. Trzech graczy (2+ jak w spec) ----
  console.log('[7] Trzech graczy w jednym pokoju');
  const host2Ev = { onLobby: () => {}, onStart: () => {}, onMsg: () => {}, onHostGone: () => {}, onPeerGone: () => {} };
  const host2 = Session.create(createLocalTransport(), 'H', 'minigun', 'rocket', host2Ev);
  const g2State = { slot: -1, count: 0 };
  const g2 = await Session.join(createLocalTransport(), 'G2', host2.code, 'laser', 'mine', {
    onLobby: (p) => { g2State.slot = p.find(pl => pl.name === 'G2')?.slot ?? -1; g2State.count = p.length; },
    onStart: () => {}, onMsg: () => {}, onHostGone: () => {}, onPeerGone: () => {},
  });
  const g3State = { slot: -1, count: 0 };
  const g3 = await Session.join(createLocalTransport(), 'G3', host2.code, 'shotgun', 'laser', {
    onLobby: (p) => { g3State.slot = p.find(pl => pl.name === 'G3')?.slot ?? -1; g3State.count = p.length; },
    onStart: () => {}, onMsg: () => {}, onHostGone: () => {}, onPeerGone: () => {},
  });
  await sleep(150);
  ok('host2 ma 3 graczy', host2.players.length === 3, `len=${host2.players.length}`);
  ok('g2 dostał slot 1', g2State.slot === 1, `slot=${g2State.slot}`);
  ok('g3 dostał slot 2', g3State.slot === 2, `slot=${g3State.slot}`);
  ok('g3 widzi 3 graczy', g3State.count === 3, `count=${g3State.count}`);
  ok('sloty unikalne', new Set(host2.players.map(p => p.slot)).size === 3);
  host2.leave(); g2.leave(); g3.leave();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} testów netcode nie przeszło`);
}

run().catch(e => { console.error('TEST CRASH:', e); throw e; });
