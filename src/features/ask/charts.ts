// The Ask answer's charts as plain data: a series' points as a line over a soft fill, a total's buckets as bars; on a time axis or thinned day labels, in the house's formats.
// Pattern: functional core (Bernhardt, Boundaries) behind <hp-chart> (ADR 0027): the options are data, never an ApexCharts instance; every figure is
// written by `figure` (the sheet's own) and every date by the house's formatters, and the colour is a token the element resolved.
// Must not: import Lit, the DOM or the library, read the clock or a token itself, or write a word a person reads (the series' name and the word "today" are given).
import {DAY_MS} from '../../core/figures.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import {hourRowsAxis, mergeOptions, tooltipDate, type ChartOptions} from '../../ui/chart-options.ts';
import {thinCategories} from '../../ui/thin-axis.ts';
import type {SeriesAnswer, TotalAnswer} from './evaluate.ts';
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

/** What the bars are made with: the house's formats, the meter's display name, the colour of the bars, the word for the day still going, and whether the screen is a phone's. */
export interface TotalChartDeps {
  fmt: Formatters;
  name: string;
  color: string;
  /** "Today": the label of the last bar of a period that includes it, which is the day so far. */
  today: string;
  compact: boolean;
}

/** A week of bars is labelled by its weekdays; more are labelled by their dates, and thinned. */
const WEEK_BARS = 8;

/** Labels written under a phone's bars and under a wide screen's, when a month of them is drawn. */
const MONTH_LABELS = {phone: 6, wide: 10};

/**
 * The options of a total's bars, without the theme: the buckets' changes, by the hour on a time axis for a day or less and by the day on a category axis beyond (the
 * weekday of each bar for a week, its date for more, a label every few on a phone), the partial bar called today, and the unit written by `figure` on the axis and in the tooltips.
 */
export function totalChartOptions(
  {bars, bucket, unit}: Pick<TotalAnswer, 'bars' | 'bucket' | 'unit'>,
  {fmt, name, color, today, compact}: TotalChartDeps,
): ChartOptions {
  const written = (value: number): string => figure(fmt, value, unit);
  const shared = {
    chart: {type: 'bar'},
    colors: [color],
    plotOptions: {bar: {borderRadius: 4, borderRadiusApplication: 'end', columnWidth: '64%'}},
    yaxis: {min: 0, labels: {formatter: written}},
  };
  const value = (bar: (typeof bars)[number]): number => +bar.value.toFixed(2);
  if (bucket === 'hour')
    return {
      ...shared,
      series: [{name, data: bars.map(bar => [bar.at, value(bar)])}],
      xaxis: {
        type: 'datetime',
        labels: {datetimeUTC: false, rotate: 0, hideOverlappingLabels: true},
        ...hourRowsAxis(bars[0].at, bars[bars.length - 1].at, fmt),
      },
      tooltip: {x: {formatter: tooltipDate({day: null, clock: 'hour'}, fmt)}, y: {formatter: written}},
    };
  const label = (bar: (typeof bars)[number]): string =>
    bar.partial ? today : bars.length > WEEK_BARS ? fmt.date(bar.at) : fmt.weekday(bar.at, 'short');
  return mergeOptions(
    {...shared, series: [{name, data: bars.map(value)}], tooltip: {y: {formatter: written}}},
    thinCategories(bars.map(label), MONTH_LABELS.phone, MONTH_LABELS.wide, compact),
  );
}
