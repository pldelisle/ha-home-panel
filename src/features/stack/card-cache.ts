// CardCache: the smart stack's cards kept until what they were computed from changes, so the rotation's tick only picks.
// Pattern: memoization on an explicit key (Norvig, PAIP, "memoization"), the key compared part by part by reference: the store's
// change count, the minute, the history, the forecast and the config's generation. The rules read minutes, so a new minute is a change.
// Must not: read the store, the clock or the DOM (the element hands over the key), or keep more than the last answer.
import {MINUTE_MS} from '../../core/figures.ts';

/** What the cards depend on besides the states: the store's changes, counted; the instant; and what was loaded or heard. */
export interface CardKey {
  /** How many times the store told the stack one of its ids changed. */
  changes: number;
  now: number;
  history: unknown;
  forecast: unknown;
  generation: number;
}

const parts = (key: CardKey): unknown[] => [
  key.changes,
  Math.floor(key.now / MINUTE_MS),
  key.history,
  key.forecast,
  key.generation,
];

export class CardCache<T> {
  private key: unknown[] | undefined;
  private value: T | undefined;

  /** The last answer when nothing in `key` changed since it was computed; else `compute`'s, kept for the next ask. */
  get(key: CardKey, compute: () => T): T {
    const next = parts(key);
    if (this.key && this.key.every((part, i) => part === next[i])) return this.value as T;
    this.value = compute();
    this.key = next;
    return this.value;
  }
}
