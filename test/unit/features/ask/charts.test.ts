// seriesChartOptions: the options of an answer's chart as data: the points, an axis that ends on round hours, and tooltips in the house's formats.
import {describe, expect, test} from 'vitest';
import {seriesChartOptions} from '../../../../src/features/ask/charts.ts';
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
