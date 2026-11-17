// The house's door and motion sensors: every binary sensor of a door or motion class, read into inputs, not a view.
// Pattern: an adapter below the features (ADR 0025): the Security pane, the live pill, the stack and the Home pane read the
// one rule, so "which sensors count" has one answer; its rules are those of the legacy `sensors()`, `sensorName`, `DOOR_DC` and
// `MOTION_DC`, deleted by #227; the Security feature's readers, its More word among them, call it.
// Must not: word anything a person reads ("Open", "for 12 min"), read the clock, or know a screen.
import type {HassEntities, Registries} from '../core/hass.ts';
import type {Names} from '../core/i18n/names.ts';
import {areaOf, entitiesByDevice, isHidden, nameOwner} from '../core/registry.ts';
import {isAvailable, numberOf} from '../core/states.ts';

export type SensorKind = 'door' | 'motion';

export interface SensorInputs {
  /** `binary_sensor.*`. */
  id: string;
  kind: SensorKind;
  /** The sensor's `device_class`, one of `DOOR_CLASSES` or `MOTION_CLASSES`. */
  deviceClass: string;
  /** The entity's area, else its device's; null when it has neither. */
  areaId: string | null;
  /** The area's name through the resolver; `''` without an area. */
  area: string;
  /** The device's name through the resolver, else the entity's, without a leading "Détecteur de mouvement ". */
  name: string;
  on: boolean;
  /** False when the sensor is `unavailable` or `unknown`. */
  available: boolean;
  /** `last_changed`, in milliseconds. */
  since: number;
  /** The device's `sensor.*_battery`, as a percentage; null when it has none or reports no number. */
  battery: number | null;
  /** That sensor's id, so the store tells a reader when it changes. */
  batteryId: string | null;
  /** The device's `sensor.*_illuminance`, in lux; null when it has none or reports no number. */
  illuminance: number | null;
  illuminanceId: string | null;
}

export const DOOR_CLASSES = ['door', 'window', 'opening', 'garage_door'] as const;
export const MOTION_CLASSES = ['motion', 'occupancy', 'presence'] as const;

/** What a `device_class` makes of a binary sensor: a door, motion, or neither (null). */
export function sensorKind(deviceClass: unknown): SensorKind | null {
  if ((DOOR_CLASSES as readonly unknown[]).includes(deviceClass)) return 'door';
  if ((MOTION_CLASSES as readonly unknown[]).includes(deviceClass)) return 'motion';
  return null;
}

/** A French house names its motion sensors "Détecteur de mouvement Hall": the kind says so, the name need not. */
const withoutPrefix = (name: string): string => name.replace(/^d[ée]tecteur\s+(de\s+)?mouvement\s+/i, '');

/**
 * Every visible, primary binary sensor with a door or motion class that is not Protect's (its motion shows on the camera
 * tile), doors first, then by name.
 */
export function doorMotionSensors(states: HassEntities, registries: Registries, names: Names): SensorInputs[] {
  const byDevice = entitiesByDevice(registries);
  const out: SensorInputs[] = [];
  for (const id of Object.keys(states)) {
    if (!id.startsWith('binary_sensor.')) continue;
    const entry = registries.entities?.[id];
    const deviceClass = states[id].attributes.device_class;
    const kind = sensorKind(deviceClass);
    if (!kind || entry?.platform === 'unifiprotect' || isHidden(id, registries) || entry?.entity_category) continue;
    const siblings = byDevice.get(entry?.device_id ?? '') ?? [];
    const sibling = (pattern: RegExp): string | null => siblings.find(sibling => pattern.test(sibling)) ?? null;
    const batteryId = sibling(/^sensor\..*_battery$/);
    const illuminanceId = sibling(/^sensor\..*_illuminance$/);
    const areaId = areaOf(id, registries);
    out.push({
      id,
      kind,
      deviceClass: deviceClass as string,
      areaId: areaId || null,
      area: areaId ? names.name(areaId) : '',
      name: withoutPrefix(names.name(nameOwner(id, registries))),
      on: states[id].state === 'on',
      available: isAvailable(states[id]),
      since: Date.parse(states[id].last_changed),
      battery: numberOf(states, batteryId),
      batteryId,
      illuminance: numberOf(states, illuminanceId),
      illuminanceId,
    });
  }
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'door' ? -1 : 1) || a.name.localeCompare(b.name));
}
