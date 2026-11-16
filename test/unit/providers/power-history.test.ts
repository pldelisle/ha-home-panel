// power-history: the windows asked, and the hourly flow, the meter's totals and the water heater's day, from literal rows. The day keys are the
// house's local days, read from the noon of a daily row, which is the rule of #132.
import {describe, expect, test} from 'vitest';
import {DEFAULT_ENTITIES} from '../../../src/core/entities.ts';
import type {StatisticRow} from '../../../src/core/ha.ts';
import {createFormatters} from '../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../src/core/i18n/locale.ts';
import {
  dailyChanges,
  dayKeys,
  hourlyFlow,
  meterTotals,
  powerWindows,
  rowsOf,
  sessionsWindow,
  sum,
  waterDay,
  windowStart,
} from '../../../src/providers/power-history.ts';
import {fakeHass} from '../fake-hass.ts';

const locale = panelLocale(fakeHass({locale: {language: 'en'}}), {timeZone: 'America/Toronto', browserLocale: 'en'});
const fmt = createFormatters(locale);

const HOUR = 36e5;
const isoDay = (instant: number) => fmt.isoDay(instant);
const DAY = 864e5;
const at = (iso: string) => Date.parse(iso);
/** An hourly or five-minute row. */
const row = (start: number, fields: Partial<StatisticRow>): StatisticRow => ({start, end: start + HOUR, ...fields});
/** A daily row starts at the house's local midnight. */
const dayRow = (iso: string, change: number | null) =>
  row(at(`${iso}T00:00:00-05:00`), {end: at(`${iso}T00:00:00-05:00`) + DAY, change});

const config = {
  entities: {
    ...DEFAULT_ENTITIES,
    grid: 'sensor.grid',
    whP: 'sensor.wh_power',
    whT: 'sensor.wh_temp',
    whE: 'sensor.wh_energy',
    evP: 'sensor.ev',
    energy: 'sensor.meter',
  },
  rooms: [{power: 'sensor.a_power'}, {power: 'sensor.b_power'}] as never,
};

// a Monday in November, 9:45 in the morning, house time
const NOW = at('2026-11-09T09:45:30.250-05:00');

describe('powerWindows', () => {
  const windows = powerWindows(NOW, config, fmt);

  test('each window carries its own ids, period and statistic types', () => {
    expect(windows.hour7).toMatchObject({
      period: 'hour',
      ids: ['sensor.grid', 'sensor.wh_power', 'sensor.ev', 'sensor.a_power', 'sensor.b_power'],
      types: ['mean'],
    });
    expect(windows.today).toMatchObject({period: 'hour', ids: ['sensor.meter'], types: ['change']});
    expect(windows.meter33).toMatchObject({
      period: 'day',
      ids: ['sensor.meter', 'sensor.wh_energy'],
      types: ['change'],
    });
    expect(windows.fiveMin25h).toMatchObject({
      period: '5minute',
      ids: ['sensor.wh_temp', 'sensor.wh_power'],
      types: ['mean'],
    });
  });

  test('the starts sit on a stable instant: the top of the hour, and a minute before local midnight', () => {
    expect(windows.hour7.start.toISOString()).toBe('2026-11-02T14:00:00.000Z');
    expect(windows.meter33.start.toISOString()).toBe('2026-10-07T14:00:00.000Z');
    expect(windows.fiveMin25h.start.toISOString()).toBe('2026-11-08T13:00:00.000Z');
    expect(windows.today.start.toISOString()).toBe('2026-11-09T04:59:00.000Z');
    // ten minutes later asks the same windows
    expect(powerWindows(NOW + 10 * 6e4, config, fmt)).toEqual(windows);
  });

  test('windowStart goes back whole days from the top of the hour', () => {
    expect(windowStart(NOW, 400).toISOString()).toBe('2025-10-05T14:00:00.000Z');
  });
});

describe('sessionsWindow', () => {
  test('the charger’s hourly mean and max for 366 days, from the top of the hour so that a repeat is a cache hit', () => {
    // 09:45 in Toronto is 14:45 UTC
    const now = Date.parse('2026-11-09T09:45:00-05:00');
    expect(sessionsWindow(now, 'sensor.power')).toEqual({
      start: new Date('2025-11-08T14:00:00Z'),
      period: 'hour',
      ids: ['sensor.power'],
      types: ['mean', 'max'],
    });
  });
});

describe('dayKeys', () => {
  test('the house day of now, of a day ago, the month and the hours so far', () => {
    expect(dayKeys(NOW, fmt)).toEqual({today: '2026-11-09', yesterday: '2026-11-08', month: '2026-11', hoursToday: 9});
  });

  test('just after midnight the hours so far are one, not none', () => {
    expect(dayKeys(at('2026-11-09T00:20:00-05:00'), fmt).hoursToday).toBe(1);
  });
});

describe('sum and rowsOf', () => {
  test('a missing value counts for nothing; an id the reply lacks has no rows', () => {
    expect(sum([1.5, null, undefined, 2])).toBe(3.5);
    expect(rowsOf({a: [row(0, {})]}, 'a')).toHaveLength(1);
    expect(rowsOf({a: [row(0, {})]}, 'b')).toEqual([]);
    expect(rowsOf({a: [row(0, {})]}, null)).toEqual([]);
  });
});

describe('hourlyFlow', () => {
  const T0 = at('2026-11-09T08:00:00-05:00');
  const ids = {grid: 'g', waterHeater: 'w', ev: 'e', rooms: ['a', 'b', null]};

  test('splits each hour of the grid, and an hour with a missing room counts that room for nothing', () => {
    const stats = {
      g: [
        row(T0, {mean: 5}),
        row(T0 + HOUR, {mean: 4}),
        row(T0 + 2 * HOUR, {mean: null}),
        row(T0 + 3 * HOUR, {mean: 1}),
      ],
      w: [row(T0, {mean: 1.5}), row(T0 + HOUR, {mean: 0.25})],
      e: [row(T0, {mean: 1})],
      a: [row(T0, {mean: 0.5}), row(T0 + HOUR, {mean: 0.125})],
      b: [row(T0, {mean: 0.25})], // no row at T0 + 1 h
    };
    expect(hourlyFlow(stats, ids)).toEqual([
      [T0, 1, 1.5, 0.75, 1.75, 5],
      [T0 + HOUR, 0, 0.25, 0.125, 3.625, 4],
      // the grid's 1 kW is less than the loads below it: the rest never goes under zero (no row for the others: nothing to take off)
      [T0 + 3 * HOUR, 0, 0, 0, 1, 1],
    ]);
  });

  test('the rest is never negative, and a figure keeps three decimals', () => {
    const stats = {g: [row(T0, {mean: 1})], w: [row(T0, {mean: 2})], e: [row(T0, {mean: 0.12345})]};
    expect(hourlyFlow(stats, ids)).toEqual([[T0, 0.123, 2, 0, 0, 1]]);
  });

  test('a house with no grid sensor has no flow', () => {
    expect(hourlyFlow({g: [row(T0, {mean: 1})]}, {...ids, grid: null})).toEqual([]);
  });
});

describe('dailyChanges', () => {
  test('a row is the local day of its noon, whatever the zone its midnight was in', () => {
    // the clocks went back on 2026-11-01: that day starts at 00:00 EDT, the next at 00:00 EST
    const stats = {m: [dayRow('2026-10-31', 1), dayRow('2026-11-01', null), dayRow('2026-11-02', 3)]};
    expect(dailyChanges(stats, 'm', isoDay)).toEqual([
      ['2026-10-31', 1],
      ['2026-11-01', 0],
      ['2026-11-02', 3],
    ]);
  });
});

describe('meterTotals', () => {
  const keys = {yesterday: '2026-11-08', month: '2026-11'};

  test('today from the hours, yesterday by its key, the month by its prefix, 30 days from the last 30 rows', () => {
    const meter = {
      m: [
        dayRow('2026-10-30', 10),
        dayRow('2026-10-31', 20),
        dayRow('2026-11-07', 3),
        dayRow('2026-11-08', 4),
        dayRow('2026-11-09', 5), // today's day row counts in the month and the 30 days, as the legacy panel summed it
      ],
    };
    const todayStats = {m: [row(0, {change: 0.5}), row(HOUR, {change: null}), row(2 * HOUR, {change: 1.25})]};
    expect(meterTotals(meter, todayStats, {energy: 'm'}, keys, isoDay)).toEqual({
      today: 1.75,
      yesterday: 4,
      d30: 42,
      month: 12,
    });
  });

  test('only the last thirty days count, and no row for yesterday reads null', () => {
    const rows = Array.from({length: 31}, (_, i) =>
      dayRow(`2026-10-${String(i + 1).padStart(2, '0')}`, i === 0 ? 100 : 1),
    );
    expect(meterTotals({m: rows}, {}, {energy: 'm'}, keys, isoDay)).toEqual({
      today: 0,
      yesterday: null,
      d30: 30,
      month: 0,
    });
  });
});

describe('waterDay', () => {
  test('the temperature and the power, the five-minute rows with no mean left out', () => {
    const stats = {
      t: [row(0, {mean: 48.5}), row(3e5, {mean: null}), row(6e5, {mean: 49})],
      p: [row(0, {mean: 0}), row(3e5, {mean: 4.4})],
    };
    expect(waterDay(stats, {temperature: 't', power: 'p'})).toEqual({
      t: [
        [0, 48.5],
        [6e5, 49],
      ],
      p: [
        [0, 0],
        [3e5, 4.4],
      ],
    });
    expect(waterDay({}, {temperature: null, power: 'p'})).toEqual({t: [], p: []});
  });
});
