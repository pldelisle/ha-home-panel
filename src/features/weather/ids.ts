// weatherIds: the entity ids the Weather pane reads, so the store tells it only when one of them changes; sevenDayIds: those of the detail's statistics.
// Pattern: the union of what each source reads (the strategy list of inputs.ts) and what the sun block reads, with no
// id twice (Set semantics), after the store's per-element subscription (ADR 0012).
// Must not: read a state or the clock, or name an entity id (the config does).
import type {EntityKey, ResolvedConfig} from '../../core/config.ts';
import type {SevenDayIds} from './history.ts';
import {WEATHER_SOURCES} from './inputs.ts';
import {ARCHIVED_KEYS} from '../../providers/climate-archive.ts';
import type {WeatherSource} from '../../providers/weather-source.ts';

/** The sensors whose statistics the detail's seven-day charts and season read: the outdoor sensors, null for one the house lacks. */
export function sevenDayIds({entities}: ResolvedConfig): SevenDayIds {
  return {
    temperature: entities.outT,
    dewPoint: entities.dew,
    humidity: entities.hum,
    pressure: entities.pres,
    wind: entities.wind,
    gusts: entities.gust,
  };
}

/** The ids of the sources, the sun entity, the sensors for its next rising and setting, and for its first light. */
export function weatherIds(config: ResolvedConfig, sources: readonly WeatherSource[] = WEATHER_SOURCES): string[] {
  const {sun, rising, setting, dawn} = config.entities;
  const ids = [...sources.flatMap(source => source.ids(config)), sun, rising, setting, dawn];
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

/** The sensors the climate archive can fill before the recorder's first row, each id with the key the archive knows it by: the keys it has a series for, in this house. */
export function archiveKeys({entities}: ResolvedConfig): Map<string, EntityKey> {
  return new Map(ARCHIVED_KEYS.flatMap(key => (entities[key] ? [[entities[key], key] as [string, EntityKey]] : [])));
}
