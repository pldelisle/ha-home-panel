// climateIds: the entity ids the Climate pane reads, so the store tells it only when one changes.
// Pattern: the union of what `readClimate` reads (each room's thermostat, temperature and power sensors, the heat pump, the weather
// entity and the outside sensor; a room's target sensor is history the detail loads through the statistics API, not a state the
// pane reads) with no id twice, after the store's per-element subscription (ADR 0012); the house names
// them in its config, so the list walks the config and never the states: the store ticks on every change and the list must stay cheap.
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the house does).
import type {PanelStore} from '../../core/store.ts';

/** The ids of every room's thermostat, temperature and power sensors, the heat pump, the weather entity and the outside sensor; an id the house leaves unset is left out. */
export function climateIds({config}: Pick<PanelStore, 'config'>): string[] {
  const {entities, rooms} = config;
  const ids = [
    ...rooms.flatMap(room => [room.climate, room.temp, room.power]),
    entities.hp,
    entities.weather,
    entities.outT,
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}
