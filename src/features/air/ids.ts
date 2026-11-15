// airIds: the entity ids the Air pane and the Home air card read, so the store tells them only when one changes.
// Pattern: the union of what the rules read (each purifier's fan and sensors, the station's sensors, the AQHI), with no id
// twice, after the store's per-element subscription (ADR 0012); it takes the store's public members.
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the house does).
import {registriesOf} from '../../core/registry.ts';
import type {PanelStore} from '../../core/store.ts';
import {readAir} from './inputs.ts';

/** The ids of every purifier's fan and sensors, the station's three sensors and four pollen reports, and the AQHI sensor. */
export function airIds({hass, names, config}: Pick<PanelStore, 'hass' | 'names' | 'config'>): string[] {
  if (!hass) return [];
  const {rooms, outside} = readAir(hass.states, registriesOf(hass), names, config);
  const ids = [
    ...rooms.flatMap(room => [room.fanId, ...Object.values(room.sensors)]),
    outside?.aqi,
    outside?.pm,
    outside?.distance,
    ...(outside?.pollen.map(p => p.id) ?? []),
    config.entities.aqhi,
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}
