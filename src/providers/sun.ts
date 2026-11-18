// sunToday: the sunrise and sunset of today at the house, the one pair Home, Lights and Weather all say; sunNext, the sensors' next two events.
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

/** Where the house is and which local day to name; no coordinates sends the read to the sensors. */
export interface SunDay {
  latitude?: number;
  longitude?: number;
  day: string;
}

/** The next sunset and sunrise as the two sun sensors say them, in milliseconds, null for a sensor that reads nothing. */
export function sunNext(states: HassEntities, config: ResolvedConfig): SunPair {
  const at = (id: string | null) => {
    const ms = Date.parse(textOf(states, id) ?? '');
    return Number.isNaN(ms) ? null : ms;
  };
  return {set: at(config.entities.setting), rise: at(config.entities.rising)};
}

/** Today's sunrise and sunset: computed from the house's coordinates, else the sensors'. */
export function sunToday(states: HassEntities, config: ResolvedConfig, {latitude, longitude, day}: SunDay): SunPair {
  if (latitude === undefined || longitude === undefined) return sunNext(states, config);
  const {rise, set} = sunTimes(latitude, longitude, day);
  return {rise, set};
}
