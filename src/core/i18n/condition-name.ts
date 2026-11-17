// The name of a weather condition: the catalog's word for one of Home Assistant's condition words, else the integration's own word.
// Pattern: a pure function at the language seam (ADR 0013), beside `roomName`: moved from Weather's model by #265, because the smart
// stack's Tomorrow card names the condition too and a feature never imports another (ADR 0011).
// Must not: read the states or the clock, or word anything but through `t`.
import {capitalise} from '../figures.ts';
import type {Translate} from './messages.ts';

/** Home Assistant's condition words, each with its own message. */
const CONDITIONS = [
  'clear-night',
  'cloudy',
  'fog',
  'hail',
  'lightning',
  'lightning-rainy',
  'partlycloudy',
  'pouring',
  'rainy',
  'snowy',
  'snowy-rainy',
  'sunny',
  'windy',
  'windy-variant',
  'exceptional',
] as const;
type Condition = (typeof CONDITIONS)[number];
const isCondition = (word: string): word is Condition => (CONDITIONS as readonly string[]).includes(word);

/**
 * The name of a condition: the catalog's word for one Home Assistant knows, else the integration's own word with a capital
 * and the rest in lower case (Environment Canada sends `Mainly Sunny`); nothing for no condition.
 */
export function conditionName(condition: string | null, t: Translate): string {
  if (!condition) return '';
  return isCondition(condition)
    ? t(`weather.cond.${condition}`)
    : capitalise(condition.slice(0, 1) + condition.slice(1).toLowerCase());
}
