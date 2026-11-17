// stackModel: the cards in, the one card the stack shows at an instant out, with its place among those taking turns.
// Pattern: a pure view-model function (Meszaros, Fowler, humble object): the Home card's filter (no who's-home filler, since the
// Who's home chips sit right above it, as the legacy `renderHomeStack` did) and the rotation's pick; the idle screen keeps every card.
// Must not: read the clock (`now` is passed in), compute a card (the rules do), or word anything.
import type {StackCard} from './cards.ts';
import {pickStack} from './rotation.ts';

/** Where the stack is: in the Home card on a tablet, or beside the idle clock. */
export type StackMode = 'home' | 'idle';

export interface StackViewModel {
  card: StackCard;
  /** Its place among the cards taking turns, and how many there are: the dots under the card. */
  i: number;
  n: number;
}

/** The card for this tick in this mode; null when none applies, and the slot hides. */
export function stackModel(cards: readonly StackCard[], now: number, mode: StackMode): StackViewModel | null {
  return pickStack(mode === 'home' ? cards.filter(c => !(c.key === 'who' && c.filler)) : cards, now);
}
