// The options every chart shares, as pure functions: the base of the panel's look, the deep merge a chart's own options go through, and the time axis in the house's formats.
// Pattern: functional core (Bernhardt, Boundaries) under a humble object: `<hp-chart>` reads the tokens, the theme and the media query and hands
// them in; the rules are the legacy class's own (base, merge), moved here so a shadow root need not be seen by it; the axis and tooltip dates are `fmt`'s, not the library's English tokens.
// Must not: read the DOM, the clock or a media query, name a chart's content, or hold a string the household reads (`noData` is given).
import {DASH, DAY_MS, HOUR_MS} from '../core/figures.ts';
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

/** The most steps a time axis is cut into: eight labels still fit a phone's chart. */
const MAX_STEPS = 8;

/** The steps, in hours, a time axis may take: the hours people count in (1, 2, 3, 4, 6, 12), then whole days. */
const STEPS_H = [1, 2, 3, 4, 6, 12];

/**
 * How to cut a span of hours into equal steps that are whole hours, so every tick of a time axis falls on a round hour: the number of steps and
 * the span they cover, which is the span itself when a step divides it and the next whole number of steps when none does. The step is the one
 * that loses the fewest hours (the smallest when they tie) among those that need at most `MAX_STEPS`; nothing for a span with no hour in it.
 * ApexCharts spaces a time axis' ticks evenly from its first (`tickAmount` steps), so a span it can split this way starts and ends on the hour.
 */
export function hourTicks(spanMs: number): {intervals: number; span: number} | undefined {
  const hours = Math.ceil(spanMs / HOUR_MS - 1e-9);
  if (hours < 1) return undefined;
  const steps = [...STEPS_H, ...Array.from({length: Math.ceil(hours / 24)}, (_, i) => 24 * (i + 1))];
  let best: {intervals: number; span: number} | undefined;
  for (const step of steps) {
    const intervals = Math.ceil(hours / step);
    if (intervals > MAX_STEPS) continue;
    const span = intervals * step * HOUR_MS;
    if (!best || span < best.span) best = {intervals, span};
  }
  return best;
}

/** The midnight that begins `at`'s day on the house clock, from its hours (`hourNow`): a day is taken as 24 hours, which a change of clock puts an hour out for that one day. */
export const midnightBefore = (at: number, fmt: Pick<Formatters, 'hourNow'>): number =>
  Math.floor(at / 6e4) * 6e4 - Math.round(fmt.hourNow(at) * 60) * 6e4;

/** The first midnight on the house clock at or after `at`. */
export const midnightAtOrAfter = (at: number, fmt: Pick<Formatters, 'hourNow'>): number => {
  const start = midnightBefore(at, fmt);
  return start === at ? at : start + DAY_MS;
};

/**
 * The range and the ticks of a time axis over rows that start on the hour, the first at `first` and the last at `last`: the axis ends at the
 * end of its last step (`hourTicks`), so the ticks fall on whole hours where the library would split the span of the data in five and write
 * "2:48 am". Over more than a day it begins at the first midnight, so the steps are whole days and read as dates (the hours before it are left off).
 * Nothing for a single row, which has no span to cut.
 */
export function hourRowsAxis(
  first: number,
  last: number,
  fmt: Pick<Formatters, 'hourNow'>,
): {min: number; max: number; tickAmount: number} | undefined {
  const start = last - first > DAY_MS ? midnightAtOrAfter(first, fmt) : first;
  const ticks = hourTicks(last - start);
  return ticks ? {min: start, max: start + ticks.span, tickAmount: ticks.intervals} : undefined;
}

/**
 * A chart's time axis: `days` back from the end of the day (the hour, for a single day) after `now`, in the house's clock (never UTC). It ends on
 * a round boundary, not at `now`, so its ticks (`tickAmount`) are whole hours, or midnights from a week on: no "2:48 am", and a week reads "Nov 5, Nov 6…".
 * Air, Climate and Weather draw their history on it.
 */
export const timeAxis = (days: number, now: number, fmt: Pick<Formatters, 'hourNow'>) => {
  const max = days > 1 ? midnightAtOrAfter(now, fmt) : Math.ceil(now / HOUR_MS) * HOUR_MS;
  const ticks = hourTicks(days * DAY_MS);
  return {
    type: 'datetime',
    min: max - days * DAY_MS,
    max,
    ...(ticks ? {tickAmount: ticks.intervals} : {}),
    labels: {datetimeUTC: false},
  };
};

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

/** What the library hands a label formatter as its third argument, of which only the axis' range is read. */
interface AxisRangeOptions {
  w?: {globals?: {minX?: number; maxX?: number}};
}

/**
 * What a tick of a time axis says: the day (`Nov 11`, `11 nov.`) at midnight, otherwise the hour (`4 pm`, `16 h`), or the time when it is
 * not on the hour (`4:30 pm`). A chart that stays within one day writes midnight as the hour too (`12 am`, `0 h`): the date says nothing
 * when every tick is today's. On a chart of several days, whose ticks are a day apart, a tick within an hour of midnight is that midnight's
 * day: the steps are whole days of 24 hours, so a change of clock puts the ticks after it at 11 pm or 1 am. The library's own tick text
 * (its formats are English tokens) is never used.
 */
export const axisLabel =
  (fmt: Pick<Formatters, 'date' | 'hour' | 'time' | 'hourNow'>) =>
  (_text: string, at: number, opts?: AxisRangeOptions): string => {
    const hours = fmt.hourNow(at);
    const {minX, maxX} = opts?.w?.globals ?? {};
    const known = minX !== undefined && maxX !== undefined;
    const oneDay = known && maxX - minX <= DAY_MS;
    if (known && !oneDay) {
      const toMidnight = hours >= 12 ? 24 - hours : -hours;
      if (Math.abs(toMidnight) <= 1) return fmt.date(at + toMidnight * HOUR_MS);
    }
    if (hours === 0) return oneDay ? fmt.hour(at) : fmt.date(at);
    return Number.isInteger(hours) ? fmt.hour(at) : fmt.time(at);
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
