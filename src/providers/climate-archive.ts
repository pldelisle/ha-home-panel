// The ECCC climate archive: the observed past of Environment and Climate Change Canada's climate stations, in the recorder's shape.
// Pattern: an adapter behind the StatisticsArchive port (Cockburn) and an anti-corruption layer (Evans): the GeoJSON of api.weather.gc.ca
// is read into `StatisticRow`s here, under the Weather tab's keys, over an injected `fetch`; a day starts at local midnight in the house's zone.
// Must not: read the clock but through the `now` it is given, touch the DOM, know a feature, write anything, or keep a failure (the decorator
// takes it as "no rows", and the archive is asked again once the cache entry of that read expires).
import {isRecord, type ResolvedConfig} from '../core/config.ts';
import type {ArchiveFill, StatisticsArchive} from '../core/archive-statistics.ts';
import type {EntityKey} from '../core/entities.ts';
import {DAY_MS, HOUR_MS} from '../core/figures.ts';
import type {StatisticRow, StatisticsPeriod} from '../core/ha.ts';
import type {PanelHass} from '../core/hass.ts';
import {createFormatters, startOfDay} from '../core/i18n/format.ts';
import {englishLocale} from '../core/i18n/locale.ts';

/** `fetch` as far as the archive needs it: a url in, the decoded JSON out, a rejection for any failure. */
export type Fetcher = (url: string) => Promise<unknown>;

/** What the archive needs to know of the house, read at each call: the config may change under the pane. */
export interface ArchiveHouse {
  latitude: number | null;
  longitude: number | null;
  /** `hass.config.time_zone`: the zone whose midnight starts a day. */
  timeZone: string;
  /** The config's `climate_station` (an ECCC climate identifier), `false` to turn the archive off, null to look for the nearest. */
  station: string | false | null;
}

export interface ClimateArchiveOptions {
  fetch: Fetcher;
  now: () => number;
  house: () => ArchiveHouse | null;
}

/** The house as the archive reads it, from the resolved config and the hass the store holds: null before Home Assistant is connected. */
export const archiveHouse = ({climateStation}: ResolvedConfig, hass: PanelHass | null): ArchiveHouse | null =>
  hass && {
    latitude: hass.config.latitude ?? null,
    longitude: hass.config.longitude ?? null,
    timeZone: hass.config.time_zone,
    station: climateStation,
  };

const API = 'https://api.weather.gc.ca/collections';
/** How far from the house a station may be, and how recent its last hourly row: an old station says nothing of this house's weather now. */
const RADIUS_KM = 40;
const MAX_AGE_MS = 30 * DAY_MS;
const KM_PER_DEGREE = 111.32;
const EARTH_KM = 6371;
/** A year of hours is one page of 10000 rows; the cap is for a station that never stops saying "more". */
const MAX_PAGES = 20;
const TIMEOUT_MS = 20_000;

/** The Weather tab's keys the archive has something for. */
export const ARCHIVED_KEYS = [
  'outT',
  'dew',
  'hum',
  'pres',
  'wind',
  'gust',
  'chill',
  'humidex',
] as const satisfies readonly EntityKey[];

// key → the hourly field (`climate-hourly`); a key not here has no hourly series (the gust is a daily maximum only)
const HOURLY: Partial<Record<EntityKey, string>> = {
  outT: 'TEMP',
  dew: 'DEW_POINT_TEMP',
  hum: 'RELATIVE_HUMIDITY',
  pres: 'STATION_PRESSURE',
  wind: 'WIND_SPEED',
  chill: 'WINDCHILL',
  humidex: 'HUMIDEX',
};
// key → the daily fields (`climate-daily`) that make the day row's statistics; a key not here folds its hourly rows
const DAILY: Partial<Record<EntityKey, Partial<Record<'mean' | 'min' | 'max', string>>>> = {
  outT: {mean: 'MEAN_TEMPERATURE', min: 'MIN_TEMPERATURE', max: 'MAX_TEMPERATURE'},
  gust: {max: 'SPEED_MAX_GUST'},
};

interface Station {
  id: string;
  name: string;
  /** Metres. */
  elevation: number;
}

/** The default `Fetcher`: `fetch` with a time limit, a status that is not 2xx as a failure. */
export const jsonFetcher =
  (fetchImpl: typeof fetch = fetch): Fetcher =>
  async url => {
    const response = await fetchImpl(url, {signal: AbortSignal.timeout(TIMEOUT_MS)});
    if (!response.ok) throw new Error(`ECCC climate archive: HTTP ${response.status}`);
    return (await response.json()) as unknown;
  };

const numberAt = (properties: Record<string, unknown>, field: string): number | null => {
  const value = properties[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/** The pressure at the station brought to sea level: the barometric formula with the row's temperature, else the scale height. */
const seaLevel = (pressure: number, celsius: number | null, metres: number): number =>
  celsius === null
    ? pressure * Math.exp(metres / 8434)
    : pressure * (1 - (0.0065 * metres) / (celsius + 0.0065 * metres + 273.15)) ** -5.257;

const kilometres = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
};

/** What one read asks of the archive: one series of one station over `[from, to)`, in the house's zone. */
interface Query {
  station: Station;
  key: EntityKey;
  from: number;
  to: number;
  timeZone: string;
}

type Statistic = 'mean' | 'min' | 'max';

// the days of a zone by the core's formatters, which are costly to build: one per zone
const zones = new Map<string, ReturnType<typeof zoneOf>>();
function zoneOf(timeZone: string) {
  const fmt = createFormatters(englishLocale(timeZone));
  return {
    dayOf: (ms: number): string => fmt.isoDay(ms),
    /** The instant the local day `day` (`YYYY-MM-DD`) begins. */
    startOf: (day: string): number => startOfDay(day, fmt),
    next: (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10),
  };
}
const zoneFor = (timeZone: string) => {
  const known = zones.get(timeZone) ?? zoneOf(timeZone);
  zones.set(timeZone, known);
  return known;
};

export function createClimateArchive({fetch: get, now, house}: ClimateArchiveOptions): StatisticsArchive {
  /** Every feature of a query, following the `next` link until the rows matched are in or there is none. */
  async function features(url: string): Promise<Record<string, unknown>[]> {
    const found: Record<string, unknown>[] = [];
    for (let next: string | undefined = url, page = 0; next && page < MAX_PAGES; page++) {
      const reply = await get(next);
      if (!isRecord(reply) || !Array.isArray(reply.features)) throw new Error('ECCC climate archive: unexpected reply');
      found.push(...(reply.features as Record<string, unknown>[]));
      const links = Array.isArray(reply.links) ? (reply.links as Record<string, unknown>[]) : [];
      // the running total ends the read, whatever a last page's links say
      const done = typeof reply.numberMatched === 'number' && found.length >= reply.numberMatched;
      next = done ? undefined : (links.find(link => link.rel === 'next')?.href as string | undefined);
    }
    return found;
  }
  const query = (collection: string, params: Record<string, string>) =>
    features(`${API}/${collection}/items?f=json&${new URLSearchParams(params)}`);
  const propertiesOf = (feature: Record<string, unknown>): Record<string, unknown> =>
    isRecord(feature.properties) ? feature.properties : {};

  const stationOf = (feature: Record<string, unknown>): Station => {
    const properties = propertiesOf(feature);
    return {
      id: String(properties.CLIMATE_IDENTIFIER),
      name: String(properties.STATION_NAME),
      elevation: Number.parseFloat(String(properties.ELEVATION)) || 0,
    };
  };

  /** The nearest station within the radius that has hourly data and has sent some in the last thirty days. */
  async function nearest({latitude, longitude}: {latitude: number; longitude: number}): Promise<Station | null> {
    const dLat = RADIUS_KM / KM_PER_DEGREE;
    const dLon = RADIUS_KM / (KM_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));
    const bbox = [longitude - dLon, latitude - dLat, longitude + dLon, latitude + dLat].join(',');
    const candidates = (await query('climate-stations', {bbox, limit: '100'})).flatMap(feature => {
      const properties = propertiesOf(feature);
      const coordinates = isRecord(feature.geometry) ? (feature.geometry.coordinates as number[]) : [];
      const last = Date.parse(`${String(properties.HLY_LAST_DATE).replace(' ', 'T')}Z`);
      const distance = kilometres(latitude, longitude, coordinates[1], coordinates[0]);
      const active = properties.HAS_HOURLY_DATA === 'Y' && now() - last <= MAX_AGE_MS;
      return active && distance <= RADIUS_KM ? [{feature, distance}] : [];
    });
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.length ? stationOf(candidates[0].feature) : null;
  }

  // the choice is kept for the house it was made for; a lookup that failed is not, so the next read asks again
  let chosen: {key: string; station: Promise<Station | null>} | undefined;
  function stationFor({station, latitude, longitude}: ArchiveHouse): Promise<Station | null> {
    if (station === false || (station === null && (latitude === null || longitude === null)))
      return Promise.resolve(null);
    const key = JSON.stringify([station, latitude, longitude]);
    if (chosen?.key === key) return chosen.station;
    const lookup =
      typeof station === 'string'
        ? query('climate-stations', {CLIMATE_IDENTIFIER: station}).then(found =>
            found.length ? stationOf(found[0]) : null,
          )
        : nearest({latitude: latitude!, longitude: longitude!});
    const entry = {key, station: lookup};
    chosen = entry;
    lookup.catch(() => {
      if (chosen === entry) chosen = undefined;
    });
    return lookup;
  }

  /** The hourly rows of the query as `[start, value]`, the key's field read, the sea-level pressure made. */
  async function hours({station, key, from, to}: Query): Promise<[number, number][]> {
    const field = HOURLY[key]!;
    const pressure = key === 'pres';
    const params = {
      CLIMATE_IDENTIFIER: station.id,
      datetime: `${new Date(from).toISOString()}/${new Date(to - 1).toISOString()}`,
      sortby: 'UTC_DATE',
      limit: '10000',
      properties: ['UTC_DATE', field, ...(pressure ? ['TEMP'] : [])].join(','),
    };
    return (await query('climate-hourly', params)).flatMap(feature => {
      const row = propertiesOf(feature);
      // UTC_DATE comes with no `Z`: it is UTC all the same
      const at = Date.parse(`${String(row.UTC_DATE)}Z`);
      let value = numberAt(row, field);
      if (value !== null && pressure) value = seaLevel(value, numberAt(row, 'TEMP'), station.elevation);
      return value === null || !(at >= from && at < to) ? [] : [[at, value] as [number, number]];
    });
  }

  /** A row per hour whose value is there. */
  async function hourRows(q: Query): Promise<StatisticRow[]> {
    const values = await hours(q);
    return values.map(([start, value]) => ({start, end: start + HOUR_MS, mean: value, min: value, max: value}));
  }

  /** The days of the query: the daily series where the key has one, else the hourly rows folded by local day. */
  async function dayRows(q: Query): Promise<StatisticRow[]> {
    const {station, key, from, to} = q;
    const zone = zoneFor(q.timeZone);
    const statistic = (start: string, values: Partial<Record<Statistic, number>>): StatisticRow[] => {
      const row: StatisticRow = {start: zone.startOf(start), end: zone.startOf(zone.next(start)), ...values};
      // a day that ended before the range starts, or began after it ends, is not part of it
      return Object.keys(values).length && row.end > from && row.start < to ? [row] : [];
    };
    const daily = DAILY[key];
    if (daily) {
      const params = {
        CLIMATE_IDENTIFIER: station.id,
        datetime: `${zone.dayOf(from)}/${zone.dayOf(to - 1)}`,
        sortby: 'LOCAL_DATE',
        limit: '1000',
        properties: ['LOCAL_DATE', ...Object.values(daily)].join(','),
      };
      return (await query('climate-daily', params)).flatMap(feature => {
        const row = propertiesOf(feature);
        const values: Partial<Record<Statistic, number>> = {};
        for (const [name, field] of Object.entries(daily) as [Statistic, string][]) {
          const value = numberAt(row, field);
          if (value !== null) values[name] = value;
        }
        // LOCAL_DATE is local standard time all year, so its date is the day's name and no more
        return statistic(String(row.LOCAL_DATE).slice(0, 10), values);
      });
    }
    // from the local midnight of the first day, so that the first day is whole
    const values = await hours({...q, from: zone.startOf(zone.dayOf(from))});
    const byDay = new Map<string, number[]>();
    for (const [at, value] of values) {
      const day = zone.dayOf(at);
      byDay.set(day, [...(byDay.get(day) ?? []), value]);
    }
    return [...byDay].flatMap(([day, list]) =>
      statistic(day, {
        mean: list.reduce((sum, v) => sum + v, 0) / list.length,
        min: Math.min(...list),
        max: Math.max(...list),
      }),
    );
  }

  // the periods the archive keeps (not the five minutes, which the recorder always has): which keys each covers, and how it reads
  const PERIODS: Partial<
    Record<StatisticsPeriod, {covers: (key: EntityKey) => boolean; rows: (q: Query) => Promise<StatisticRow[]>}>
  > = {
    hour: {covers: key => key in HOURLY, rows: hourRows},
    day: {covers: key => key in HOURLY || key in DAILY, rows: dayRows},
  };

  return {
    async rows(key, period, start, end): Promise<ArchiveFill | null> {
      const kept = PERIODS[period];
      const place = house();
      if (!kept?.covers(key) || !place) return null;
      const station = await stationFor(place);
      if (!station) return null;
      const rows = await kept.rows({station, key, from: start.getTime(), to: end.getTime(), timeZone: place.timeZone});
      return {station: station.name, rows};
    },
  };
}
