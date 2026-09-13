/**
 * Transport — KONTRAKT warstwy sieciowej (ticket B).
 *
 * Gra nie wie, czy pod spodem jest WebRTC mesh (trystero, produkcja)
 * czy BroadcastChannel (dwie karty w tej samej przeglądarce — dev/testy).
 * Transport dostarcza tylko: join po kodzie pokoju, send do peera/broadcast,
 * zdarzenia peer join/leave. Pokoje, sloty i protokół = net/session.ts.
 */

import type { NetMsg } from '../core/protocol';

export interface TransportHandlers {
  /** Nowy peer wszedł do pokoju (połączenie transportowe gotowe). */
  onPeerJoin(peerId: string): void;
  /** Peer odszedł lub stracił połączenie. */
  onPeerLeave(peerId: string): void;
  /** Wiadomość gry od peera. */
  onMessage(msg: NetMsg, from: string): void;
}

export interface Transport {
  /** Stabilny id tego peera w obrębie pokoju. */
  readonly selfId: string;
  /** Dołącz do pokoju o 4-znakowym kodzie (wielkie litery). */
  join(code: string, handlers: TransportHandlers): void;
  /** Wyślij wiadomość: bez `to` = broadcast do wszystkich peerów. */
  send(msg: NetMsg, to?: string): void;
  /** Opuść pokój i zwolnij zasoby. */
  leave(): void;
}
