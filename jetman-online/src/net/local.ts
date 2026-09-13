/**
 * Transport lokalny — BroadcastChannel między kartami/oknami tej samej
 * przeglądarki. Zero sieci: dev, testy netcode'u i granie "na jednym
 * kompie" bez trysterowych trackerów (np. ?transport=local).
 *
 * Protokół obok własnego kanału 'jetman-local:<kod>':
 *   join:  nowy peer pyta -> inni odpowiadają 'hi' (odkrywanie peerów)
 *   msg:   dane gry (to = id adresata, brak = broadcast)
 *   bye:   ogłoszenie wyjścia
 */

import type { NetMsg } from '../core/protocol';
import type { Transport, TransportHandlers } from './transport';

interface Envelope {
  k: 'join' | 'hi' | 'msg' | 'bye';
  from: string;
  to?: string;
  data?: NetMsg;
}

export function createLocalTransport(): Transport {
  const selfId = Math.random().toString(36).slice(2, 10);
  let chan: BroadcastChannel | null = null;
  const peers = new Set<string>();

  return {
    selfId,

    join(code, h) {
      chan = new BroadcastChannel(`jetman-local:${code}`);
      chan.onmessage = (e: MessageEvent<Envelope>) => {
        const m = e.data;
        if (m.from === selfId) return;
        if (m.to && m.to !== selfId) return;
        switch (m.k) {
          case 'join':
            if (!peers.has(m.from)) { peers.add(m.from); h.onPeerJoin(m.from); }
            chan!.postMessage({ k: 'hi', from: selfId, to: m.from } satisfies Envelope);
            break;
          case 'hi':
            if (!peers.has(m.from)) { peers.add(m.from); h.onPeerJoin(m.from); }
            break;
          case 'msg':
            if (m.data) h.onMessage(m.data, m.from);
            break;
          case 'bye':
            if (peers.delete(m.from)) h.onPeerLeave(m.from);
            break;
        }
      };
      chan.postMessage({ k: 'join', from: selfId } satisfies Envelope);
    },

    send(msg, to) {
      chan?.postMessage({ k: 'msg', from: selfId, to, data: msg } satisfies Envelope);
    },

    leave() {
      chan?.postMessage({ k: 'bye', from: selfId } satisfies Envelope);
      chan?.close();
      chan = null;
      peers.clear();
    },
  };
}
