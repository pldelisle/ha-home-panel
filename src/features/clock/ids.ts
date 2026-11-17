// clockIds: the entity ids the idle clock reads, so the store tells `<hp-clock>` only when one changes.
// Pattern: the providers' id lists over the store's public members, after the store's per-element subscription (ADR 0012).
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the house does).
import type {PanelStore} from '../../core/store.ts';
import {homeTemperatureIds} from '../../providers/home-temperatures.ts';

/** The sun, the condition sensor, and what the two temperatures read (each room, the weather entity, the outdoor sensor). */
export function clockIds({config}: Pick<PanelStore, 'config'>): string[] {
  const {sun, cond} = config.entities;
  return [...homeTemperatureIds(config), sun, cond].filter((id): id is string => !!id);
}
