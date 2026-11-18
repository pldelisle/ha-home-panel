// readWeather: the house's weather inputs, from the sun and from every weather source that is present, in list order.
// Pattern: a composition of strategies (Gamma et al.): start from the empty inputs, fold each present source's fields over
// them, a later source winning field by field unless it gives way on that field (`fallback`); the list is the order of resolution, and the README of this folder says it.
// Must not: know an integration (that is a source), read the clock, or touch the DOM or `hass`.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities} from '../../core/hass.ts';
import {textOf} from '../../core/states.ts';
import {environmentCanadaSource} from '../../providers/environment-canada.ts';
import {weatherEntitySource} from '../../providers/weather-entity.ts';
import {EMPTY_INPUTS, type WeatherInputs, type WeatherSource} from '../../providers/weather-source.ts';

/** The sources in the order they are applied: the generic entity first, then Environment Canada's sensors over it. */
export const WEATHER_SOURCES: readonly WeatherSource[] = [weatherEntitySource, environmentCanadaSource];

/** The sun's part of the inputs, from the sun entity and the sensors that say when it next rises and sets. */
function readSun(states: HassEntities, config: ResolvedConfig): Pick<WeatherInputs, 'isDay' | 'sun'> {
  const {sun, rising, setting, dawn} = config.entities;
  const state = sun ? states[sun]?.state : undefined;
  const up = state === 'above_horizon';
  const nextAt = Date.parse(textOf(states, up ? setting : rising) ?? '');
  return {
    // the legacy panel's rule: a house with no sun entity is taken to be in daylight
    isDay: state === undefined || up,
    sun: {
      up,
      next: Number.isNaN(nextAt) ? null : {kind: up ? 'set' : 'rise', at: nextAt},
      hasFirstLight: textOf(states, dawn) !== null,
    },
  };
}

/**
 * The inputs of the house at these states. A source that is present applies its fields over what came before; a field it
 * does not know stays as it was, and a field it does know replaces the earlier source's whole value (a shallow merge).
 */
export function readWeather(
  states: HassEntities,
  config: ResolvedConfig,
  sources: readonly WeatherSource[] = WEATHER_SOURCES,
): WeatherInputs {
  const inputs: WeatherInputs = {...EMPTY_INPUTS, ...readSun(states, config)};
  for (const source of sources) {
    if (!source.present(states, config)) continue;
    // a field the source gives way on is left out once an earlier source filled it
    const known = Object.entries(source.read(states, config)).filter(
      ([field, value]) =>
        value !== undefined &&
        !(
          source.fallback?.includes(field as keyof WeatherInputs) &&
          inputs[field as keyof WeatherInputs] !== EMPTY_INPUTS[field as keyof WeatherInputs]
        ),
    );
    Object.assign(inputs, Object.fromEntries(known));
  }
  return inputs;
}
