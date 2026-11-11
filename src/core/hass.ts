// PanelHass: the subset of Home Assistant's frontend `hass` object that the panel reads or calls, typed once.
// Pattern: anti-corruption layer in type form (Evans, Domain-Driven Design); entity, config and user types come from
// home-assistant-js-websocket (types only), the frontend-only parts are declared here from what the panel uses.
// Must not: import at runtime, hold any value, or grow a property the panel does not read.
import type {HassEntity, HassEntities, HassConfig, HassUser, Connection} from 'home-assistant-js-websocket';

export type {HassEntity, HassEntities};

/** One row of the entity registry (hass.entities). */
export interface EntityRegistryEntry {
  entity_id: string;
  area_id?: string | null;
  device_id?: string | null;
  platform?: string;
  name?: string | null;
  /** True when the entity is hidden in the registry; the panel does not offer a hidden entity. */
  hidden?: boolean;
}

/** One row of the device registry (hass.devices). */
export interface DeviceRegistryEntry {
  id: string;
  area_id?: string | null;
  name?: string | null;
  name_by_user?: string | null;
}

/** One row of the area registry (hass.areas). */
export interface AreaRegistryEntry {
  area_id: string;
  name: string;
}

/** The profile's language and formats (hass.locale). */
export interface PanelLocale {
  language: string;
  number_format?: string;
  time_format?: string;
}

export interface PanelHass {
  states: HassEntities;
  entities?: Record<string, EntityRegistryEntry>;
  devices?: Record<string, DeviceRegistryEntry>;
  areas?: Record<string, AreaRegistryEntry>;
  config: Pick<HassConfig, 'time_zone' | 'latitude' | 'longitude'> & {country?: string | null};
  user?: Pick<HassUser, 'name' | 'is_admin'>;
  locale?: PanelLocale;
  language?: string;
  services?: Record<string, Record<string, unknown>>;
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
  callWS<T = unknown>(msg: {type: string} & Record<string, unknown>): Promise<T>;
  connection?: Pick<Connection, 'subscribeMessage'>;
}

/** The three registries a rule reads to find a platform, a device or an area: what `PanelHass` holds besides the states. */
export type Registries = Pick<PanelHass, 'entities' | 'devices' | 'areas'>;
