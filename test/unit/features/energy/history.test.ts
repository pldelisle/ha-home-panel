// Energy's history at the pure-function seam (ADR 0005): literal rows in, the daily split, the totals, the months and the water heater's cycles out.
// The day keys are the house's local days read from the noon of a daily row, the rule of #132.
import {describe, expect, test} from 'vitest';
import {DEFAULT_ENTITIES} from '../../../../src/core/entities.ts';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {
  dailyTotals,
  energyWindows,
  groupTotals,
  monthlyTotals,
  roomTotals,
  waterCycles,
  waterDaily,
  type DailyRow,
} from '../../../../src/features/energy/history.ts';
import {fakeHass} from '../../fake-hass.ts';

const fmt = createFormatters(
  panelLocale(fakeHass({locale: {language: 'en'}}), {timeZone: 'America/Toronto', browserLocale: 'en'}),
);
const isoDay = (instant: number) => fmt.isoDay(instant);
const DAY = 864e5;
const at = (iso: string) => Date.parse(iso);
const dayRow = (iso: string, fields: Partial<StatisticRow>): StatisticRow => {
  const start = at(`${iso}T00:00:00-05:00`);
  return {start, end: start + DAY, ...fields};
};
const ids = {grid: 'g', waterHeater: 'w', ev: 'e', rooms: ['a', 'b']};

describe('energyWindows', () => {
  test('the shared windows and the 400 days of daily power, the same sensors as the hourly week', () => {
    const now = at('2026-11-09T09:45:30-05:00');
    const config = {
      entities: {...DEFAULT_ENTITIES, grid: 'sensor.grid', whP: 'sensor.wh', evP: 'sensor.ev'},
      rooms: [{power: 'sensor.a'}] as never,
    };
    const windows = energyWindows(now, config, fmt);
    expect(windows.day400).toEqual({
      start: new Date('2025-10-05T14:00:00.000Z'),
      period: 'day',
      ids: ['sensor.grid', 'sensor.wh', 'sensor.ev', 'sensor.a'],
      types: ['mean'],
    });
    expect(Object.keys(windows).sort()).toEqual(['day400', 'fiveMin25h', 'hour7', 'meter33', 'today']);
  });
});

describe('dailyTotals', () => {
  const stats = {
    g: [
      dayRow('2026-11-06', {mean: 2}), // a mean kW times 24 hours
      dayRow('2026-11-07', {mean: null}), // no grid mean: not a day
      dayRow('2026-11-08', {mean: 1}),
      dayRow('2026-11-09', {mean: 4}), // today
    ],
    w: [dayRow('2026-11-06', {mean: 0.5}), dayRow('2026-11-09', {mean: 0.5})],
    e: [dayRow('2026-11-06', {mean: 0.25})],
    a: [dayRow('2026-11-06', {mean: 0.125}), dayRow('2026-11-08', {mean: 0.5})],
    b: [dayRow('2026-11-06', {mean: 0.125})],
  };

  test('each day is its mean kW times 24 hours, split by use, the rest being what is left', () => {
    const rows = dailyTotals(stats, ids, {today: '2026-11-09', hoursToday: 9}, isoDay);
    expect(rows.slice(0, 2)).toEqual([
      {day: '2026-11-06', heat: 6, wh: 12, ev: 6, rest: 24, total: 48, rooms: [3, 3]},
      // no water heater or charger row on the 8th: they count for nothing
      {day: '2026-11-08', heat: 12, wh: 0, ev: 0, rest: 12, total: 24, rooms: [12, 0]},
    ]);
  });

  test('today counts only the hours so far, and its day key is the noon shift of its midnight', () => {
    const [today] = dailyTotals(stats, ids, {today: '2026-11-09', hoursToday: 9}, isoDay).slice(-1);
    expect(today).toEqual({day: '2026-11-09', heat: 0, wh: 4.5, ev: 0, rest: 31.5, total: 36, rooms: [0, 0]});
  });

  test('the rest never goes below zero', () => {
    const rows = dailyTotals(
      {g: [dayRow('2026-11-06', {mean: 1})], w: [dayRow('2026-11-06', {mean: 3})]},
      ids,
      {today: '2026-11-09', hoursToday: 9},
      isoDay,
    );
    expect(rows[0]).toMatchObject({wh: 72, total: 24, rest: 0});
  });
});

describe('groupTotals, roomTotals and monthlyTotals', () => {
  const row = (day: string, heat: number, wh: number, ev: number, rest: number, rooms: number[]): DailyRow => ({
    day,
    heat,
    wh,
    ev,
    rest,
    total: heat + wh + ev + rest,
    rooms,
  });
  /** 40 days of 1 kWh for each use, 0.5 for each of two rooms, from 2026-10-01: Oct 1 to Nov 9. */
  const daily = Array.from({length: 40}, (_, i) => {
    const date = new Date(Date.UTC(2026, 9, 1 + i));
    return row(date.toISOString().slice(0, 10), 1, 1, 1, 1, [0.5, 0.5]);
  });

  test('the last 30 days by use, and each room', () => {
    expect(groupTotals(daily)).toEqual([30, 30, 30, 30]);
    expect(groupTotals(daily, 2)).toEqual([2, 2, 2, 2]);
    expect(roomTotals(daily, 2)).toEqual([15, 15]);
    // a house with no days still has a figure for each room
    expect(roomTotals([], 3)).toEqual([0, 0, 0]);
  });

  test('the months come from the days, in order', () => {
    expect(monthlyTotals(daily)).toEqual([
      ['2026-10', {heat: 31, wh: 31, ev: 31, rest: 31}],
      ['2026-11', {heat: 9, wh: 9, ev: 9, rest: 9}],
    ]);
  });

  test('only the last twelve months are kept', () => {
    const years = Array.from({length: 14}, (_, i) =>
      row(`${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15`, 1, 0, 0, 0, []),
    );
    const months = monthlyTotals(years);
    expect(months).toHaveLength(12);
    expect(months[0][0]).toBe('2025-03');
    expect(months[11][0]).toBe('2026-02');
  });
});

describe('waterCycles', () => {
  const NOW = at('2026-11-09T12:00:00-05:00');
  const FIVE = 3e5;

  test('runs above 0.2 kW join across a gap of five minutes and no more; the kWh is the sum over twelve', () => {
    const t0 = NOW - 3 * 36e5;
    const power: [number, number][] = [
      [t0, 0],
      [t0 + FIVE, 4], // a cycle begins
      [t0 + 2 * FIVE, 4], // the same one
      [t0 + 4 * FIVE, 4], // ten minutes after the last: another
      [t0 + 5 * FIVE, 0.2], // 0.2 is not above 0.2
      [t0 + 6 * FIVE, 4], // the one before it is not running: another
    ];
    const {kwh24, cycles} = waterCycles(power, NOW);
    expect(kwh24).toBeCloseTo(16.2 / 12, 10);
    expect(cycles).toBe(3);
  });

  test('a point older than 24 hours is not counted', () => {
    expect(
      waterCycles(
        [
          [NOW - DAY - 1, 6],
          [NOW - DAY, 6],
        ],
        NOW,
      ),
    ).toEqual({kwh24: 0.5, cycles: 1});
    expect(waterCycles([], NOW)).toEqual({kwh24: 0, cycles: 0});
  });
});

describe('waterDaily', () => {
  test('the last 14 days before today, each as its day key and its change', () => {
    // 21 days from Oct 20 to Nov 9 (today), the change being the day's rank
    const rows = Array.from({length: 21}, (_, i) =>
      dayRow(new Date(Date.UTC(2026, 9, 20 + i)).toISOString().slice(0, 10), {change: i}),
    );
    const days = waterDaily({m: rows}, 'm', '2026-11-09', isoDay);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual(['2026-10-26', 6]);
    expect(days[13]).toEqual(['2026-11-08', 19]);
    expect(waterDaily({}, null, '2026-11-09', isoDay)).toEqual([]);
  });
});
