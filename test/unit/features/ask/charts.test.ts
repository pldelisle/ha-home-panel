// seriesChartOptions and totalChartOptions: the options of an answer's chart as data: the points, an axis that ends on round hours, and tooltips in the house's formats.
import {describe, expect, test} from 'vitest';
import {seriesChartOptions, totalChartOptions} from '../../../../src/features/ask/charts.ts';
import type {TotalAnswer} from '../../../../src/features/ask/evaluate.ts';
import {depsOf, fullHouse, NOW} from '../media/support.ts';

const HOUR = 36e5;
const hourly = (n: number) => Array.from({length: n}, (_, i) => ({at: NOW + i * HOUR, value: 19 + i / 3}));

type Options = ReturnType<typeof seriesChartOptions> & {
  series: {name: string; data: [number, number][]}[];
  xaxis: {type: string; min?: number; max?: number};
  yaxis: {labels: {formatter: (value: number) => string}};
  tooltip: {x: {formatter: (at: number) => string}; y: {formatter: (value: number) => string}};
};
const options = (points: {at: number; value: number}[], unit = '°'): Options => {
  const {fmt} = depsOf(fullHouse, 'en');
  return seriesChartOptions({points}, {fmt, name: 'Office', unit, color: 'rgb(1, 2, 3)'}) as Options;
};

describe('seriesChartOptions', () => {
  test('draws the means as one named series of time and value, in the colour it was given', () => {
    const chart = options(hourly(3));
    expect(chart.series).toEqual([
      {
        name: 'Office',
        data: [
          [NOW, 19],
          [NOW + HOUR, 19.33],
          [NOW + 2 * HOUR, 19.67],
        ],
      },
    ]);
    expect(chart.colors).toEqual(['rgb(1, 2, 3)']);
    expect(chart.xaxis.type).toBe('datetime');
  });

  test('writes the axis and the tooltip figures with the sensor unit, the degree sign against the figure', () => {
    const chart = options(hourly(3));
    expect(chart.yaxis.labels.formatter(19.34)).toBe('19.3°');
    expect(chart.tooltip.y.formatter(19.34)).toBe('19.3°');
    expect(options(hourly(3), 'W').yaxis.labels.formatter(900)).toBe('900 W');
  });

  test('ends the axis on a round step over a span of hours', () => {
    const {min, max} = options(hourly(13)).xaxis;
    expect(max! - min!).toBe(12 * HOUR);
  });

  test("a single point has no span to cut: the axis is the library's", () => {
    expect(options(hourly(1)).xaxis.min).toBeUndefined();
  });

  test('a tooltip names the day and the clock, and the day alone for buckets a day long', () => {
    const hours = options(hourly(3)).tooltip.x.formatter(NOW);
    const days = options([
      {at: NOW, value: 1},
      {at: NOW + 24 * HOUR, value: 2},
    ]).tooltip.x.formatter(NOW);
    expect(hours).toMatch(/\d:\d\d/);
    expect(days).not.toMatch(/\d:\d\d/);
    expect(days.length).toBeGreaterThan(0);
  });
});

describe('totalChartOptions', () => {
  const DAY = 24 * HOUR;
  // Saturday 7 November 2026, 14:00 in Toronto: the days below start at local midnight (5:00 UTC)
  const MIDNIGHT = Date.UTC(2026, 10, 7, 5);
  const answer = (bucket: 'day' | 'hour', starts: number[], partialLast = false): TotalAnswer => ({
    kind: 'total',
    total: 0,
    unit: 'kWh',
    bucket,
    bars: starts.map((at, i) => ({at, value: 10 + i / 3, partial: partialLast && i === starts.length - 1})),
    coverage: 1,
    from: starts[0],
  });
  type Chart = {
    chart: {type: string};
    series: {name: string; data: unknown[]}[];
    colors: string[];
    xaxis: {
      type?: string;
      categories?: string[];
      min?: number;
      max?: number;
      labels: {formatter?: (label: string) => string};
    };
    yaxis: {min: number; labels: {formatter: (value: number) => string}};
    tooltip: {
      x?: {formatter: (value: number | string) => string};
      y: {formatter: (value: number) => string};
    };
  };
  const options = (total: TotalAnswer, compact = false): Chart => {
    const {fmt} = depsOf(fullHouse, 'en');
    return totalChartOptions(total, {
      fmt,
      name: 'House energy',
      color: 'rgb(1, 2, 3)',
      today: 'Today',
      compact,
    }) as Chart;
  };
  const days = (n: number, first = MIDNIGHT - (n - 1) * DAY) => Array.from({length: n}, (_, i) => first + i * DAY);

  test('draws one named bar series, in the colour given, with the unit after every figure', () => {
    const chart = options(answer('day', days(3)));
    expect(chart.chart.type).toBe('bar');
    expect(chart.series).toEqual([{name: 'House energy', data: [10, 10.33, 10.67]}]);
    expect(chart.colors).toEqual(['rgb(1, 2, 3)']);
    expect(chart.yaxis.min).toBe(0);
    expect(chart.yaxis.labels.formatter(42.34)).toBe('42.3 kWh');
    expect(chart.tooltip.y.formatter(0)).toBe('0 kWh');
  });

  test('a week of days is a bar for each, under its short weekday, and the partial last day is called today', () => {
    const chart = options(answer('day', days(7), true));
    expect(chart.xaxis.categories).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Today']);
    expect(chart.tooltip.x?.formatter('Mon')).toBe('Mon');
  });

  test('a month of days is under its date, thinned on a phone and still named in full by the tooltip', () => {
    const chart = options(answer('day', days(30)), true);
    const labels = chart.xaxis.categories as string[];
    expect(labels).toHaveLength(30);
    expect(labels[0]).toMatch(/^Oct 9$/);
    const shown = labels.filter(label => chart.xaxis.labels.formatter?.(label));
    expect(shown.length).toBeLessThan(labels.length / 2);
  });

  test('the hours of a day are on a time axis that ends on round hours, with the clock in the tooltip', () => {
    const chart = options(
      answer(
        'hour',
        Array.from({length: 13}, (_, i) => MIDNIGHT + i * HOUR),
      ),
    );
    expect(chart.xaxis.type).toBe('datetime');
    expect(chart.xaxis.max! - chart.xaxis.min!).toBe(12 * HOUR);
    expect(chart.series[0].data[1]).toEqual([MIDNIGHT + HOUR, 10.33]);
    expect(chart.tooltip.x?.formatter(MIDNIGHT + 9 * HOUR)).toMatch(/^9 (am|a\.m\.)$|^9 am$/);
  });

  test('a single hour has no span to cut: the axis is the library’s', () => {
    expect(options(answer('hour', [MIDNIGHT])).xaxis.min).toBeUndefined();
  });
});
