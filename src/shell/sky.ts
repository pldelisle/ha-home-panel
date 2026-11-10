// skyWallpaper: which glass wallpaper the Sky choice shows now, from the sun's day, the weather and the clock it is given.
// Pattern: a pure function of its arguments (functional core: Bernhardt, Boundaries); the sun's times come from
// src/core/sun.ts and `now` from the caller, as that module asks. The rules are the legacy class's `skyWp()`, branch for branch.
// Must not: read the clock, the store or the DOM, or name an entity: the controller reads them and passes the values in.

import type {SunTimes} from '../core/sun.ts';

/** What the sky reads of the sun's day: the instants it rises and sets and the first and last light. */
export type SunDay = Pick<SunTimes, 'rise' | 'set' | 'dawn' | 'dusk'>;

/** The wallpapers the sky picks among; the other choices (Sand among them) are the setting's own. */
export type SkyWallpaper = 'lake' | 'aurora' | 'dawn' | 'ember' | 'meadow';

const HOUR_MS = 36e5;

// The conditions that make the sky Meadow: Home Assistant's own codes (every other code is dry, and no dry code holds
// a wet word), then the words Environment Canada uses, searched. Temporary: the legacy class keeps its `condKind` for
// the weather icons until the Weather moves (#157, #158) delete it; test/unit/shell/sky.test.ts reads that copy to prove
// this one agrees, and goes with it.
const WET_CODES = new Set(['fog', 'hail', 'lightning', 'lightning-rainy', 'pouring', 'rainy', 'snowy', 'snowy-rainy']);
const WET_WORDS = /thunder|snow|flurr|ice|hail|rain|shower|drizzle|fog|mist|haze/;

/** True for rain, snow, sleet, storm and fog: the weather that turns the sky to Meadow. */
export function isWetCondition(condition: string | undefined): boolean {
  const word = String(condition || '').toLowerCase();
  return WET_CODES.has(word) || WET_WORDS.test(word);
}

/**
 * Dawn from first light to an hour after sunrise, Ember from an hour before sunset to dusk, Aurora at night, Lake by
 * day, Meadow by day when it rains, snows, storms or fogs. A place where the sun does not rise or set today is Lake.
 */
export function skyWallpaper(condition: string | undefined, day: SunDay, now: number): SkyWallpaper {
  const {rise, set} = day;
  if (!rise || !set) return 'lake';
  if (now < (day.dawn || rise) || now > (day.dusk || set)) return 'aurora';
  if (now < rise + HOUR_MS) return 'dawn';
  if (now > set - HOUR_MS) return 'ember';
  return isWetCondition(condition) ? 'meadow' : 'lake';
}
