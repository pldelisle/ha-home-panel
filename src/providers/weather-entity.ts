// The generic Home Assistant weather entity as a weather source: its reading, its condition and its credit line.
// Pattern: an adapter behind the WeatherSource strategy (Gamma et al.), first in the list so Environment Canada's sensors
// override it field by field; it converts the entity's pressure and wind into the panel's kPa and km/h (anti-corruption layer, Evans).
// Must not: read a sensor, the clock or the DOM, or guess a unit it does not know.
import {attributeOf, numberAttributeOf, textOf} from '../core/states.ts';
import type {WeatherInputs, WeatherSource} from './weather-source.ts';

// the entity's `pressure_unit` and `wind_speed_unit` name the user's unit system; a missing one is the panel's own
const KPA_PER = {kPa: 1, hPa: 0.1, mbar: 0.1, Pa: 0.001, inHg: 3.38639, mmHg: 0.133322, psi: 6.89476};
const KMH_PER = {'km/h': 1, 'm/s': 3.6, mph: 1.609344, kn: 1.852, 'ft/s': 1.09728};

/** `value` in the panel's unit, or null when there is no value or the entity's unit is not one of `table`. */
function inPanelUnit(value: number | null, unit: unknown, table: Record<string, number>, own: string): number | null {
  const factor = table[typeof unit === 'string' ? unit : own];
  return value === null || factor === undefined ? null : value * factor;
}

export const weatherEntitySource: WeatherSource = {
  name: 'weather-entity',

  ids: config => (config.entities.weather ? [config.entities.weather] : []),

  present: (states, config) => !!config.entities.weather && states[config.entities.weather] !== undefined,

  read(states, config) {
    const id = config.entities.weather;
    const number = (name: string) => numberAttributeOf(states, id, name);
    const text = (name: string) => {
      const value = attributeOf(states, id, name);
      return typeof value === 'string' ? value : null;
    };
    const speed = inPanelUnit(number('wind_speed'), attributeOf(states, id, 'wind_speed_unit'), KMH_PER, 'km/h');
    const kpa = inPanelUnit(number('pressure'), attributeOf(states, id, 'pressure_unit'), KPA_PER, 'kPa');
    // Home Assistant gives the bearing as degrees or as a compass point
    const wind = {speed, gust: null, direction: text('wind_bearing'), bearing: number('wind_bearing')};

    // a field the entity does not know is left out, so the next source or the empty inputs answer for it
    const read: Partial<WeatherInputs> = {};
    const condition = textOf(states, id);
    if (condition !== null) read.condition = condition;
    const temperature = number('temperature');
    if (temperature !== null) read.temperature = temperature;
    const humidity = number('humidity');
    if (humidity !== null) read.humidity = humidity;
    if (kpa !== null) read.pressure = {kpa, tendency: null};
    if (speed !== null || wind.direction !== null || wind.bearing !== null) read.wind = wind;
    const attribution = text('attribution');
    if (attribution !== null) read.attribution = attribution;
    return read;
  },
};
