// The ECCC climate archive provider at its seam: a `fetch` that answers literal GeoJSON shaped as api.weather.gc.ca sends it, and the
// urls that left as the proof of what was asked. No network.
import {describe, expect, test, vi} from 'vitest';
import {
  ARCHIVED_KEYS,
  createClimateArchive,
  jsonFetcher,
  type ArchiveHouse,
} from '../../../src/providers/climate-archive.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-17T12:00:00Z');
// Mascouche, in the Toronto zone the fake houses use (Quebec shares its rules)
const HOUSE: ArchiveHouse = {latitude: 45.75, longitude: -73.6, timeZone: 'America/Toronto', station: null};

const station = (id: string, name: string, lon: number, lat: number, extra: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: {type: 'Point', coordinates: [lon, lat]},
  properties: {
    CLIMATE_IDENTIFIER: id,
    STATION_NAME: name,
    HAS_HOURLY_DATA: 'Y',
    HLY_LAST_DATE: '2026-11-15 12:30:10',
    ELEVATION: '21.00',
    ...extra,
  },
});
const collection = (features: unknown[], extra: Record<string, unknown> = {}) => ({
  type: 'FeatureCollection',
  features,
  numberMatched: features.length,
  numberReturned: features.length,
  links: [],
  ...extra,
});
const hourly = (utc: string, properties: Record<string, unknown>) => ({properties: {UTC_DATE: utc, ...properties}});

// the stations of the area: the closed town one, a good one 13 km away, a better-looking one 60 km away, one whose feed stopped
const LASSOMPTION = station('7014160', "L'ASSOMPTION", -73.4347, 45.8094);
const AREA = collection([
  station('7014629', 'MASCOUCHE', -73.6, 45.75, {HAS_HOURLY_DATA: 'N'}),
  station('7000001', 'STOPPED', -73.6, 45.76, {HLY_LAST_DATE: '2026-09-01 00:00:00'}),
  station('7000002', 'FAR', -74.4, 45.75),
  LASSOMPTION,
  station('7000003', 'NEXT', -73.3, 45.9),
]);

/** A fetch over literal replies: the first route whose path appears in the url answers; the urls are kept. */
function net(routes: Record<string, unknown>) {
  const urls: URL[] = [];
  const fetcher = vi.fn((url: string) => {
    const asked = new URL(url);
    urls.push(asked);
    const route = Object.keys(routes).find(path => asked.pathname.includes(path));
    if (!route) throw new Error(`no route for ${url}`);
    const reply = routes[route];
    return Promise.resolve(typeof reply === 'function' ? (reply as () => unknown)() : reply);
  });
  const to = (path: string) => urls.filter(u => u.pathname.includes(path));
  return {fetcher, urls, to};
}
const archiveOver = (routes: Record<string, unknown>, house: ArchiveHouse | null = HOUSE) => {
  const wire = net(routes);
  return {...wire, archive: createClimateArchive({fetch: wire.fetcher, now: () => NOW, house: () => house})};
};

const START = new Date('2026-11-10T05:00:00Z');
const END = new Date('2026-11-10T08:00:00Z');

describe('the station', () => {
  test('the nearest active hourly station within 40 km, found in the bounding box of the house', async () => {
    const {archive, to} = archiveOver({'climate-stations': AREA, 'climate-hourly': collection([])});
    const fill = await archive.rows('wind', 'hour', START, END);
    expect(fill?.station).toBe("L'ASSOMPTION");
    const bbox = to('climate-stations')[0].searchParams.get('bbox')!.split(',').map(Number);
    expect(bbox[0]).toBeCloseTo(-73.6 - 40 / (111.32 * Math.cos((45.75 * Math.PI) / 180)), 2);
    expect(bbox[3]).toBeCloseTo(45.75 + 40 / 111.32, 2);
    expect(to('climate-hourly')[0].searchParams.get('CLIMATE_IDENTIFIER')).toBe('7014160');
  });

  test('none in range: the archive is off, and no data is asked for', async () => {
    const {archive, to} = archiveOver({'climate-stations': collection([AREA.features[0], AREA.features[2]])});
    expect(await archive.rows('wind', 'hour', START, END)).toBeNull();
    expect(to('climate-hourly')).toHaveLength(0);
  });

  test('the config names a station: its own record is read (name, elevation), and an unknown one turns the archive off', async () => {
    const {archive, to} = archiveOver(
      {'climate-stations': collection([LASSOMPTION]), 'climate-hourly': collection([])},
      {...HOUSE, station: '7014160'},
    );
    expect((await archive.rows('wind', 'hour', START, END))?.station).toBe("L'ASSOMPTION");
    expect(to('climate-stations')[0].searchParams.get('CLIMATE_IDENTIFIER')).toBe('7014160');
    const unknown = archiveOver({'climate-stations': collection([])}, {...HOUSE, station: '1'});
    expect(await unknown.archive.rows('wind', 'hour', START, END)).toBeNull();
  });

  test('`false`, a house with no place and no host-given house make no request at all', async () => {
    for (const house of [{...HOUSE, station: false as const}, {...HOUSE, latitude: null}, null]) {
      const {archive, urls} = archiveOver({}, house);
      expect(await archive.rows('wind', 'hour', START, END)).toBeNull();
      expect(urls).toHaveLength(0);
    }
  });

  test('a station whose last hourly date is not a date is not active', async () => {
    const {archive} = archiveOver({
      'climate-stations': collection([station('1', 'ODD', -73.6, 45.75, {HLY_LAST_DATE: null})]),
    });
    expect(await archive.rows('wind', 'hour', START, END)).toBeNull();
  });

  test('the choice is kept, and a lookup that failed is made again', async () => {
    let up = false;
    const {archive, to} = archiveOver({
      'climate-stations': () => {
        if (!up) throw new Error('offline');
        return AREA;
      },
      'climate-hourly': collection([]),
    });
    await expect(archive.rows('wind', 'hour', START, END)).rejects.toThrow('offline');
    up = true;
    await archive.rows('wind', 'hour', START, END);
    await archive.rows('hum', 'hour', START, END);
    expect(to('climate-stations')).toHaveLength(2);
  });
});

describe('hourly rows', () => {
  const rows = (properties: unknown[]) => ({'climate-stations': AREA, 'climate-hourly': collection(properties)});

  test('the request, and a row per hour in the recorder shape: UTC_DATE read as UTC, a null skipped, not turned into 0', async () => {
    const {archive, to} = archiveOver(
      rows([
        hourly('2026-11-10T05:00:00', {WIND_SPEED: 12}),
        hourly('2026-11-10T06:00:00', {WIND_SPEED: null}),
        hourly('2026-11-10T07:00:00', {WIND_SPEED: 0}),
        hourly('2026-11-10T08:00:00', {WIND_SPEED: 30}),
      ]),
    );
    const fill = await archive.rows('wind', 'hour', START, END);
    expect(fill?.rows).toEqual([
      {start: START.getTime(), end: START.getTime() + HOUR, mean: 12, min: 12, max: 12},
      {start: START.getTime() + 2 * HOUR, end: START.getTime() + 3 * HOUR, mean: 0, min: 0, max: 0},
    ]);
    const asked = to('climate-hourly')[0].searchParams;
    expect(asked.get('datetime')).toBe('2026-11-10T05:00:00.000Z/2026-11-10T07:59:59.999Z');
    expect(asked.get('properties')).toBe('UTC_DATE,WIND_SPEED');
    expect(asked.get('sortby')).toBe('UTC_DATE');
    expect(asked.get('limit')).toBe('10000');
  });

  test('each key reads its own field, and the keys the archive has no hourly series for are not asked', async () => {
    const fields = {
      outT: 'TEMP',
      dew: 'DEW_POINT_TEMP',
      hum: 'RELATIVE_HUMIDITY',
      wind: 'WIND_SPEED',
      chill: 'WINDCHILL',
      humidex: 'HUMIDEX',
    } as const;
    for (const [key, field] of Object.entries(fields)) {
      const {archive, to} = archiveOver(rows([hourly('2026-11-10T05:00:00', {[field]: 4.5})]));
      const fill = await archive.rows(key as keyof typeof fields, 'hour', START, END);
      expect(fill?.rows.map(r => r.mean)).toEqual([4.5]);
      expect(to('climate-hourly')[0].searchParams.get('properties')).toBe(`UTC_DATE,${field}`);
    }
    const {archive, to} = archiveOver(rows([]));
    expect(await archive.rows('gust', 'hour', START, END)).toBeNull();
    expect(to('climate-hourly')).toHaveLength(0);
    expect(ARCHIVED_KEYS).toEqual(['outT', 'dew', 'hum', 'pres', 'wind', 'gust', 'chill', 'humidex']);
  });

  test("the pressure at the station is brought to sea level with the station's elevation, and without a temperature by the scale height", async () => {
    const {archive, to} = archiveOver(
      rows([
        hourly('2026-11-10T05:00:00', {STATION_PRESSURE: 100.87, TEMP: 2.2}),
        hourly('2026-11-10T06:00:00', {STATION_PRESSURE: 100.87, TEMP: null}),
        hourly('2026-11-10T07:00:00', {STATION_PRESSURE: null, TEMP: 2.2}),
      ]),
    );
    const fill = await archive.rows('pres', 'hour', START, END);
    expect(fill?.rows).toHaveLength(2);
    expect(fill?.rows[0].mean).toBeCloseTo(101.13315, 4);
    expect(fill?.rows[1].mean).toBeCloseTo(101.12147, 4);
    expect(to('climate-hourly')[0].searchParams.get('properties')).toBe('UTC_DATE,STATION_PRESSURE,TEMP');
  });

  test('a station with no elevation on record is taken at sea level', async () => {
    const flat = collection([station('7014160', 'FLAT', -73.6, 45.75, {ELEVATION: null})]);
    const {archive} = archiveOver({
      'climate-stations': flat,
      'climate-hourly': collection([hourly('2026-11-10T05:00:00', {STATION_PRESSURE: 101, TEMP: 5})]),
    });
    expect((await archive.rows('pres', 'hour', START, END))?.rows[0].mean).toBeCloseTo(101, 6);
  });

  test('a reply that has more rows than one page is read to its end by the next link', async () => {
    const pages = [
      collection([hourly('2026-11-10T05:00:00', {TEMP: 1})], {
        numberMatched: 2,
        links: [
          {rel: 'self', href: 'https://api.weather.gc.ca/self'},
          {rel: 'next', href: 'https://api.weather.gc.ca/collections/climate-hourly/items?offset=1'},
        ],
      }),
      collection([hourly('2026-11-10T06:00:00', {TEMP: 2})], {numberMatched: 2}),
    ];
    const {archive} = archiveOver({'climate-stations': AREA, 'climate-hourly': () => pages.shift()});
    expect((await archive.rows('outT', 'hour', START, END))?.rows.map(r => r.mean)).toEqual([1, 2]);
  });

  test('a page that says there is more and gives no link ends the read', async () => {
    const page = collection([hourly('2026-11-10T05:00:00', {TEMP: 1})], {numberMatched: 9, links: undefined});
    const {archive, to} = archiveOver({'climate-stations': AREA, 'climate-hourly': page});
    expect((await archive.rows('outT', 'hour', START, END))?.rows).toHaveLength(1);
    expect(to('climate-hourly')).toHaveLength(1);
  });

  test('a reply that is not a feature collection is a failure, and so is a bad status', async () => {
    const {archive} = archiveOver({'climate-stations': AREA, 'climate-hourly': {error: 'nope'}});
    await expect(archive.rows('outT', 'hour', START, END)).rejects.toThrow('unexpected reply');
    const ok = (body: unknown, status: number) =>
      vi.fn(() => Promise.resolve({ok: status === 200, status, json: () => Promise.resolve(body)}));
    expect(await jsonFetcher(ok({a: 1}, 200) as never)('https://x.invalid/')).toEqual({a: 1});
    await expect(jsonFetcher(ok({}, 503) as never)('https://x.invalid/')).rejects.toThrow('HTTP 503');
  });

  test('the periods the archive does not keep (the five minutes, a week) are not asked for', async () => {
    const {archive, urls} = archiveOver(rows([]));
    expect(await archive.rows('outT', '5minute', START, END)).toBeNull();
    expect(await archive.rows('outT', 'week', START, END)).toBeNull();
    expect(urls).toHaveLength(0);
  });
});

describe('daily rows', () => {
  const START_DAY = new Date('2026-10-29T12:00:00Z');
  const END_DAY = new Date('2026-11-11T05:00:00Z');
  // 2026-10-30 is on daylight saving time in Toronto (UTC-4), 2026-11-10 is not (UTC-5): a day starts at the local midnight of its date
  const MIDNIGHT = {'2026-10-30': Date.parse('2026-10-30T04:00:00Z'), '2026-11-10': Date.parse('2026-11-10T05:00:00Z')};

  test('the temperature comes from the daily series, a day starting at the local midnight in the house zone, DST or not', async () => {
    const daily = collection([
      {properties: {LOCAL_DATE: '2026-10-30 00:00:00', MEAN_TEMPERATURE: 8, MIN_TEMPERATURE: 3, MAX_TEMPERATURE: 12}},
      {
        properties: {
          LOCAL_DATE: '2026-10-31 00:00:00',
          MEAN_TEMPERATURE: null,
          MIN_TEMPERATURE: null,
          MAX_TEMPERATURE: null,
        },
      },
      {
        properties: {
          LOCAL_DATE: '2026-11-10 00:00:00',
          MEAN_TEMPERATURE: 4.8,
          MIN_TEMPERATURE: 1.8,
          MAX_TEMPERATURE: 7.9,
        },
      },
    ]);
    const {archive, to} = archiveOver({'climate-stations': AREA, 'climate-daily': daily});
    const fill = await archive.rows('outT', 'day', START_DAY, END_DAY);
    expect(fill?.rows).toEqual([
      {start: MIDNIGHT['2026-10-30'], end: MIDNIGHT['2026-10-30'] + DAY, mean: 8, min: 3, max: 12},
      {start: MIDNIGHT['2026-11-10'], end: MIDNIGHT['2026-11-10'] + DAY, mean: 4.8, min: 1.8, max: 7.9},
    ]);
    const asked = to('climate-daily')[0].searchParams;
    expect(asked.get('datetime')).toBe('2026-10-29/2026-11-10');
    expect(asked.get('CLIMATE_IDENTIFIER')).toBe('7014160');
    expect(asked.get('properties')).toBe('LOCAL_DATE,MEAN_TEMPERATURE,MIN_TEMPERATURE,MAX_TEMPERATURE');
    expect(asked.get('sortby')).toBe('LOCAL_DATE');
  });

  test('the gust is the daily maximum gust, as the day row`s max alone, and a day without one is skipped', async () => {
    const daily = collection([
      {properties: {LOCAL_DATE: '2026-11-10 00:00:00', SPEED_MAX_GUST: 44}},
      {properties: {LOCAL_DATE: '2026-11-11 00:00:00', SPEED_MAX_GUST: null}},
    ]);
    const {archive, to} = archiveOver({'climate-stations': AREA, 'climate-daily': daily});
    const fill = await archive.rows('gust', 'day', START_DAY, END_DAY);
    expect(fill?.rows).toEqual([{start: MIDNIGHT['2026-11-10'], end: MIDNIGHT['2026-11-10'] + DAY, max: 44}]);
    expect(to('climate-daily')[0].searchParams.get('properties')).toBe('LOCAL_DATE,SPEED_MAX_GUST');
  });

  test('the days that end before the range starts, or start after it ends, are left out', async () => {
    const daily = collection([
      {properties: {LOCAL_DATE: '2026-10-28 00:00:00', MEAN_TEMPERATURE: 1}},
      {properties: {LOCAL_DATE: '2026-11-11 00:00:00', MEAN_TEMPERATURE: 2}},
    ]);
    const {archive} = archiveOver({'climate-stations': AREA, 'climate-daily': daily});
    expect((await archive.rows('outT', 'day', START_DAY, END_DAY))?.rows).toEqual([]);
  });

  test('the other series are folded by day from the hourly rows: mean, low and high of the local day, not the UTC one', async () => {
    // the 9th, local, is 05:00Z of the 9th to 05:00Z of the 10th: 04:00Z of the 10th still belongs to it
    const hours = collection([
      hourly('2026-11-09T04:00:00', {RELATIVE_HUMIDITY: 90}), // the 8th, before the range
      hourly('2026-11-09T05:00:00', {RELATIVE_HUMIDITY: 60}),
      hourly('2026-11-09T18:00:00', {RELATIVE_HUMIDITY: 80}),
      hourly('2026-11-09T19:00:00', {RELATIVE_HUMIDITY: null}),
      hourly('2026-11-10T04:00:00', {RELATIVE_HUMIDITY: 70}),
      hourly('2026-11-10T05:00:00', {RELATIVE_HUMIDITY: 50}),
    ]);
    const {archive, to} = archiveOver({'climate-stations': AREA, 'climate-hourly': hours});
    const fill = await archive.rows('hum', 'day', new Date('2026-11-09T05:00:00Z'), new Date('2026-11-10T06:00:00Z'));
    const nov9 = Date.parse('2026-11-09T05:00:00Z');
    expect(fill?.rows).toEqual([
      {start: nov9, end: nov9 + DAY, mean: 70, min: 60, max: 80},
      {start: nov9 + DAY, end: nov9 + 2 * DAY, mean: 50, min: 50, max: 50},
    ]);
    // the request starts at the local midnight of the first day, so the first day is whole
    expect(to('climate-hourly')[0].searchParams.get('datetime')!.split('/')[0]).toBe('2026-11-09T05:00:00.000Z');
  });
});
