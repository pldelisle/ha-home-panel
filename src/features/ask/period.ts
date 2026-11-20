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
