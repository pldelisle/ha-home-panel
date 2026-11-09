// RANGES: the history ranges (a day, a week, a month, a year) as data: how far back, which statistics period, how the axis reads.
// Pattern: table-driven design (a table, not four branches), after the legacy panel's CRANGE with every word replaced by a
// message key; it sits in the UI kit because Weather, Climate, Air and the sensors' sheets all read the same four ranges.
// Must not: import anything but types, hold a string the household reads, or format a date (the tooltip format is Apex's own syntax).
import type {MessageKey} from '../core/i18n/en.ts';

export type Range = 'day' | 'week' | 'month' | 'year';

/** The recorder's statistics periods a range asks for. */
export type StatisticsPeriod = '5minute' | 'hour' | 'day';

export interface RangeDefinition {
  /** How far back the range reaches. */
  days: number;
  /** The statistics period it asks the recorder for. */
  period: StatisticsPeriod;
  /** The length of one bucket of that period; a row is drawn at the middle of its bucket, and plain history is thinned to one point per bucket. */
  bucketMs: number;
  /** "last 7 days", under a chart's title. */
  labelKey: MessageKey;
  /** "7 days", to finish a sentence. */
  shortKey: MessageKey;
  /** The name of the mean line: "Hourly mean". */
  meanKey: MessageKey;
  /** The number of ticks the time axis labels. */
  ticks: number;
  /** The tooltip's date format, in ApexCharts' syntax. */
  tooltipFormat: string;
}

/** The ranges in the order their tabs show them. */
export const RANGES: Record<Range, RangeDefinition> = {
  day: {
    days: 1,
    period: '5minute',
    bucketMs: 3e5,
    labelKey: 'range.day.label',
    shortKey: 'range.day.short',
    meanKey: 'range.mean.fiveMinute',
    ticks: 8,
    tooltipFormat: 'ddd h:mm tt',
  },
  week: {
    days: 7,
    period: 'hour',
    bucketMs: 36e5,
    labelKey: 'range.week.label',
    shortKey: 'range.week.short',
    meanKey: 'range.mean.hourly',
    ticks: 7,
    tooltipFormat: 'ddd h tt',
  },
  month: {
    days: 30,
    period: 'hour',
    bucketMs: 36e5,
    labelKey: 'range.month.label',
    shortKey: 'range.month.short',
    meanKey: 'range.mean.hourly',
    ticks: 10,
    tooltipFormat: 'ddd MMM d, h tt',
  },
  year: {
    days: 365,
    period: 'day',
    bucketMs: 864e5,
    labelKey: 'range.year.label',
    shortKey: 'range.year.short',
    meanKey: 'range.mean.daily',
    ticks: 12,
    tooltipFormat: 'ddd MMM d, yyyy',
  },
};
