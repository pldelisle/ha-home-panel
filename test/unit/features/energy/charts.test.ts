// The Energy detail's chart options at the pure-function seam: the rows each range draws, the stacked bars' shape per range, the donut, and the two
// helpers that make a day or a month key an instant. The numbers and words are what the legacy `energyMain` and `energySheet` wrote (deleted in #240).
import {describe, expect, test} from 'vitest';
import {noonOf} from '../../../../src/core/i18n/format.ts';
import {
  donutOptions,
  ENERGY_RANGES,
  isEnergyRange,
  mainChartOptions,
  mainRows,
  mainShape,
  middleOf,
  type ChartDeps,
  type EnergyTokens,
  type MainRows,
} from '../../../../src/features/energy/charts.ts';
import type {DailyRow, EnergyHistoryData} from '../../../../src/features/energy/history.ts';
import type {FlowRow} from '../../../../src/providers/power-history.ts';
import {depsOf, fullHouse, NOW, type Language} from '../media/support.ts';

const tokens: EnergyTokens = {
  heat: 'red',
  wh: 'blue',
  ev: 'green',
  rest: 'grey',
  card: 'white',
  fg: 'black',
  fg2: 'dim',
  numberFont: 'Num',
};
const deps = (language: Language = 'en', compact = false): ChartDeps => {
  const {t, fmt} = depsOf(fullHouse, language);
  return {t, fmt, tokens, compact};
};
const NAMES = ['Room heating', 'Water heating', 'EV charging', 'Rest of home'];

/** The value at a dotted path of an options object. */
const at = (options: object, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], options);
const call = (options: object, path: string, ...args: unknown[]): unknown =>
  (at(options, path) as (...args: unknown[]) => unknown)(...args);

// `[t, ev, wh, heat, rest, total]`: a quiet hour of today, a busy one, and an hour of yesterday
const FLOW: FlowRow[] = [
  [NOW - 3 * 36e5, 0, 0.5, 1, 0.5, 2],
  [NOW - 2 * 36e5, 7, 0.5, 2, 0.5, 10],
  [NOW - 30 * 36e5, 1, 1, 1, 1, 4],
];
const day = (key: string, over: Partial<DailyRow> = {}): DailyRow => ({
  day: key,
  heat: 10.04,
  wh: 4.5,
  ev: 0,
  rest: 6,
  total: 20.5,
  rooms: [],
  ...over,
});
const history = (over: Partial<EnergyHistoryData> = {}): EnergyHistoryData => ({
  at: NOW,
  flow: FLOW,
  daily: Array.from({length: 40}, (_, index) => day(`2026-10-${String(index + 1).padStart(2, '0')}`)),
  g30: [],
  room30: [],
  monthly: [
    ['2026-01', {heat: 450.04, wh: 90, ev: 0, rest: 100}],
    ['2026-02', {heat: 40, wh: 80, ev: 12.34, rest: 100}],
  ],
  totals: {today: 0, yesterday: null, d30: 0, month: 0},
  wh24: {t: [], p: []},
  wh14: [],
  ...over,
});

describe('mainRows', () => {
  const {fmt} = depsOf(fullHouse, 'en');
  const rows = (range: (typeof ENERGY_RANGES)[number]) => mainRows(range, history(), {fmt, now: NOW});

  test('today is the hours of the local day, the week all the hours', () => {
    expect(rows('today')).toEqual({range: 'today', rows: FLOW.slice(0, 2)});
    expect(rows('week')).toEqual({range: 'week', rows: FLOW});
  });

  test('the month is the last 30 days, and the year the months the history reaches', () => {
    const month = rows('month');
    expect(month.rows).toHaveLength(30);
    expect((month.rows as DailyRow[])[0].day).toBe('2026-10-11');
    expect(rows('year')).toEqual({range: 'year', rows: history().monthly});
  });
});

describe('the ranges', () => {
  test('are today, week, month and year, and a tab of the kit’s other ranges is not one', () => {
    expect([...ENERGY_RANGES]).toEqual(['today', 'week', 'month', 'year']);
    expect(ENERGY_RANGES.every(isEnergyRange)).toBe(true);
    expect(isEnergyRange('day')).toBe(false);
  });

  test('today and the week stand on a time axis, the month and the year on categories: the shape <hp-chart> draws a new chart for', () => {
    expect(ENERGY_RANGES.map(mainShape)).toEqual(['time', 'time', 'category', 'category']);
  });
});

describe('noonOf and middleOf', () => {
  const utcDay = (instant: number) => new Date(instant).toISOString().slice(0, 10);

  test('a day key is its UTC noon where the zone keeps that noon on the day, and a month key its 15th', () => {
    expect(noonOf('2026-11-07', {isoDay: utcDay})).toBe(Date.UTC(2026, 10, 7, 12));
    expect(middleOf('2026-11')).toBe(Date.UTC(2026, 10, 15, 12));
  });

  test('in a zone far east or far west of UTC it is the neighbouring noon whose local day it is', () => {
    const east = (instant: number) => utcDay(instant + 14 * 36e5); // UTC+14: UTC noon is already the next day
    const west = (instant: number) => utcDay(instant - 13 * 36e5); // UTC-13: UTC noon is still the day before
    expect(east(noonOf('2026-11-07', {isoDay: east}))).toBe('2026-11-07');
    expect(west(noonOf('2026-11-07', {isoDay: west}))).toBe('2026-11-07');
  });
});

describe('the main chart, today and the week', () => {
  const rows = (range: 'today' | 'week'): MainRows => ({range, rows: FLOW.slice(0, 2)});

  test('stacked bars by use in the order heating, water, car, rest, each hour as [time, kWh]', () => {
    const options = mainChartOptions(rows('today'), NAMES, deps());
    expect(at(options, 'chart')).toEqual({type: 'bar', stacked: true});
    expect(at(options, 'colors')).toEqual(['red', 'blue', 'green', 'grey']);
    expect(at(options, 'series')).toEqual([
      {
        name: 'Room heating',
        data: [
          [FLOW[0][0], 1],
          [FLOW[1][0], 2],
        ],
      },
      {
        name: 'Water heating',
        data: [
          [FLOW[0][0], 0.5],
          [FLOW[1][0], 0.5],
        ],
      },
      {
        name: 'EV charging',
        data: [
          [FLOW[0][0], 0],
          [FLOW[1][0], 7],
        ],
      },
      {
        name: 'Rest of home',
        data: [
          [FLOW[0][0], 0.5],
          [FLOW[1][0], 0.5],
        ],
      },
    ]);
  });

  test('on a time axis in local time, bars 70 percent wide for today and 90 for the week, no stroke', () => {
    const today = mainChartOptions(rows('today'), NAMES, deps());
    const week = mainChartOptions(rows('week'), NAMES, deps());
    expect(at(today, 'xaxis')).toEqual({type: 'datetime', labels: {datetimeUTC: false}});
    expect(at(today, 'plotOptions.bar')).toEqual({
      borderRadius: 3,
      borderRadiusApplication: 'end',
      borderRadiusWhenStacked: 'last',
      columnWidth: '70%',
    });
    expect(at(week, 'plotOptions.bar.columnWidth')).toBe('90%');
    expect(at(today, 'stroke')).toEqual({show: false});
    expect(at(today, 'fill')).toEqual({opacity: 1});
  });

  test('the axis counts whole kWh from zero and the tooltip reads the hour and two decimals', () => {
    const today = mainChartOptions(rows('today'), NAMES, deps());
    const week = mainChartOptions(rows('week'), NAMES, deps());
    expect(at(today, 'yaxis')).toMatchObject({min: 0, tickAmount: 4, forceNiceScale: true});
    expect(call(today, 'yaxis.labels.formatter', 12.4)).toBe('12 kWh');
    expect(at(today, 'tooltip')).toMatchObject({shared: true, intersect: false});
    expect(at(today, 'tooltip.x.format')).toBe('HH:mm');
    expect(at(week, 'tooltip.x.format')).toBe('ddd MMM d, HH:mm');
    expect(call(today, 'tooltip.y.formatter', 1.256)).toBe('1.26 kWh');
  });

  test('in French the figures are French’s own', () => {
    const options = mainChartOptions(rows('today'), NAMES, deps('fr'));
    expect(call(options, 'tooltip.y.formatter', 1.256)).toBe('1,26 kWh');
  });
});

describe('the main chart, the month', () => {
  const days = Array.from({length: 30}, (_, index) => day(`2026-10-${String(index + 1).padStart(2, '0')}`));
  const rows: MainRows = {range: 'month', rows: days};

  test('bars by day to a tenth, with the card’s colour as the gap between them', () => {
    const options = mainChartOptions(rows, NAMES, deps());
    expect(at(options, 'series')).toHaveLength(4);
    expect((at(options, 'series') as {data: number[]}[])[0].data[0]).toBe(10);
    expect((at(options, 'series') as {data: number[]}[])[1].data[0]).toBe(4.5);
    expect(at(options, 'plotOptions.bar')).toMatchObject({borderRadius: 4, columnWidth: '64%'});
    expect(at(options, 'stroke')).toEqual({show: true, width: 2, colors: ['white']});
    expect(call(options, 'yaxis.labels.formatter', 18.6)).toBe('19 kWh');
    expect(call(options, 'tooltip.y.formatter', 18.64)).toBe('18.6 kWh');
    expect(at(options, 'tooltip.shared')).toBe(true);
  });

  test('the axis names the days, every one on a tablet and about five on a phone, and the tooltip every bar', () => {
    const wide = mainChartOptions(rows, NAMES, deps());
    const categories = at(wide, 'xaxis.categories') as string[];
    expect(categories.slice(0, 3)).toEqual(['Oct 1', 'Oct 2', 'Oct 3']);
    expect(categories.every(label => call(wide, 'xaxis.labels.formatter', label) === label)).toBe(true);
    const phone = mainChartOptions(rows, NAMES, deps('en', true));
    expect(at(phone, 'stroke.width')).toBe(1);
    const kept = categories.filter(label => call(phone, 'xaxis.labels.formatter', label) !== '');
    expect(kept).toEqual(['Oct 1', 'Oct 7', 'Oct 13', 'Oct 19', 'Oct 25']);
    expect(call(phone, 'tooltip.x.formatter', 'Oct 2')).toBe('Oct 2');
  });
});

describe('the main chart, the year', () => {
  const rows: MainRows = {range: 'year', rows: history().monthly};

  test('bars by month in MWh on the axis and whole kWh in the tooltip', () => {
    const options = mainChartOptions(rows, NAMES, deps());
    expect((at(options, 'series') as {data: number[]}[])[0].data).toEqual([450, 40]);
    expect((at(options, 'series') as {data: number[]}[])[2].data).toEqual([0, 12.3]);
    expect(at(options, 'plotOptions.bar')).toMatchObject({borderRadius: 6, columnWidth: '58%'});
    expect(at(options, 'stroke')).toEqual({show: true, width: 2, colors: ['white']});
    expect(call(options, 'yaxis.labels.formatter', 1250)).toBe('1.3 MWh');
    expect(call(options, 'tooltip.y.formatter', 450.4)).toBe('450 kWh');
  });

  test('the months read as the short name and the year, in the panel’s language', () => {
    expect(at(mainChartOptions(rows, NAMES, deps()), 'xaxis.categories')).toEqual(['Jan 26', 'Feb 26']);
    expect(at(mainChartOptions(rows, NAMES, deps('fr')), 'xaxis.categories')).toEqual(['janv. 26', 'févr. 26']);
  });
});

describe('the donut', () => {
  const parts = [
    {name: 'Room heating', kwh: 120.44, color: 'red'},
    {name: 'Water heating', kwh: 55.5, color: 'blue'},
    {name: 'EV charging', kwh: 0, color: 'green'},
    {name: 'Rest of home', kwh: 300, color: 'grey'},
  ];

  test('is a ring at 70 percent of the four uses, in their colours and with the card’s colour between the slices', () => {
    const options = donutOptions(parts, deps());
    expect(at(options, 'chart')).toEqual({type: 'donut', height: 190});
    expect(at(options, 'series')).toEqual([120.4, 55.5, 0, 300]);
    expect(at(options, 'labels')).toEqual(NAMES);
    expect(at(options, 'colors')).toEqual(['red', 'blue', 'green', 'grey']);
    expect(at(options, 'stroke')).toEqual({width: 3, colors: ['white']});
    expect(at(options, 'plotOptions.pie.donut.size')).toBe('70%');
  });

  test('writes a slice in whole kWh in its middle, the total of the 30 days under its label, and a tenth in the tooltip', () => {
    const options = donutOptions(parts, deps());
    const labels = 'plotOptions.pie.donut.labels';
    expect(at(options, `${labels}.value`)).toMatchObject({fontFamily: 'Num', color: 'black'});
    expect(at(options, `${labels}.total`)).toMatchObject({label: 'kWh, 30 days', color: 'dim'});
    expect(call(options, `${labels}.value.formatter`, 120.6)).toBe('121');
    expect(call(options, `${labels}.total.formatter`)).toBe('476');
    expect(call(options, 'tooltip.y.formatter', 55.55)).toBe('55.6 kWh');
  });

  test('in French the total’s label is French', () => {
    const options = donutOptions(parts, deps('fr'));
    expect(at(options, 'plotOptions.pie.donut.labels.total.label')).toBe('kWh, 30 jours');
    expect(call(options, 'tooltip.y.formatter', 55.55)).toBe('55,6 kWh');
  });
});
