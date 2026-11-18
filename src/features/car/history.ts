// The Car's history as pure functions: the two windows it asks, the charging sessions and the daily EV energy they make, the sessions by month, and the monthly chart's options.
// Pattern: functional core (Bernhardt, Boundaries), the data half of a humble object (Meszaros); each rule is a block of the legacy `derive` and `carSheet` (deleted in #251 and #252),
// copied and named. The session rule itself is the Wallbox provider's (`chargingSessions`), which the live pill reads too (ADR 0028). kWh; a day's key is the local day of the row's noon.
// Must not: call the API client or the cache, word anything a person reads outside `t`, or read the clock or the zone (`now`, the formats and the colour are passed in).
import type {ResolvedConfig} from '../../core/config.ts';
import {noonOf, whole, type Formatters} from '../../core/i18n/format.ts';
import {capitalise} from '../../core/figures.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import {
  dayKeys,
  meanByStart,
  NOON_MS,
  rowsOf,
  sessionsWindow,
  windowStart,
  type DayKeys,
  type StatisticsWindow,
  type StatsReply,
} from '../../providers/power-history.ts';
import {chargingSessions, type Session} from '../../providers/wallbox.ts';
import {mergeOptions, type ChartOptions} from '../../ui/chart-options.ts';
import {thinCategories} from '../../ui/thin-axis.ts';

/** How many days of the charger's daily energy the card's bars draw. */
export const DAILY_DAYS = 30;

/** The two windows the Car asks: the Wallbox's hourly power for the sessions, and the daily means of the grid and the charger for the bars. */
export interface CarWindows {
  /** The charger's hourly `mean` and `max` power for 366 days. */
  hours: StatisticsWindow;
  /** The grid's and the charger's daily mean power for 30 days: the grid's rows say which days there are. */
  days: StatisticsWindow;
}

export function carWindows(now: number, config: Pick<ResolvedConfig, 'entities'>): CarWindows {
  const {grid, evP} = config.entities;
  return {
    hours: sessionsWindow(now, evP),
    days: {start: windowStart(now, DAILY_DAYS), period: 'day', ids: [grid, evP], types: ['mean']},
  };
}

/** One day's charging in kWh. */
export interface DailyEv {
  /** The local day, `2026-11-09`. */
  day: string;
  ev: number;
}

/**
 * The charger's daily kWh: its mean kW times the day's hours, and for today only the hours so far. The grid's rows are the days (a day with no grid mean is not one),
 * and a day the charger has no row for counts for nothing.
 */
export function dailyEv(
  days: StatsReply,
  ids: {grid: string | null; ev: string | null},
  keys: Pick<DayKeys, 'today' | 'hoursToday'>,
  isoDay: Formatters['isoDay'],
): DailyEv[] {
  const means = meanByStart(days, ids.ev);
  return rowsOf(days, ids.grid)
    .filter(row => row.mean != null)
    .map(row => {
      const day = isoDay(row.start + NOON_MS);
      return {day, ev: (means.get(row.start) || 0) * (day === keys.today ? keys.hoursToday : 24)};
    });
}

/** The recorder's reply to each window. */
export interface CarReplies {
  hours: StatsReply;
  days: StatsReply;
}

/** What the Car keeps of a load: the sessions over the year and the last days' energy, with the instant they were derived at. */
export interface CarHistoryData {
  at: number;
  /** Oldest first. */
  sessions: Session[];
  /** The last 30 days, oldest first. */
  daily: DailyEv[];
}

export function deriveCarHistory(
  replies: CarReplies,
  config: Pick<ResolvedConfig, 'entities'>,
  now: number,
  fmt: Pick<Formatters, 'isoDay' | 'hourNow'>,
): CarHistoryData {
  const {grid, evP} = config.entities;
  return {
    at: now,
    sessions: chargingSessions(rowsOf(replies.hours, evP)),
    daily: dailyEv(replies.days, {grid, ev: evP}, dayKeys(now, fmt), fmt.isoDay).slice(-DAILY_DAYS),
  };
}

/** The sessions of one month: `2026-11`, the kWh delivered and how many there were. */
export interface MonthlySessions {
  month: string;
  kwh: number;
  count: number;
}

/** The sessions grouped by the month they began in, oldest first. */
export function monthlySessions(sessions: readonly Session[], fmt: Pick<Formatters, 'isoDay'>): MonthlySessions[] {
  const months = new Map<string, MonthlySessions>();
  for (const {start, kwh} of sessions) {
    const month = fmt.isoDay(start).slice(0, 7);
    const entry = months.get(month) ?? {month, kwh: 0, count: 0};
    entry.kwh += kwh;
    entry.count++;
    months.set(month, entry);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** What the options are made with: the formats, the catalog and the colour of the charger's bars, a token the element resolved. */
export interface SessionsChartDeps {
  fmt: Formatters;
  t: Translate;
  color: string;
}

/** The unit under an axis figure and in the tooltip. */
const KWH = 'kWh';

/** The options of the monthly bars, without the theme (the detail's sessions block, #252, draws them): the kWh charged each month, the month's short name under it and "12 kWh in 3 sessions" over it. */
export function sessionsChartOptions(
  months: readonly MonthlySessions[],
  {fmt, t, color}: SessionsChartDeps,
): ChartOptions {
  return {
    chart: {type: 'bar', height: 220},
    series: [{name: t('car.sessions.chargedAtHome'), data: months.map(({kwh}) => +kwh.toFixed(1))}],
    colors: [color],
    plotOptions: {bar: {borderRadius: 5, borderRadiusApplication: 'end', columnWidth: '56%'}},
    xaxis: {categories: months.map(({month}) => capitalise(fmt.month(noonOf(`${month}-15`, fmt), 'short')))},
    yaxis: {labels: {formatter: (value: number) => `${whole(fmt, value)} ${KWH}`}},
    tooltip: {
      y: {
        formatter: (value: number, {dataPointIndex}: {dataPointIndex: number}) =>
          t('car.sessions.tooltip', {kwh: whole(fmt, value), n: months[dataPointIndex].count}),
      },
    },
  };
}

/** What the daily chart is made with: the sessions' (the formats, the catalog and the charger's colour) and whether the screen is a phone's. */
export interface DailyChartDeps extends SessionsChartDeps {
  compact: boolean;
}

/** A day label every week: seven days between two labels, whichever the screen. */
const LABEL_EVERY = 7;

/**
 * The options of the 30 days' bars, without the theme: the kWh charged each day on thinned day categories and a kWh axis, as Energy's month chart is drawn (the kit's `thinCategories`),
 * a label every week and a tooltip that names every day.
 */
export function dailyChartOptions(
  {days, values}: {days: readonly string[]; values: readonly number[]},
  {fmt, t, color, compact}: DailyChartDeps,
): ChartOptions {
  const labels = days.length / LABEL_EVERY;
  return mergeOptions(
    {
      chart: {type: 'bar', height: 220},
      series: [{name: t('car.sessions.chargedAtHome'), data: values.map(value => +value.toFixed(1))}],
      colors: [color],
      plotOptions: {bar: {borderRadius: 3, borderRadiusApplication: 'end', columnWidth: '64%'}},
      yaxis: {labels: {formatter: (value: number) => `${whole(fmt, value)} ${KWH}`}},
      tooltip: {y: {formatter: (value: number) => `${fmt.fixed(value, 1)} ${KWH}`}},
    },
    thinCategories(days, labels, labels, compact),
  );
}
