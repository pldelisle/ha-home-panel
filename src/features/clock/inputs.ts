// readClock: what the idle clock shows at an instant, read from the states: the sun, the two temperatures and the condition.
// Pattern: the read half of a pure model (Fowler, Presentation Model), over the providers (ADR 0025): the temperatures are
// `readHomeTemperatures`, the sun's times `sunTimes` for the house's day and the next. It replaced the legacy `renderIdle`'s reads (#276).
// Must not: word anything (the model does), read the clock (`now` is given) or the DOM, or read an entity `clockIds` does not list.
import type {ResolvedConfig} from '../../core/config.ts';
import {DAY_MS} from '../../core/figures.ts';
import type {HassEntities} from '../../core/hass.ts';
import {textOf} from '../../core/states.ts';
import {sunTimes} from '../../core/sun.ts';
import {readHomeTemperatures} from '../../providers/home-temperatures.ts';

export interface ClockInputs {
  now: number;
  /** The sun entity is above the horizon, or the house has none: the icon is the day's. */
  sunUp: boolean;
  /** Today's sunrise and sunset and tomorrow's sunrise at the house; null where the sun does not cross. */
  sunrise: number | null;
  sunset: number | null;
  tomorrowSunrise: number | null;
  /** The rooms' average temperature. */
  inside: number | null;
  /** The weather entity's temperature, else the outdoor sensor's. */
  outside: number | null;
  /** The condition sensor's state, else the weather entity's; null when neither is available. */
  condition: string | null;
}

/** Where the house is, as Home Assistant's config says; 0 when it does not. */
export interface Place {
  latitude?: number;
  longitude?: number;
}

export function readClock(
  states: HassEntities,
  config: ResolvedConfig,
  place: Place,
  {now, isoDay}: {now: number; isoDay: (ms: number) => string},
): ClockInputs {
  const {sun, cond, weather} = config.entities;
  const lat = place.latitude ?? 0,
    lon = place.longitude ?? 0;
  const today = sunTimes(lat, lon, isoDay(now)),
    tomorrow = sunTimes(lat, lon, isoDay(now + DAY_MS));
  const sunState = sun ? states[sun] : undefined;
  return {
    now,
    sunUp: !sunState || sunState.state === 'above_horizon',
    sunrise: today.rise,
    sunset: today.set,
    tomorrowSunrise: tomorrow.rise,
    ...readHomeTemperatures(states, config),
    condition: textOf(states, cond) ?? textOf(states, weather),
  };
}
