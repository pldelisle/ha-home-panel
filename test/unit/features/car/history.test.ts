// The Car's history at the pure-function seam (ADR 0005): literal rows in, the two windows, the daily EV energy, the sessions by month and the chart's options out.
// The day keys are the house's local days read from the noon of a daily row; the zone is Toronto, five hours behind UTC in November.
import {describe, expect, test} from 'vitest';
import {DEFAULT_ENTITIES} from '../../../../src/core/entities.ts';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {
  carWindows,
  dailyEv,
  deriveCarHistory,
  monthlySessions,
  sessionsChartOptions,
  type MonthlySessions,
} from '../../../../src/features/car/history.ts';
import {fakeHass} from '../../fake-hass.ts';

const formats = (language: 'en' | 'fr') =>
  createFormatters(panelLocale(fakeHass({locale: {language}}), {timeZone: 'America/Toronto', browserLocale: language}));
const fmt = formats('en');
const isoDay = (instant: number) => fmt.isoDay(instant);
const DAY = 864e5;
const HOUR = 36e5;
const at = (iso: string) => Date.parse(iso);
const dayRow = (iso: string, fields: Partial<StatisticRow>): StatisticRow => {
  const start = at(`${iso}T00:00:00-05:00`);
  return {start, end: start + DAY, ...fields};
};
const hourRow = (iso: string, mean: number, max = mean): StatisticRow => {
  const start = at(iso);
  return {start, end: start + HOUR, mean, max};
};
const NOW = at('2026-11-09T09:45:30-05:00');
const config = {entities: {...DEFAULT_ENTITIES, grid: 'sensor.grid', evP: 'sensor.ev'}};

describe('carWindows', () => {
  test('the charger’s hourly mean and max for 366 days, and the grid’s and the charger’s daily mean for 30, from the top of the hour', () => {
    // 09:45 in Toronto is 14:45 UTC: both windows start on the hour, so a repeat within it is answered by the cache
    expect(carWindows(NOW, config)).toEqual({
      hours: {start: new Date('2025-11-08T14:00:00Z'), period: 'hour', ids: ['sensor.ev'], types: ['mean', 'max']},
      days: {
        start: new Date('2026-10-10T14:00:00Z'),
        period: 'day',
        ids: ['sensor.grid', 'sensor.ev'],
        types: ['mean'],
      },
    });
  });
});

describe('dailyEv', () => {
  const ids = {grid: 'sensor.grid', ev: 'sensor.ev'};
  const keys = {today: '2026-11-09', hoursToday: 9};

  test('the charger’s mean kW times 24 hours a day and the hours so far for today, on the days the grid has a mean for', () => {
    const days = {
      'sensor.grid': [
        dayRow('2026-11-06', {mean: null}),
        dayRow('2026-11-07', {mean: 1}),
        dayRow('2026-11-08', {mean: 2}),
        dayRow('2026-11-09', {mean: 3}),
      ],
      'sensor.ev': [
        dayRow('2026-11-06', {mean: 9}),
        dayRow('2026-11-07', {mean: 0.5}),
        dayRow('2026-11-09', {mean: 2}),
      ],
    };
    expect(dailyEv(days, ids, keys, isoDay)).toEqual([
      {day: '2026-11-07', ev: 12},
      {day: '2026-11-08', ev: 0}, // the charger has no row for the day: nothing was delivered
      {day: '2026-11-09', ev: 18},
    ]);
  });

  test('no charger, or no grid, is no day and no error', () => {
    const grid = {'sensor.grid': [dayRow('2026-11-08', {mean: 2})]};
    expect(dailyEv(grid, {grid: 'sensor.grid', ev: null}, keys, isoDay)).toEqual([{day: '2026-11-08', ev: 0}]);
    expect(dailyEv({}, {grid: null, ev: null}, keys, isoDay)).toEqual([]);
  });
});

describe('deriveCarHistory', () => {
  const hours = {
    'sensor.ev': [
      hourRow('2026-11-06T17:00:00-05:00', 7, 7.4),
      hourRow('2026-11-06T18:00:00-05:00', 7, 7.2),
      hourRow('2026-11-07T12:00:00-05:00', 0.1),
    ],
  };
  const days = {
    'sensor.grid': Array.from({length: 40}, (_, index) => ({
      ...dayRow('2026-10-01', {mean: 1}),
      start: at('2026-10-01T00:00:00-04:00') + index * DAY,
    })),
  };

  test('the sessions of the year and the last 30 days of energy, derived at `now`', () => {
    const data = deriveCarHistory({hours, days}, config, NOW, fmt);
    expect(data.at).toBe(NOW);
    expect(data.sessions).toEqual([
      {start: at('2026-11-06T17:00:00-05:00'), end: at('2026-11-06T19:00:00-05:00'), kwh: 14, peak: 7.4},
    ]);
    expect(data.daily).toHaveLength(30);
    expect(data.daily.at(-1)?.day).toBe('2026-11-09');
  });
});

describe('monthlySessions', () => {
  const session = (iso: string, kwh: number) => ({start: at(iso), end: at(iso) + 2 * HOUR, kwh, peak: 7});

  test('the sessions grouped by the local month they began in, oldest first, with the kWh and the count', () => {
    const months = monthlySessions(
      [
        session('2026-11-02T20:00:00-05:00', 10),
        session('2026-09-30T22:00:00-04:00', 4),
        session('2026-11-08T08:00:00-05:00', 6.5),
        // 23:30 local on the last of October is November in UTC: the month is the house's
        session('2026-10-31T23:30:00-04:00', 3),
      ],
      fmt,
    );
    expect(months).toEqual([
      {month: '2026-09', kwh: 4, count: 1},
      {month: '2026-10', kwh: 3, count: 1},
      {month: '2026-11', kwh: 16.5, count: 2},
    ]);
  });

  test('no sessions, no months', () => {
    expect(monthlySessions([], fmt)).toEqual([]);
  });
});

describe('sessionsChartOptions', () => {
  const months: MonthlySessions[] = [
    {month: '2026-10', kwh: 33.333, count: 3},
    {month: '2026-11', kwh: 12.5, count: 1},
  ];

  type Options = ReturnType<typeof sessionsChartOptions> & {
    yaxis: {labels: {formatter: (value: number) => string}};
    tooltip: {y: {formatter: (value: number, point: {dataPointIndex: number}) => string}};
  };
  const options = (language: 'en' | 'fr') =>
    sessionsChartOptions(months, {
      fmt: formats(language),
      t: createMessages({language, tag: language === 'fr' ? 'fr-CA' : 'en-CA'}).t,
      color: 'rgb(1, 2, 3)',
    }) as Options;

  test('a bar chart of the kWh charged each month, in the charger’s colour, with the months’ short names under it', () => {
    expect(options('en')).toMatchObject({
      chart: {type: 'bar', height: 220},
      series: [{name: 'Charged at home', data: [33.3, 12.5]}],
      colors: ['rgb(1, 2, 3)'],
      plotOptions: {bar: {borderRadius: 5, borderRadiusApplication: 'end', columnWidth: '56%'}},
      xaxis: {categories: ['Oct', 'Nov']},
    });
  });

  test('the axis says whole kWh and the tooltip "12 kWh in 1 session" or "33 kWh in 3 sessions"', () => {
    const {yaxis, tooltip} = options('en');
    expect(yaxis.labels.formatter(12.5)).toBe('13 kWh');
    expect(tooltip.y.formatter(33.3, {dataPointIndex: 0})).toBe('33 kWh in 3 sessions');
    expect(tooltip.y.formatter(12.5, {dataPointIndex: 1})).toBe('13 kWh in 1 session');
  });

  test('in French the months keep the capital the layer gave them, and the tooltip is French', () => {
    const {xaxis, tooltip, series} = options('fr') as unknown as {
      xaxis: {categories: string[]};
      tooltip: Options['tooltip'];
      series: {name: string}[];
    };
    expect(xaxis.categories).toEqual(['Oct.', 'Nov.']);
    expect(series[0].name).toBe('Rechargée à la maison');
    expect(tooltip.y.formatter(33.3, {dataPointIndex: 0})).toBe('33 kWh en 3 sessions');
  });
});
