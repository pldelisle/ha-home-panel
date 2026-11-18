// sunToday: the sunrise and sunset of today at the house, the one pair Home, Lights and Weather all say; sunNext, the next event, for what runs next.
// Pattern: a provider read (ADR 0025): the computed `sunTimes` of the house's coordinates is the source of truth, and the sun sensors are a
// fallback for a house with no coordinates, since they name the next event (tomorrow's sunrise once today's has passed).
// Must not: read the clock (the caller names the day), touch the DOM or `hass`, or word anything.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import {textOf} from '../core/states.ts';
import {sunTimes} from '../core/sun.ts';

/** A rise and a set in milliseconds; null where the sun does not cross or its sensor reads nothing. */
export interface SunPair {
  rise: number | null;
  set: number | null;
}

/** Today's pair with solar noon, which the Adaptive Lighting strip needs; the sensors give none, so without coordinates it is the pair's midpoint. */
export interface SunDayTimes extends SunPair {
  noon: number | null;
}

/** Where the house is and which local day to name; no coordinates sends the read to the sensors. */
export interface SunDay {
  latitude?: number;
  longitude?: number;
  day: string;
}

/** The sun's next rising and setting as text, from `sun.sun`'s attributes or, failing those, the two sun sensors. */
export interface SunNext {
  nextRising: string | null;
  nextSetting: string | null;
}

/** The sun sensors a read falls back on: the config's own, or the integration's default names. */
export interface SunSensors {
  rising: string | null;
  setting: string | null;
}

/** The entities `sunNext` reads by default: a reader of it listens to these. */
export const SUN_IDS = ['sun.sun', 'sensor.sun_next_rising', 'sensor.sun_next_setting'] as const;

/** The next event of the sun, for a list of what runs next. It is not today's pair: once today's sunrise has passed it is tomorrow's. */
export function sunNext(
  states: HassEntities,
  sensors: SunSensors = {rising: SUN_IDS[1], setting: SUN_IDS[2]},
): SunNext {
  const read = (attribute: string, sensor: string | null): string | null => {
    const v: unknown = states['sun.sun']?.attributes[attribute];
    if (typeof v === 'string' && v) return v;
    return textOf(states, sensor);
  };
  return {nextRising: read('next_rising', sensors.rising), nextSetting: read('next_setting', sensors.setting)};
}

/** Today's sunrise and sunset: computed from the house's coordinates, else the sensors'. */
export function sunToday(
  states: HassEntities,
  config: ResolvedConfig,
  {latitude, longitude, day}: SunDay,
): SunDayTimes {
  if (latitude === undefined || longitude === undefined) {
    const next = sunNext(states, {rising: config.entities.rising, setting: config.entities.setting});
    const at = (text: string | null) => {
      const ms = Date.parse(text ?? '');
      return Number.isNaN(ms) ? null : ms;
    };
    const [rise, set] = [at(next.nextRising), at(next.nextSetting)];
    return {rise, set, noon: rise !== null && set !== null ? (rise + set) / 2 : null};
  }
  const {rise, set, noon} = sunTimes(latitude, longitude, day);
  return {rise, set, noon};
}
