// The Ask answer's chart as plain data: a series' points as a line over a soft fill, on a time axis in the house's formats.
// Pattern: functional core (Bernhardt, Boundaries) behind <hp-chart> (ADR 0027): the options are data, never an ApexCharts instance; every figure is
// written by `figure` (the sheet's own) and every date by the house's formatters, and the colour is a token the element resolved.
// Must not: import Lit, the DOM or the library, read the clock or a token itself, or write a word a person reads (the series' name is given).
import {DAY_MS} from '../../core/figures.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import {hourRowsAxis, tooltipDate, type ChartOptions} from '../../ui/chart-options.ts';
import type {SeriesAnswer} from './evaluate.ts';
import {figure} from './model.ts';

/** What the options are made with: the house's formats, the sensor's display name and unit, and the line's colour. */
export interface SeriesChartDeps {
  fmt: Formatters;
  name: string;
  unit: string;
  color: string;
}

/** The chart's height in pixels, which `<hp-chart>` takes as its own property. */
export const ASK_CHART_HEIGHT = 220;

/** The options of a series, without the theme: the means on a time axis whose ticks fall on round hours (or midnights over a day), tooltips in the house's formats. */
export function seriesChartOptions(
  {points}: Pick<SeriesAnswer, 'points'>,
  {fmt, name, unit, color}: SeriesChartDeps,
): ChartOptions {
  const axis = hourRowsAxis(points[0].at, points[points.length - 1].at, fmt);
  // a bucket a day long has no clock to say: its tooltip names the day alone
  const daily = points.length > 1 && points[1].at - points[0].at >= DAY_MS;
  const written = (value: number): string => figure(fmt, value, unit);
  return {
    chart: {type: 'area'},
    series: [{name, data: points.map(({at, value}) => [at, +value.toFixed(2)])}],
    colors: [color],
    stroke: {width: 2.5, curve: 'smooth'},
    fill: {type: 'gradient', gradient: {opacityFrom: 0.3, opacityTo: 0.02, shadeIntensity: 1}},
    xaxis: {type: 'datetime', ...axis, labels: {datetimeUTC: false}},
    yaxis: {labels: {formatter: written}},
    tooltip: {
      x: {formatter: tooltipDate({day: 'date', clock: daily ? null : 'time'}, fmt)},
      y: {formatter: written},
    },
  };
}
