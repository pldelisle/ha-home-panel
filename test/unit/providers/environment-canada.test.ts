// environmentCanadaSource: Environment Canada's sensors as a source, and the three rules that are the integration's own,
// the fold of day and night entries, the alert attributes and the feels-like kind. Literal states in, literal inputs out.
import {describe, expect, test} from 'vitest';
import {resolveConfig} from '../../../src/core/config.ts';
import {createFormatters} from '../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../src/core/i18n/locale.ts';
import type {HassEntities} from '../../../src/core/hass.ts';
import {
  conditionWordsOf,
  environmentCanadaSource,
  feelsLike,
  foldForecastDays,
  readAlerts,
} from '../../../src/providers/environment-canada.ts';
import type {ForecastEntry} from '../../../src/providers/weather-source.ts';
import {entity, fakeHass} from '../fake-hass.ts';
import * as full from '../../houses/full.mjs';
import * as bare from '../../houses/bare.mjs';

/** A house of sensors named under the town `springfield`: the resolver finds them by suffix. */
function sensors(values: Record<string, string | number>, attributes: Record<string, Record<string, unknown>> = {}) {
  const states: HassEntities = {'weather.springfield_forecast': entity('weather.springfield_forecast', 'cloudy')};
  for (const [suffix, value] of Object.entries(values)) {
    const id = `sensor.springfield_${suffix}`;
    states[id] = entity(id, String(value), attributes[suffix]);
  }
  return states;
}
const configOf = (states: HassEntities) => resolveConfig({}, states);
const readOf = (states: HassEntities) => environmentCanadaSource.read(states, configOf(states));

describe('presence and ids', () => {
  test('a house with the temperature sensor or the condition sensor has the source', () => {
    for (const suffix of ['temperature', 'current_condition']) {
      const states = sensors({[suffix]: 4});
      expect(environmentCanadaSource.name).toBe('environment-canada');
      expect(environmentCanadaSource.present(states, configOf(states))).toBe(true);
    }
  });

  test('a house with only other Environment Canada sensors, or only the entity, does not', () => {
    for (const states of [sensors({humidity: 70}), sensors({}), fakeHass.fromHouse(bare).states]) {
      expect(environmentCanadaSource.present(states, configOf(states))).toBe(false);
      expect(environmentCanadaSource.read(states, configOf(states))).toMatchObject({alerts: []});
    }
  });

  test('a sensor named in the config that Home Assistant does not have is not present', () => {
    const states = sensors({humidity: 70});
    const config = resolveConfig({entities: {outdoor_temperature: 'sensor.gone'}}, states);
    expect(environmentCanadaSource.present(states, config)).toBe(false);
  });

  test('its ids are the sensors the resolver found, none of the ones it did not', () => {
    const states = fakeHass.fromHouse(full).states;
    expect([...environmentCanadaSource.ids(configOf(states))].sort()).toEqual(
      [
        'current_condition',
        'temperature',
        'high_temperature',
        'low_temperature',
        'normal_high_temperature',
        'normal_low_temperature',
        'wind_speed',
        'wind_direction',
        'humidity',
        'uv_index',
        'aqhi',
        'dew_point',
        'barometric_pressure',
        'tendency',
        'wind_gust',
        'observation_time',
        'summary',
      ]
        .map(suffix => `sensor.springfield_${suffix}`)
        .sort(),
    );
    expect(environmentCanadaSource.ids(configOf(fakeHass.fromHouse(bare).states))).toEqual([]);
  });
});

describe('what it reads', () => {
  test('the full test house, as the afternoon baseline shows it', () => {
    const hass = fakeHass.fromHouse(full);
    const {foldForecast, ...read} = environmentCanadaSource.read(hass.states, configOf(hass.states));
    expect(foldForecast).toBe(foldForecastDays);
    expect(read).toEqual({
      temperature: 4.2,
      condition: 'Mainly Sunny',
      conditionWords: 'weather.cond.ec.mainlySunny',
      today: {hi: 7, lo: -1, pop: null},
      normals: {hi: 6, lo: -2},
      wind: {speed: 14, gust: 25, direction: 'SW', bearing: null},
      humidity: 71,
      dewPoint: -0.5,
      pressure: {kpa: 101.9, tendency: 'rising'},
      uv: 1,
      aqhi: 2,
      summary: 'Sunny with cloudy periods.',
      observation: {at: Date.parse('2026-11-07T13:30:00-05:00'), station: null},
      alerts: [],
    });
  });

  test('every sensor, with the station, the bearing, the visibility and the chance of precipitation', () => {
    const states = sensors(
      {
        temperature: -3,
        current_condition: 'Light Snow',
        high_temperature: 0,
        low_temperature: -8,
        chance_of_precipitation: 60,
        normal_high_temperature: 2,
        normal_low_temperature: -6,
        wind_speed: 20,
        wind_gust: 35,
        wind_direction: 'NW',
        wind_bearing: 315,
        humidity: 88,
        dew_point: -4,
        barometric_pressure: 100.2,
        tendency: 'falling',
        uv_index: 0,
        aqhi: 4,
        visibility: 8,
        wind_chill: -9,
        summary: 'Snow ending this evening.',
        observation_time: '2026-11-07T18:30:00+00:00',
      },
      {observation_time: {station: 'Springfield Airport'}},
    );
    expect(readOf(states)).toMatchObject({
      temperature: -3,
      condition: 'Light Snow',
      today: {hi: 0, lo: -8, pop: 60},
      normals: {hi: 2, lo: -6},
      wind: {speed: 20, gust: 35, direction: 'NW', bearing: 315},
      humidity: 88,
      dewPoint: -4,
      pressure: {kpa: 100.2, tendency: 'falling'},
      uv: 0,
      aqhi: 4,
      visibility: 8,
      feelsLike: {value: -9, kind: 'windChill'},
      summary: 'Snow ending this evening.',
      observation: {at: Date.parse('2026-11-07T18:30:00Z'), station: 'Springfield Airport'},
    });
  });

  test('a field a sensor does not have is left out, so another source answers for it', () => {
    const read = readOf(sensors({temperature: 4, humidity: 'unavailable', observation_time: 'unknown'}));
    expect(Object.keys(read).sort()).toEqual(['alerts', 'foldForecast', 'temperature']);
  });

  test('a group with one known member is read whole, the others null', () => {
    expect(readOf(sensors({temperature: 4, wind_gust: 30})).wind).toEqual({
      speed: null,
      gust: 30,
      direction: null,
      bearing: null,
    });
  });

  test('an observation time that is not a date is left out', () => {
    expect(readOf(sensors({temperature: 4, observation_time: 'yesterday-ish'})).observation).toBeUndefined();
  });
});

describe('feels like', () => {
  const entities = (chill: string | null, humidex: string | null) => ({chill, humidex});
  const states = {
    'sensor.chill': entity('sensor.chill', '-9'),
    'sensor.humidex': entity('sensor.humidex', '31'),
    'sensor.gone': entity('sensor.gone', 'unavailable'),
  };

  test('wind chill when there is one, with its kind', () => {
    expect(feelsLike(states, entities('sensor.chill', 'sensor.humidex'))).toEqual({value: -9, kind: 'windChill'});
  });

  test('else the humidex', () => {
    expect(feelsLike(states, entities('sensor.gone', 'sensor.humidex'))).toEqual({value: 31, kind: 'humidex'});
    expect(feelsLike(states, entities(null, 'sensor.humidex'))).toEqual({value: 31, kind: 'humidex'});
  });

  test('else nothing', () => {
    expect(feelsLike(states, entities(null, null))).toBeNull();
    expect(feelsLike(states, entities('sensor.gone', 'sensor.absent'))).toBeNull();
  });
});

describe('alerts', () => {
  const ids = (
    warnings: string | null,
    watches: string | null = null,
    advisories: string | null = null,
    statements: string | null = null,
  ) => ({
    warnings,
    watches,
    advisories,
    statements,
  });

  test('a sensor above zero lists its alerts from alert_N and alert_time_N', () => {
    const states = {
      'sensor.warnings': entity('sensor.warnings', '2', {
        alert_1: 'Snowfall warning',
        alert_time_1: 'Friday 9:00 pm',
        alert_2: 'Wind warning',
        alert_time_2: 'Saturday 6:00 am',
      }),
    };
    expect(readAlerts(states, ids('sensor.warnings'))).toEqual([
      {kind: 'warning', tone: 'crit', title: 'Snowfall warning', count: null, time: 'Friday 9:00 pm'},
      {kind: 'warning', tone: 'crit', title: 'Wind warning', count: null, time: 'Saturday 6:00 am'},
    ]);
  });

  test('an alert with no time has none', () => {
    const states = {'sensor.statements': entity('sensor.statements', '1', {alert_1: 'Special weather statement'})};
    expect(readAlerts(states, ids(null, null, null, 'sensor.statements'))).toEqual([
      {kind: 'statement', tone: 'ok', title: 'Special weather statement', count: null, time: null},
    ]);
  });

  test('a sensor that only counts gives one row with the count and no title', () => {
    const states = {'sensor.watches': entity('sensor.watches', '2')};
    expect(readAlerts(states, ids(null, 'sensor.watches'))).toEqual([
      {kind: 'watch', tone: 'warn', title: null, count: 2, time: null},
    ]);
  });

  test('the four kinds come in the order warnings, watches, advisories, statements, each with its tone', () => {
    const states = {
      'sensor.s': entity('sensor.s', '1'),
      'sensor.a': entity('sensor.a', '1'),
      'sensor.w': entity('sensor.w', '1'),
      'sensor.x': entity('sensor.x', '1'),
    };
    const kinds = readAlerts(states, ids('sensor.x', 'sensor.w', 'sensor.a', 'sensor.s')).map(a => [a.kind, a.tone]);
    expect(kinds).toEqual([
      ['warning', 'crit'],
      ['watch', 'warn'],
      ['advisory', 'warn'],
      ['statement', 'ok'],
    ]);
  });

  test.each([['0'], ['-1'], ['unavailable'], ['unknown'], ['none']])('a sensor that says %s has no alerts', state => {
    const states = {'sensor.warnings': entity('sensor.warnings', state, {alert_1: 'Stale text'})};
    expect(readAlerts(states, ids('sensor.warnings'))).toEqual([]);
  });

  test('a sensor the house does not have, or the config left unset, has none', () => {
    expect(readAlerts({}, ids('sensor.absent'))).toEqual([]);
    expect(readAlerts({}, ids(null))).toEqual([]);
  });

  test('is what the source reads from the house', () => {
    const states = sensors({temperature: 4, warnings: 1}, {warnings: {alert_1: 'Frost warning'}});
    expect(readOf(states).alerts).toEqual([
      {kind: 'warning', tone: 'crit', title: 'Frost warning', count: null, time: null},
    ]);
  });
});

describe('the fold of day and night entries into one row per local day', () => {
  // the house's local day: Toronto, so 2026-11-07T22:00Z is still the 7th and 2026-11-08T05:00Z is the 8th
  const formats = createFormatters(englishLocale('America/Toronto'));
  const isoDay = (ms: number) => formats.isoDay(ms);
  const at = (iso: string) => iso;
  const fold = (entries: ForecastEntry[]) => foldForecastDays(entries, isoDay);

  test('a day entry and its night entry are one row: the day high, the night low, the day condition', () => {
    const rows = fold([
      {
        datetime: at('2026-11-07T15:00:00Z'),
        temperature: 8,
        condition: 'sunny',
        is_daytime: true,
        precipitation_probability: 10,
      },
      {
        datetime: at('2026-11-08T02:00:00Z'),
        temperature: 1,
        condition: 'clear-night',
        is_daytime: false,
        precipitation_probability: 30,
      },
    ]);
    expect(rows).toEqual([
      {
        dayKey: '2026-11-07',
        at: Date.parse('2026-11-07T15:00:00Z'),
        hi: 8,
        lo: 1,
        condition: 'sunny',
        pop: 30,
        isTonight: false,
      },
    ]);
  });

  test('a night-only day is tonight: a low and no high, with the night condition', () => {
    const rows = fold([
      {datetime: at('2026-11-08T02:00:00Z'), temperature: 1, condition: 'clear-night', is_daytime: false},
      {datetime: at('2026-11-08T15:00:00Z'), temperature: 6, condition: 'cloudy', is_daytime: true},
    ]);
    expect(rows).toEqual([
      {
        dayKey: '2026-11-07',
        at: Date.parse('2026-11-08T02:00:00Z'),
        hi: null,
        lo: 1,
        condition: 'clear-night',
        pop: null,
        isTonight: true,
      },
      {
        dayKey: '2026-11-08',
        at: Date.parse('2026-11-08T15:00:00Z'),
        hi: 6,
        lo: null,
        condition: 'cloudy',
        pop: null,
        isTonight: false,
      },
    ]);
  });

  test('a night entry with its own templow gives that low', () => {
    const [row] = fold([{datetime: at('2026-11-08T02:00:00Z'), temperature: 3, templow: 0, is_daytime: false}]);
    expect(row.lo).toBe(0);
    expect(row.hi).toBeNull();
  });

  test('the highest high, the lowest low and the largest chance of the entries of a day win', () => {
    const [row] = fold([
      {datetime: at('2026-11-07T14:00:00Z'), temperature: 7, templow: 2, precipitation_probability: 20},
      {datetime: at('2026-11-07T16:00:00Z'), temperature: 9, templow: -1, precipitation_probability: 60},
      {datetime: at('2026-11-07T18:00:00Z'), temperature: 8, templow: 4, precipitation_probability: 0},
    ]);
    expect(row).toMatchObject({hi: 9, lo: -1, pop: 60});
  });

  test('the first day condition is kept, a later day entry does not replace it', () => {
    const [row] = fold([
      {datetime: at('2026-11-07T14:00:00Z'), temperature: 7, condition: 'rainy'},
      {datetime: at('2026-11-07T16:00:00Z'), temperature: 9, condition: 'sunny'},
    ]);
    expect(row.condition).toBe('rainy');
  });

  test('a night entry that is not the first of its day still gives the night condition, a day entry beats it', () => {
    expect(
      fold([{datetime: at('2026-11-08T02:00:00Z'), temperature: 1, condition: 'fog', is_daytime: false}])[0].condition,
    ).toBe('fog');
    expect(
      fold([
        {datetime: at('2026-11-07T14:00:00Z'), temperature: 7, condition: 'cloudy', is_daytime: true},
        {datetime: at('2026-11-08T02:00:00Z'), temperature: 1, condition: 'fog', is_daytime: false},
      ])[0].condition,
    ).toBe('cloudy');
  });

  test('a day with no temperature and no condition has none, and is not tonight', () => {
    expect(fold([{datetime: at('2026-11-07T14:00:00Z')}])).toEqual([
      {
        dayKey: '2026-11-07',
        at: Date.parse('2026-11-07T14:00:00Z'),
        hi: null,
        lo: null,
        condition: null,
        pop: null,
        isTonight: false,
      },
    ]);
  });

  test('a night entry with no temperature and no condition is tonight with no low', () => {
    const [row] = fold([{datetime: at('2026-11-08T02:00:00Z'), is_daytime: false}]);
    expect(row).toMatchObject({hi: null, lo: null, condition: null, isTonight: true});
  });

  test('groups by the house local day, not the UTC day: 9 pm and 4 am the next UTC morning', () => {
    const rows = fold([
      {datetime: at('2026-11-08T02:00:00Z'), temperature: 1, is_daytime: false}, // 9 pm on the 7th in Toronto
      {datetime: at('2026-11-08T04:30:00Z'), temperature: 0, is_daytime: false}, // 11:30 pm on the 7th in Toronto
    ]);
    expect(rows.map(r => r.dayKey)).toEqual(['2026-11-07']);
    expect(rows[0].lo).toBe(0);
  });

  test('takes the entries Home Assistant sends as numbers of milliseconds too', () => {
    const [row] = fold([{datetime: Date.parse('2026-11-07T14:00:00Z'), temperature: 7}]);
    expect(row).toMatchObject({dayKey: '2026-11-07', hi: 7});
  });

  test('an empty forecast is no rows', () => {
    expect(fold([])).toEqual([]);
  });
});

describe('the condition phrases', () => {
  test('a phrase of the sensor has its catalog message, whatever its case', () => {
    expect(conditionWordsOf('Mainly Sunny')).toBe('weather.cond.ec.mainlySunny');
    expect(conditionWordsOf(' LIGHT snow ')).toBe('weather.cond.ec.lightSnow');
  });

  test('a phrase Home Assistant words too uses its message, and an unknown phrase or none has none', () => {
    expect(conditionWordsOf('Sunny')).toBe('weather.cond.sunny');
    expect(conditionWordsOf('Volcanic ash')).toBeNull();
    expect(conditionWordsOf(null)).toBeNull();
  });
});
