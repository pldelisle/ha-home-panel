// The options every chart shares, as pure functions: the base of the panel's look, the deep merge a chart's own options go through, and French's axis.
// Pattern: functional core (Bernhardt, Boundaries) under a humble object: `<hp-chart>` reads the tokens, the theme and the media query and hands
// them in; the rules are the legacy class's own (base, merge) and the rewrite layer's (frApex), moved here so a shadow root need not be seen by it.
// Must not: read the DOM, the clock or a media query, name a chart's content, or hold a string the household reads (`noData` is given).
import type {Formatters} from '../core/i18n/format.ts';

/** The values a chart's base reads from the page's custom properties. */
export interface ChartTokens {
  /** `--f-body`, the face of every label. */
  font: string;
  /** `--fg2`, the colour of the axes' text. */
  text: string;
  /** `--line`, the grid and the axes' lines. */
  line: string;
}

export interface BaseDeps {
  tokens: ChartTokens;
  /** The dark tooltip theme. */
  dark: boolean;
  reducedMotion: boolean;
  /** The words of an empty chart, in the panel's language. */
  noData: string;
}

/** An ApexCharts options object: the library's own shape, which the panel does not retype. */
export type ChartOptions = Record<string, unknown>;

const isObject = (value: unknown): value is ChartOptions =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `base` with `options` laid over it: objects merge key by key, anything else (an array, a function, a number) replaces. Neither argument is changed. */
export function mergeOptions(base: ChartOptions, options: ChartOptions): ChartOptions {
  const merged: ChartOptions = {...base};
  for (const [key, value] of Object.entries(options))
    merged[key] = isObject(value) && isObject(merged[key]) ? mergeOptions(merged[key], value) : value;
  return merged;
}

/** The look every chart starts from: the panel's face and colours, no toolbar, no zoom, no legend, and a tooltip that follows the theme. */
export function baseOptions(height: number, {tokens, dark, reducedMotion, noData}: BaseDeps): ChartOptions {
  return {
    chart: {
      height,
      toolbar: {show: false},
      zoom: {enabled: false},
      fontFamily: tokens.font,
      foreColor: tokens.text,
      background: 'transparent',
      animations: {enabled: !reducedMotion},
    },
    grid: {borderColor: tokens.line, padding: {left: 6, right: 8}},
    legend: {show: false},
    dataLabels: {enabled: false},
    tooltip: {theme: dark ? 'dark' : 'light'},
    xaxis: {axisBorder: {color: tokens.line}, axisTicks: {color: tokens.line}},
    noData: {text: noData},
  };
}

/** The months and days the library writes on a date axis, in the order it wants them (January and Sunday first), from the panel's formats. */
export function axisLocale(fmt: Formatters) {
  // mid-month, at noon, so no time zone changes the month; 2021-01-03 was a Sunday
  const month = (index: number) => Date.UTC(2021, index, 15, 12);
  const day = (index: number) => Date.UTC(2021, 0, 3 + index, 12);
  const names = (count: number, at: (index: number) => number, name: (ms: number) => string) =>
    Array.from({length: count}, (_, index) => name(at(index)));
  return {
    name: 'fr',
    options: {
      months: names(12, month, ms => fmt.month(ms, 'long')),
      shortMonths: names(12, month, ms => fmt.month(ms, 'short')),
      days: names(7, day, ms => fmt.weekday(ms, 'long')),
      shortDays: names(7, day, ms => fmt.weekday(ms, 'short')),
      toolbar: {},
    },
  };
}

/**
 * French's date axis: the library draws its own tick labels on a time axis, so it is given the language's month and day names and the
 * day-first, 24-hour formats the household reads. A chart with no time axis is as it came.
 */
export function frenchAxis(options: ChartOptions, fmt: Formatters): ChartOptions {
  const chart = isObject(options.chart) ? options.chart : {};
  const xaxis = isObject(options.xaxis) ? options.xaxis : undefined;
  const withLocale = {...options, chart: {...chart, locales: [axisLocale(fmt)], defaultLocale: 'fr'}};
  if (xaxis?.type !== 'datetime') return withLocale;
  const labels = isObject(xaxis.labels) ? xaxis.labels : {};
  return {
    ...withLocale,
    xaxis: {
      ...xaxis,
      labels: {datetimeFormatter: {year: 'yyyy', month: 'MMM yyyy', day: 'd MMM', hour: 'HH:mm'}, ...labels},
    },
  };
}
