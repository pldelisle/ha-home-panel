// airIds: the entity ids the Air pane and the Home air card read, so the store tells them only when one changes.
// Pattern: the union of what the rules read (each purifier's fan and sensors, the station's sensors, the AQHI), with no id
// twice, after the store's per-element subscription (ADR 0012); it takes the store's public members and walks the
// registries only (`milaIds`), never the states: the store ticks on every state change and the list must stay cheap.
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the house does).
import {registriesOf} from '../../core/registry.ts';
import type {PanelStore} from '../../core/store.ts';
import {milaIds} from '../../providers/mila.ts';

/** The ids of every purifier's fan and sensors, the station's three sensors and four pollen reports, and the AQHI sensor. */
export function airIds({hass, config}: Pick<PanelStore, 'hass' | 'config'>): string[] {
  if (!hass) return [];
  const ids = [...milaIds(registriesOf(hass)), config.entities.aqhi];
  return [...new Set(ids.filter((id): id is string => !!id))];
}
