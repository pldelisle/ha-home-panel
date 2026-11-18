// energyIds: the entity ids the Energy pane and its cards read, so the store tells them only when one changes.
// Pattern: the union of what `readEnergy` reads (the grid and the meters, the water heater's three, the Wallbox's two, Hilo's six, Hydro-Québec's
// three, each room's power and thermostat) and Hilo's gateway, subscribed for the Status checks' reader (#254), which `readEnergy` does not read, with no id twice, after the store's per-element subscription (ADR 0012); the house names them in
// its config (convention over configuration), so the list walks the config and never the states: the store ticks on every change and the list must stay cheap.
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the house does).
import type {PanelStore} from '../../core/store.ts';

/** The ids of every sensor and thermostat the Energy section reads; an id the house leaves unset is left out. */
export function energyIds({config}: Pick<PanelStore, 'config'>): string[] {
  const {entities, rooms} = config;
  const ids = [
    entities.grid,
    entities.gridLive,
    entities.energy,
    entities.whP,
    entities.whT,
    entities.whE,
    entities.evP,
    entities.wbStatus,
    entities.rate,
    entities.rateLow,
    entities.rateMed,
    entities.rateReward,
    entities.defi,
    entities.rewards,
    entities.gateway,
    entities.hq,
    entities.hqPeak,
    entities.hqUpcoming,
    ...rooms.flatMap(room => [room.power, room.climate]),
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}
