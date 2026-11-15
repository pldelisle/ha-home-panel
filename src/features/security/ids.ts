// securityIds: the entity ids the Security pane and the Home security card read, so the store tells them only when one changes.
// Pattern: the union of what the rules read (the cameras, their motion sensors, the door and motion sensors, their battery and
// light siblings), with no id twice, after the store's per-element subscription (ADR 0012); it takes the store's public members.
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the house does).
import {registriesOf} from '../../core/registry.ts';
import type {PanelStore} from '../../core/store.ts';
import {readSecurity} from './inputs.ts';

/** The ids of every camera, motion sensor, door or motion sensor, battery and illuminance sibling the house has. */
export function securityIds({hass, names}: Pick<PanelStore, 'hass' | 'names'>): string[] {
  if (!hass) return [];
  const {cameras, sensors} = readSecurity(hass.states, registriesOf(hass), names);
  const ids = [
    ...cameras.flatMap(camera => [camera.id, camera.motionId]),
    ...sensors.flatMap(sensor => [sensor.id, sensor.batteryId, sensor.illuminanceId]),
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}
