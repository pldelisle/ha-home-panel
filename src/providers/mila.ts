// Mila's purifiers and outdoor station: the rooms and the station found in the registries, read into inputs, not a view.
// Pattern: registry-driven discovery (devices of a platform, entities of a device, roles by suffix), the shape Hilo, FordPass
// and Wallbox follow; its rules are those of the legacy `purifiers()`, `AIR_KEYS` and `POLLEN`, deleted by #234.
// Must not: word anything a person reads, rate the air (that is `air-quality.ts`), read the clock, or look past the registries.
import type {HassEntities, Registries} from '../core/hass.ts';
import type {Names} from '../core/i18n/names.ts';
import {entitiesByDevice, nameOwner} from '../core/registry.ts';
import {isAvailable, numberAttributeOf, numberOf, textAttributeOf, textOf} from '../core/states.ts';

/** The sensors a Mila purifier makes, found by the end of their entity id (the legacy `AIR_KEYS`, deleted by #234). */
export const AIR_SUFFIXES = [
  'pm1',
  'pm2_5',
  'pm10',
  'co',
  'co2',
  'voc',
  'humidity',
  'temperature',
  'air_quality',
  'fan_speed',
  'air_changes',
  'mode',
  'time_to_clean',
] as const;
export type AirSuffix = (typeof AIR_SUFFIXES)[number];

/** The pollen the station reports, in the order the panel lists them (the legacy `POLLEN`, deleted by #234). */
const POLLEN_KINDS = ['trees', 'grass', 'weeds', 'mold'] as const;
export type PollenKind = (typeof POLLEN_KINDS)[number];

/** The sensors read as numbers, by the key the readings carry them under; `airQuality` is Mila's own index, on the US AQI scale. */
const READING_SUFFIXES = {
  pm1: 'pm1',
  pm2_5: 'pm2_5',
  pm10: 'pm10',
  co: 'co',
  co2: 'co2',
  voc: 'voc',
  humidity: 'humidity',
  temperature: 'temperature',
  airQuality: 'air_quality',
  airChanges: 'air_changes',
} as const satisfies Record<string, AirSuffix>;

export interface AirRoomInputs {
  /** The Mila device; one per room. */
  deviceId: string;
  /** The room's `fan.*`. */
  fanId: string;
  /** The device's area; null when it has none. */
  areaId: string | null;
  /** The area's name through the resolver, else the device's, else the fan's; an area the registry does not name counts as none. */
  name: string;
  /** The device's sensors, by the suffix that found them; a suffix the device lacks is absent. */
  sensors: Partial<Record<AirSuffix, string>>;
  /** Each sensor of `READING_SUFFIXES` as a number; null when it is absent, unavailable or not a number. */
  readings: {[K in keyof typeof READING_SUFFIXES]: number | null};
  fan: {
    on: boolean;
    /** False when the fan is missing, `unavailable` or `unknown`. */
    available: boolean;
    /** The `percentage` attribute; 0 when it has none. */
    percentage: number;
    /** `Automagic`, `Manual` or another mode Mila adds; null when the fan reports none. */
    preset: string | null;
  };
}

export interface OutsideAirInputs {
  /** The station's entity ids, for the chart and the store; null when the device lacks one. */
  aqi: string | null;
  pm: string | null;
  distance: string | null;
  pollen: {kind: PollenKind; id: string | null}[];
  readings: {
    aqi: number | null;
    pm: number | null;
    distance: number | null;
    /** The pollen status text (`low`, `none`, …) by kind; null when unreported. */
    pollen: Record<PollenKind, string | null>;
  };
}

const SUFFIX_PATTERNS = AIR_SUFFIXES.map(suffix => [suffix, new RegExp(`^sensor\\..*_${suffix}$`)] as const);

/** The Mila entity ids of each device that has any, in the registry's order: `entitiesByDevice`, built once, kept to the platform. */
function milaDevices(registries: Registries): Map<string, string[]> {
  const devices = new Map<string, string[]>();
  for (const [deviceId, ids] of entitiesByDevice(registries)) {
    const own = ids.filter(id => registries.entities?.[id]?.platform === 'mila');
    if (own.length) devices.set(deviceId, own);
  }
  return devices;
}

type Devices = ReturnType<typeof milaDevices>;
type RoomEntities = Pick<AirRoomInputs, 'fanId' | 'sensors'>;
type StationEntities = Pick<OutsideAirInputs, 'aqi' | 'pm' | 'distance' | 'pollen'>;

/** A room's entities among a device's: its fan and the sensors found by suffix; null when the device has no fan. */
function roomEntities(ids: string[]): RoomEntities | null {
  const fanId = ids.find(id => id.startsWith('fan.'));
  if (!fanId) return null;
  const sensors: AirRoomInputs['sensors'] = {};
  for (const [suffix, pattern] of SUFFIX_PATTERNS) {
    const id = ids.find(candidate => pattern.test(candidate));
    if (id) sensors[suffix] = id;
  }
  return {fanId, sensors};
}

/** The station's entities among a device's; null unless the device has no fan and carries the outdoor air index (`…_aqi`). */
function stationEntities(ids: string[]): StationEntities | null {
  if (ids.some(id => id.startsWith('fan.')) || !ids.some(id => id.endsWith('_aqi'))) return null;
  const find = (suffix: string): string | null => ids.find(id => id.endsWith(suffix)) ?? null;
  return {
    aqi: find('_aqi'),
    pm: find('_station_pm2_5'),
    distance: find('_station_distance'),
    pollen: POLLEN_KINDS.map(kind => ({kind, id: find(`_pollen_status_${kind}`)})),
  };
}

/** The station among the devices given, the last one found when several qualify, as the legacy panel chose. */
function stationOf(devices: Devices): StationEntities | null {
  let station: StationEntities | null = null;
  for (const ids of devices.values()) station = stationEntities(ids) ?? station;
  return station;
}

/** The ids a station's reader and the store watch: the three sensors and the pollen reports it has. */
const stationIds = ({aqi, pm, distance, pollen}: StationEntities): string[] =>
  [aqi, pm, distance, ...pollen.map(p => p.id)].filter((id): id is string => id !== null);

/** The rooms of the devices given: one per device with a fan, by name. */
function roomsOf(devices: Devices, states: HassEntities, registries: Registries, names: Names): AirRoomInputs[] {
  const rooms: AirRoomInputs[] = [];
  for (const [deviceId, ids] of devices) {
    const room = roomEntities(ids);
    if (!room) continue;
    const {fanId, sensors} = room;
    // the device's area, as the legacy panel read it; an area the registry does not name leaves the room to its device
    const areaId = registries.devices?.[deviceId]?.area_id || '';
    const areaNamed = !!registries.areas?.[areaId]?.name;
    rooms.push({
      deviceId,
      fanId,
      areaId: areaId || null,
      name: names.name(areaNamed ? areaId : nameOwner(fanId, registries)),
      sensors,
      readings: Object.fromEntries(
        Object.entries(READING_SUFFIXES).map(([key, suffix]) => [key, numberOf(states, sensors[suffix])]),
      ) as AirRoomInputs['readings'],
      fan: {
        on: states[fanId]?.state === 'on',
        available: isAvailable(states[fanId]),
        percentage: numberAttributeOf(states, fanId, 'percentage') ?? 0,
        preset: textAttributeOf(states, fanId, 'preset_mode'),
      },
    });
  }
  return rooms.sort((a, b) => a.name.localeCompare(b.name));
}

/** The station among the devices given, read: its three numbers and the pollen texts. */
function outsideOf(devices: Devices, states: HassEntities): OutsideAirInputs | null {
  const station = stationOf(devices);
  if (!station) return null;
  return {
    ...station,
    readings: {
      aqi: numberOf(states, station.aqi),
      pm: numberOf(states, station.pm),
      distance: numberOf(states, station.distance),
      pollen: Object.fromEntries(station.pollen.map(({kind, id}) => [kind, textOf(states, id)])) as Record<
        PollenKind,
        string | null
      >,
    },
  };
}

/** One room per Mila device with a fan, by name; a device without a fan is the station, not a room. */
export const milaRooms = (states: HassEntities, registries: Registries, names: Names): AirRoomInputs[] =>
  roomsOf(milaDevices(registries), states, registries, names);

/** The account-level device with no fan that carries the outdoor air index (`…_aqi`); null when the house has none. */
export const milaOutside = (states: HassEntities, registries: Registries): OutsideAirInputs | null =>
  outsideOf(milaDevices(registries), states);

/** The rooms and the station from one pass over the registries, for a reader that wants both. */
export function milaAir(
  states: HassEntities,
  registries: Registries,
  names: Names,
): {rooms: AirRoomInputs[]; outside: OutsideAirInputs | null} {
  const devices = milaDevices(registries);
  return {rooms: roomsOf(devices, states, registries, names), outside: outsideOf(devices, states)};
}

/**
 * The entity ids `milaAir` would read, without reading them: each room's fan and sensors in the registry's order, then the
 * station's; for a store's subscription, which needs no state, no name and no sort.
 */
export function milaIds(registries: Registries): string[] {
  const devices = milaDevices(registries);
  const ids: string[] = [];
  for (const entities of devices.values()) {
    const room = roomEntities(entities);
    if (room) ids.push(room.fanId, ...Object.values(room.sensors));
  }
  const station = stationOf(devices);
  if (station) ids.push(...stationIds(station));
  return ids;
}
