// The options every chart shares, as pure functions: the base of the panel's look, the deep merge a chart's own options go through, and the time axis in the house's formats.
// Pattern: functional core (Bernhardt, Boundaries) under a humble object: `<hp-chart>` reads the tokens, the theme and the media query and hands
// them in; the rules are the legacy class's own (base, merge), moved here so a shadow root need not be seen by it; the axis and tooltip dates are `fmt`'s, not the library's English tokens.
// Must not: read the DOM, the clock or a media query, name a chart's content, or hold a string the household reads (`noData` is given).
import {DASH, DAY_MS} from '../core/figures.ts';
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

/** A chart's time axis: `days` back from `now`, in the house's clock (never UTC). Air, Climate and Weather draw their history on it. */
export const timeAxis = (days: number, now: number) => ({
  type: 'datetime',
  min: now - days * DAY_MS,
  max: now,
  labels: {datetimeUTC: false},
});

/** A temperature in a tooltip: a tenth of a degree and the unit, or the dash when there is no reading. */
export const celsius = (fmt: Pick<Formatters, 'fixed'>, value: number | null): string =>
  value == null ? DASH : `${fmt.fixed(value, 1)} °C`;

/** How a tooltip names an instant: its day (a short weekday, or the weekday and the date) and its clock (the hour, or the hour and minutes), either left out. */
export interface TooltipDate {
  day: 'weekday' | 'date' | null;
  clock: 'hour' | 'time' | null;
}

/** The text a tooltip's heading writes for an instant, in the house's format: `Sat 4:07 pm`, `sam. 7 nov. 16 h`. */
export const tooltipDate =
  ({day, clock}: TooltipDate, fmt: Pick<Formatters, 'weekday' | 'dateWeekday' | 'hour' | 'time'>) =>
  (at: number): string =>
    [
      day === 'weekday' ? fmt.weekday(at, 'short') : day === 'date' ? fmt.dateWeekday(at) : '',
      clock === 'hour' ? fmt.hour(at) : clock === 'time' ? fmt.time(at) : '',
    ]
      .filter(Boolean)
      .join(' ');

/**
 * What a tick of a time axis says: the day (`Nov 11`, `11 nov.`) at midnight, otherwise the hour (`4 pm`, `16 h`), or the time when it is
 * not on the hour (`4:30 pm`). The library's own tick text (its formats are English tokens) is never used.
 */
export const axisLabel =
  (fmt: Pick<Formatters, 'date' | 'hour' | 'time' | 'hourNow'>) =>
  (_text: string, at: number): string => {
    const hours = fmt.hourNow(at);
    return hours === 0 ? fmt.date(at) : Number.isInteger(hours) ? fmt.hour(at) : fmt.time(at);
  };

/**
 * A time axis in the house's formats, in every language: its ticks are written with `axisLabel` unless the chart wrote its own.
 * A chart with no time axis is as it came.
 */
export function houseAxis(options: ChartOptions, fmt: Formatters): ChartOptions {
  const xaxis = isObject(options.xaxis) ? options.xaxis : undefined;
  if (xaxis?.type !== 'datetime') return options;
  const labels = isObject(xaxis.labels) ? xaxis.labels : {};
  return {...options, xaxis: {...xaxis, labels: {formatter: axisLabel(fmt), ...labels}}};
}
