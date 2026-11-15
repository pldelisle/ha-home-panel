// UniFi Protect's cameras as a camera source: one per device out of its high, medium and low channels, with its motion sensor.
// Pattern: an adapter behind the CameraSource strategy (Gamma et al.), the anti-corruption layer for Protect's entity naming
// (Evans); the rules are those of the legacy panel's `cameras()`, deleted by #227.
// Must not: word anything a person reads, stamp the picture (the model does), read the clock, or look past the registries.
import type {HassEntities, Registries} from '../core/hass.ts';
import type {Names} from '../core/i18n/names.ts';
import {entitiesByDevice, isHidden, nameOwner} from '../core/registry.ts';
import {isAvailable, textAttributeOf} from '../core/states.ts';
import type {CameraInputs} from './camera-source.ts';

/** Protect makes a stream per resolution: the best one is the tile's, so the rank is high, medium, any other, low. */
const channelRank = (id: string): number =>
  /_high|high_resolution/.test(id) ? 0 : /_medium/.test(id) ? 1 : /_low/.test(id) ? 3 : 2;

/** Protect names a device "Porch High Resolution Channel"; the camera is "Porch". */
const withoutChannel = (name: string): string => name.replace(/\s+(High|Medium|Low)( Resolution Channel)?$/i, '');

/** The cameras Protect gives the house, one per device, by name. */
export function protectCameras(states: HassEntities, registries: Registries, names: Names): CameraInputs[] {
  const byDevice = entitiesByDevice(registries);
  const chosen = new Map<string, {id: string; rank: number}>();
  for (const id of Object.keys(states)) {
    if (!id.startsWith('camera.')) continue;
    const entry = registries.entities?.[id];
    if (
      isHidden(id, registries) ||
      (entry?.platform && entry.platform !== 'unifiprotect') ||
      /_radar$/.test(id) ||
      /insecure/.test(id)
    )
      continue;
    if (!entry?.platform && !/unifi|protect/i.test(textAttributeOf(states, id, 'attribution') ?? '')) continue;
    // The channels of one camera share a device, so the device id groups them into one tile; the legacy rule lets a camera
    // the registry gives no device stand alone under its own entity id, which no sibling or device name ever matches.
    const groupKey = entry?.device_id || id;
    const rank = channelRank(id);
    const previous = chosen.get(groupKey);
    if (!previous || rank < previous.rank) chosen.set(groupKey, {id, rank});
  }
  return [...chosen.entries()]
    .map(([groupKey, {id}]) => {
      const deviceId = registries.entities?.[id]?.device_id || null;
      const motionIds = (byDevice.get(groupKey) ?? []).filter(
        e => e.startsWith('binary_sensor.') && /motion/.test(e) && !/detection/.test(e),
      );
      const motionId = motionIds.find(e => /_motion$/.test(e)) ?? motionIds[0] ?? null;
      const sensor = motionId ? states[motionId] : undefined;
      return {
        id,
        deviceId,
        name: withoutChannel(names.name(nameOwner(id, registries))),
        available: isAvailable(states[id]),
        picture: textAttributeOf(states, id, 'entity_picture'),
        motion: isAvailable(sensor) ? {on: sensor.state === 'on', since: Date.parse(sensor.last_changed)} : null,
        motionId,
        state: states[id].state,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
