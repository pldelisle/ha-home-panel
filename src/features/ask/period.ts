// The nine periods of a plan, and the window of the house's calendar each one means.
// Pattern: a closed vocabulary resolved by the panel (ADR 0040, "The model plans, the panel computes"): the model names a period,
// never a date, so a window is computed from the clock, the house's formatters (which hold the zone) and the week's first day, all parameters (functional core).
// A start is a stable instant (a local midnight or the top of an hour), so the statistics cache can answer a repeat (ADR 0028).
// Must not: read the clock or an `Intl` default (the caller passes the clock and the formatters), word a period (the messages do), or know a sensor.
import type {StatisticsPeriod} from '../../core/ha.ts';
import {HOUR_MS} from '../../core/figures.ts';
import {startOfDay, type Formatters} from '../../core/i18n/format.ts';

/** The words a plan may use for when. */
export const PERIODS = [
  'today',
  'yesterday',
  'last_24h',
  'this_week',
  'last_week',
  'last_7_days',
  'this_month',
  'last_month',
  'last_30_days',
] as const;
export type Period = (typeof PERIODS)[number];

/** A day of the week as `Date.getDay` counts it: 0 is Sunday, 1 is Monday. The locale decides which one a week starts on. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** What a period asks of the recorder: the half-open window `[start, end)` and the statistics' bucket that suits its length. */
export interface PeriodWindow {
  start: Date;
  end: Date;
  statistic: StatisticsPeriod;
}

/** A day key moved by whole days, on the calendar and so across a daylight-saving change. */
const addDays = (day: string, days: number): string => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
};

/** The first of the month that holds `day`, moved by whole months. */
const firstOfMonth = (day: string, months: number): string => {
  const [year, month] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
};

/** What the runtime says of a locale's week: `Intl.Locale.getWeekInfo()`, which the library typings of the build do not have yet; `firstDay` counts 1 for Monday to 7 for Sunday. */
interface WeekInfoLocale {
  getWeekInfo?: () => {firstDay: number};
}

/** The regions whose weeks begin on a Sunday, which the runtimes without `getWeekInfo` (Firefox) are not asked: every other region begins on a Monday. */
const SUNDAY_REGIONS: ReadonlySet<string> = new Set(['US', 'CA', 'MX', 'BR', 'JP', 'IL']);

/**
 * The first day of the week in a locale tag, as `WeekStart` counts it (0 is Sunday): `en-CA` and `fr-CA` begin on Sunday, `fr-FR` on Monday. Where the runtime has no `getWeekInfo` it is
 * told by the tag's region (the likely one when the tag has none: `en` is the United States), Sunday for a few regions and Monday for the rest. Monday when the tag cannot be read.
 */
export function weekStartOf(tag: string): WeekStart {
  try {
    const locale = new Intl.Locale(tag);
    const info = (locale as WeekInfoLocale).getWeekInfo?.();
    if (info) return (info.firstDay % 7) as WeekStart;
    return SUNDAY_REGIONS.has(locale.maximize().region ?? '') ? 0 : 1;
  } catch {
    return 1;
  }
}

/** The day of the week of a day key, as `WeekStart` counts it: 0 is Sunday. */
export const dayOfWeek = (day: string): WeekStart => new Date(`${day}T12:00:00Z`).getUTCDay() as WeekStart;

/** How many days after the week's first day a day key falls: 0 on that day itself. */
const daysIntoWeek = (day: string, weekStart: WeekStart): number => (dayOfWeek(day) - weekStart + 7) % 7;

/**
 * The window a period means at `now`, in the zone of `fmt`, the house's formatters. The calendar periods end at a midnight; the ones that include today end at
 * `now`. A bucket is chosen by length, as the spec says: 5 minutes up to a day, an hour up to a week, a day beyond.
 */
export function resolvePeriod(
  period: Period,
  now: Date,
  fmt: Pick<Formatters, 'isoDay'>,
  weekStart: WeekStart,
): PeriodWindow {
  const midnight = (day: string) => new Date(startOfDay(day, fmt));
  const today = fmt.isoDay(now);
  const monday = addDays(today, -daysIntoWeek(today, weekStart));
  const since = (start: Date, statistic: StatisticsPeriod): PeriodWindow => ({start, end: now, statistic});
  const between = (from: string, to: string, statistic: StatisticsPeriod): PeriodWindow => ({
    start: midnight(from),
    end: midnight(to),
    statistic,
  });
  switch (period) {
    case 'today':
      return since(midnight(today), '5minute');
    case 'yesterday':
      return between(addDays(today, -1), today, '5minute');
    case 'last_24h':
      return since(new Date(Math.floor((now.getTime() - 24 * HOUR_MS) / HOUR_MS) * HOUR_MS), '5minute');
    case 'this_week':
      return since(midnight(monday), 'hour');
    case 'last_week':
      return between(addDays(monday, -7), monday, 'hour');
    case 'last_7_days':
      return since(midnight(addDays(today, -6)), 'hour');
    case 'this_month':
      return since(midnight(firstOfMonth(today, 0)), 'day');
    case 'last_month':
      return between(firstOfMonth(today, -1), firstOfMonth(today, 0), 'day');
    case 'last_30_days':
      return since(midnight(addDays(today, -29)), 'day');
  }
}

/**
 * The window of a moments question over a measure: the period's own, but never read by the day. A daily mean hides an afternoon above a threshold, and the recorder keeps
 * 5-minute rows for only about ten days while its hourly rows last, so a month is read by the hour (spec 29, "The evaluation").
 */
export const momentsWindow = (window: PeriodWindow): PeriodWindow =>
  window.statistic === 'day' ? {...window, statistic: 'hour'} : window;

/** The periods of a day or less, whose total is told hour by hour; a longer one is told day by day. */
const HOURLY_TOTALS: readonly Period[] = ['today', 'yesterday', 'last_24h'];

/**
 * The window of a total: the period's own start and end, read by the hour up to a day and by the day beyond (spec 29, "The evaluation"). The meter's `change` has no 5-minute
 * need, and a bar per day is what the question wants; the start is the same stable instant the other readers of the statistics ask (ADR 0028).
 */
export const totalWindow = (period: Period, window: PeriodWindow): PeriodWindow => ({
  ...window,
  statistic: HOURLY_TOTALS.includes(period) ? 'hour' : 'day',
});
