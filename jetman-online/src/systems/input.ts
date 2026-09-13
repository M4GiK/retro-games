/**
 * Wejście — klawiatura → bitmaska InputBits (IN_*).
 *
 * Sterowanie jak w oryginale: ◀ ▶ obrót, ▲ ciąg, ▼/spacja/ctrl ogień
 * podstawowy, X/Shift — broń secondary (rakiety). U pilota: ogień =
 * karabinek, secondary = rakieta samonaprowadzająca.
 * Zwraca liczbę — gotową do wysłania jako `bits` w wiadomości 'input'.
 */

import { IN_FIRE, IN_FIRE2, IN_LEFT, IN_RIGHT, IN_THRUST, type InputBits } from '../core/types';

export class InputManager {
  private readonly keys = new Set<string>();

  init(): void {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    // Utrata fokusu okna — inaczej wciśnięty klawisz "zawiesza" ruch.
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Aktualny stan wejścia jako bitmaska. */
  getBits = (): InputBits => {
    let b = 0;
    const k = this.keys;
    if (k.has('arrowleft') || k.has('a')) b |= IN_LEFT;
    if (k.has('arrowright') || k.has('d')) b |= IN_RIGHT;
    if (k.has('arrowup') || k.has('w')) b |= IN_THRUST;
    if (k.has('arrowdown') || k.has('s') || k.has(' ') || k.has('control')) b |= IN_FIRE;
    if (k.has('x') || k.has('shift')) b |= IN_FIRE2;
    return b;
  };

  clear(): void {
    this.keys.clear();
  }
}
