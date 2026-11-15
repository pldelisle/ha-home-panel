// Mila's purifiers and outdoor station: the rooms and the station found in the registries, read into inputs, not a view.
// Pattern: registry-driven discovery (devices of a platform, entities of a device, roles by suffix), the shape Hilo, FordPass
// and Wallbox follow; its rules are those of the legacy `purifiers()`, `AIR_KEYS` and `POLLEN`, deleted by #234.
// Must not: word anything a person reads, rate the air (that is `air-quality.ts`), read the clock, or look past the registries.
import type {HassEntities, Registries} from '../core/hass.ts';
import type {Names} from '../core/i18n/names.ts';
import {areaOf, nameOwner} from '../core/registry.ts';
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
export const POLLEN_KINDS = ['trees', 'grass', 'weeds', 'mold'] as const;
export type PollenKind = (typeof POLLEN_KINDS)[number];

export interface AirRoomInputs {
  /** The Mila device; one per room. */
  deviceId: string;
  /** The room's `fan.*`. */
  fanId: string;
  /** The fan's area, else its device's; null when it has neither. */
  areaId: string | null;
  /** The area's name through the resolver, else the device's, else the fan's. */
  name: string;
  /** The device's sensors, by the suffix that found them; a suffix the device lacks is absent. */
  sensors: Partial<Record<AirSuffix, string>>;
  /** Each sensor's number; null when it is absent, unavailable or not a number. */
  readings: {
    pm1: number | null;
    pm2_5: number | null;
    pm10: number | null;
    co: number | null;
    co2: number | null;
    voc: number | null;
    humidity: number | null;
    temperature: number | null;
    /** Mila's own index, on the US AQI scale. */
    airQuality: number | null;
    airChanges: number | null;
  };
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

/** The entity ids of each Mila device, in the registry's order, built once per call. */
function milaDevices({entities}: Registries): Map<string, string[]> {
  const byDevice = new Map<string, string[]>();
  for (const entry of Object.values(entities ?? {})) {
    if (entry.platform !== 'mila' || !entry.device_id) continue;
    const siblings = byDevice.get(entry.device_id);
    if (siblings) siblings.push(entry.entity_id);
    else byDevice.set(entry.device_id, [entry.entity_id]);
  }
  return byDevice;
}

/** One room per Mila device with a fan, by name; a device without a fan is the station, not a room. */
export function milaRooms(states: HassEntities, registries: Registries, names: Names): AirRoomInputs[] {
  const rooms: AirRoomInputs[] = [];
  for (const [deviceId, ids] of milaDevices(registries)) {
    const fanId = ids.find(id => id.startsWith('fan.'));
    if (!fanId) continue;
    const sensors: AirRoomInputs['sensors'] = {};
    for (const [suffix, pattern] of SUFFIX_PATTERNS) {
      const id = ids.find(candidate => pattern.test(candidate));
      if (id) sensors[suffix] = id;
    }
    const read = (suffix: AirSuffix): number | null => numberOf(states, sensors[suffix]);
    const areaId = areaOf(fanId, registries);
    rooms.push({
      deviceId,
      fanId,
      areaId: areaId || null,
      name: names.name(areaId || nameOwner(fanId, registries)),
      sensors,
      readings: {
        pm1: read('pm1'),
        pm2_5: read('pm2_5'),
        pm10: read('pm10'),
        co: read('co'),
        co2: read('co2'),
        voc: read('voc'),
        humidity: read('humidity'),
        temperature: read('temperature'),
        airQuality: read('air_quality'),
        airChanges: read('air_changes'),
      },
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

/** The account-level device with no fan that carries the outdoor air index (`…_aqi`); null when the house has none. */
export function milaOutside(states: HassEntities, registries: Registries): OutsideAirInputs | null {
  let station: string[] | null = null;
  for (const ids of milaDevices(registries).values())
    if (!ids.some(id => id.startsWith('fan.')) && ids.some(id => id.endsWith('_aqi'))) station = ids;
  if (!station) return null;
  const ids = station;
  const find = (suffix: string): string | null => ids.find(id => id.endsWith(suffix)) ?? null;
  const aqi = find('_aqi');
  const pm = find('_station_pm2_5');
  const distance = find('_station_distance');
  const pollen = POLLEN_KINDS.map(kind => ({kind, id: find(`_pollen_status_${kind}`)}));
  return {
    aqi,
    pm,
    distance,
    pollen,
    readings: {
      aqi: numberOf(states, aqi),
      pm: numberOf(states, pm),
      distance: numberOf(states, distance),
      pollen: Object.fromEntries(pollen.map(({kind, id}) => [kind, textOf(states, id)])) as Record<
        PollenKind,
        string | null
      >,
    },
  };
}
