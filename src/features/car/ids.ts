// carIds: the entity ids the Car pane reads, so the store tells it only when one changes.
// Pattern: the union of what `readCarFeature` reads (every FordPass entity the provider reads, and the Wallbox's six: its power, status, current limit, charging switch, lock and price) with no id twice,
// after the store's per-element subscription (ADR 0012); the car's ids come from its prefix and the Wallbox's from the config, so the list never walks the states: the store ticks on every change and the list must stay cheap.
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the provider and the house do).
import type {PanelStore} from '../../core/store.ts';
import {carEntityIds, type CarRef} from '../../providers/fordpass.ts';

/** The ids the Car reads: the car's, when one is found, and the Wallbox's the house names. */
export function carIds({config}: Pick<PanelStore, 'config'>, ref: CarRef | null): string[] {
  const {entities} = config;
  const ids = [
    ...(ref ? carEntityIds(ref) : []),
    entities.evP,
    entities.wbStatus,
    entities.wbAmps,
    entities.wbPause,
    entities.wbLock,
    entities.wbPrice,
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}
