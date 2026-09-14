/**
 * Transport produkcyjny — trystero (WebRTC DataChannel mesh).
 * Signaling idzie przez publiczne relaye (domyślnie nostr; można
 * podmienić strategię na torrent/mqtt), więc gra działa z czysto
 * statycznego hostingu (GitHub Pages) — żadnego własnego serwera.
 *
 * Kanał 'm' = jedna akcja na wszystkie NetMsg (JSON). Rzutowanie
 * NetMsg ↔ JsonValue jest bezpieczne — protokół to czysty JSON.
 */

import { joinRoom, selfId as trysteroId, type JsonValue, type Room } from 'trystero';
import { APP_ID, ICE_SERVERS } from '../core/config';
import type { NetMsg } from '../core/protocol';
import type { Transport, TransportHandlers } from './transport';

export function createTrysteroTransport(): Transport {
  let room: Room | null = null;
  let sendAct: ((data: JsonValue, target?: string) => Promise<void>) | null = null;

  return {
    selfId: trysteroId,

    join(code, h) {
      // rtcConfig.iceServers dodaje TURN — bez tego WebRTC nie przejdzie
      // przez CGNAT/symmetric NAT (gra online nie działa przez internet).
      room = joinRoom({ appId: APP_ID, rtcConfig: { iceServers: ICE_SERVERS } }, code);
      const action = room.makeAction<JsonValue>('m');
      sendAct = (data, target) => action.send(data, target ? { target } : undefined);
      action.onMessage = (data, ctx) => h.onMessage(data as unknown as NetMsg, ctx.peerId);
      room.onPeerJoin = peerId => h.onPeerJoin(peerId);
      room.onPeerLeave = peerId => h.onPeerLeave(peerId);
    },

    send(msg, to) {
      void sendAct?.(msg as unknown as JsonValue, to);
    },

    leave() {
      void room?.leave();
      room = null;
      sendAct = null;
    },
  };
}
