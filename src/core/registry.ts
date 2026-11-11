// Readers over the registries: where an entity sits and whether the household hid it, so the store, the providers and the
// features share one rule for each.
// Pattern: pure functions over plain data (Bernhardt, functional core), the registry twin of `states.ts`.
// Must not: hold state, read `hass` itself or the clock, or guess an area from a name.
import type {Registries} from './hass.ts';

/** The entity's area, else its device's area, else `''`. */
export const areaOf = (id: string, {entities, devices}: Registries): string => {
  const entry = entities?.[id];
  return entry?.area_id || (entry?.device_id ? devices?.[entry.device_id]?.area_id : undefined) || '';
};

/** The registry says the entity is hidden; an entity the registry does not know is not. */
export const isHidden = (id: string, {entities}: Registries): boolean => !!entities?.[id]?.hidden;
