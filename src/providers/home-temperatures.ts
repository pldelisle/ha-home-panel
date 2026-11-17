// The house's two temperatures: the rooms' average inside and the outside one, as the header's line, the Home pane's heading and the idle clock say them.
// Pattern: an adapter below the features (ADR 0025): moved from the shell's home-line.ts by #276, because the idle clock (a feature) reads
// the same two numbers and a feature never imports the shell (ADR 0011).
// Must not: word anything (the readers do), read the clock or the DOM, or read an entity `homeTemperatureIds` does not list.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import {numberAttributeOf, numberOf} from '../core/states.ts';
import {powerNow} from './power.ts';

export interface HomeTemperatures {
  /** The rooms' average temperature, null when no room reads one. */
  inside: number | null;
  /** The weather entity's temperature, else the outdoor sensor's; null when neither reads. */
  outside: number | null;
}

/** What `readHomeTemperatures` reads: each room's thermostat and temperature sensor, the weather entity and the outdoor sensor. */
export function homeTemperatureIds(config: ResolvedConfig): string[] {
  const {weather, outT} = config.entities;
  return [...config.rooms.flatMap(room => [room.climate, room.temp]), weather, outT].filter((id): id is string => !!id);
}

export function readHomeTemperatures(states: HassEntities, config: ResolvedConfig): HomeTemperatures {
  const temps = powerNow(states, config)
    .rooms.map(room => room.temperature)
    .filter((t): t is number => t !== null);
  const {weather, outT} = config.entities;
  return {
    inside: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    outside: numberAttributeOf(states, weather, 'temperature') ?? numberOf(states, outT),
  };
}
