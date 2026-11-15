// Readers over the registries: the three picked from a `hass`, where an entity sits, whether the household hid it, whose name it goes by and which entities
// share its device, so the store, the providers and the features share one rule for each.
// Pattern: pure functions over plain data (Bernhardt, functional core), the registry twin of `states.ts`.
// Must not: hold state, read `hass` itself or the clock, guess an area from a name, or ask the name resolver (it returns ids).
import type {PanelHass, Registries} from './hass.ts';

/** The three registries of a `hass`, picked once: what every reader over them takes, so no feature writes the three names out. */
export const registriesOf = ({entities, devices, areas}: Pick<PanelHass, keyof Registries>): Registries => ({
  entities,
  devices,
  areas,
});

/** The entity's area, else its device's area, else `''`. */
export const areaOf = (id: string, {entities, devices}: Registries): string => {
  const entry = entities?.[id];
  return entry?.area_id || (entry?.device_id ? devices?.[entry.device_id]?.area_id : undefined) || '';
};

/** The registry says the entity is hidden; an entity the registry does not know is not. */
export const isHidden = (id: string, {entities}: Registries): boolean => !!entities?.[id]?.hidden;

/**
 * The id the name resolver is asked for the entity: its device's when the household or the integration named the device,
 * else its own. A device the registry does not know, or one with no name, leaves the entity to its own name.
 */
export const nameOwner = (id: string, {entities, devices}: Registries): string => {
  const deviceId = entities?.[id]?.device_id;
  const device = deviceId ? devices?.[deviceId] : undefined;
  return deviceId && (device?.name_by_user || device?.name) ? deviceId : id;
};

/**
 * The entity ids of each device, in the registry's order, built once so a reader finds an entity's siblings without a scan
 * per entity; a device with no entities is absent, so read it with `?? []`.
 */
export function entitiesByDevice({entities}: Registries): Map<string, string[]> {
  const byDevice = new Map<string, string[]>();
  for (const entry of Object.values(entities ?? {})) {
    if (!entry.device_id) continue;
    const siblings = byDevice.get(entry.device_id);
    if (siblings) siblings.push(entry.entity_id);
    else byDevice.set(entry.device_id, [entry.entity_id]);
  }
  return byDevice;
}
