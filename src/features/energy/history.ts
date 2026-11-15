// Energy's history as pure functions: the windows it asks, the daily split, the totals of 30 days and 12 months, and the water heater's cycles.
// Pattern: functional core (Bernhardt, Boundaries), the data half of a humble object (Meszaros); each rule is a block of the legacy `derive`
// (deleted in #241), copied and named. What other readers need too (the hourly flow, the meter's totals, the water heater's day) is in
// src/providers/power-history.ts (ADR 0028); here is what only Energy reads. kWh; a day's key is the local day of the row's noon.
// Must not: call the API client or the cache, word anything a person reads, or read the clock or the zone (`now` and the formats are passed in).
import type {ResolvedConfig} from '../../core/config.ts';
import {DAY_MS} from '../../core/figures.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import {
  dailyChanges,
  dailyPowerWindow,
  dayKeys,
  flowIds,
  hourlyFlow,
  meanByStart,
  meterTotals,
  NOON_MS,
  powerWindows,
  rowsOf,
  sum,
  waterDay,
  type DayKeys,
  type FlowIds,
  type FlowRow,
  type MeterTotals,
  type Point,
  type PowerWindows,
  type StatisticsWindow,
  type StatsReply,
} from '../../providers/power-history.ts';

/** The five windows Energy asks: the four every reader of the power history shares, and the 400 days of daily power its detail ranges over. */
export interface EnergyWindows extends PowerWindows {
  day400: StatisticsWindow;
}

export function energyWindows(
  now: number,
  config: Pick<ResolvedConfig, 'entities' | 'rooms'>,
  fmt: Pick<Formatters, 'hourNow'>,
): EnergyWindows {
  return {...powerWindows(now, config, fmt), day400: dailyPowerWindow(now, config)};
}

/** One day's energy by use, in kWh: the heating, the water heater, the charger, the rest of the home, the grid, and each room's own heating. */
export interface DailyRow {
  day: string;
  heat: number;
  wh: number;
  ev: number;
  rest: number;
  total: number;
  rooms: number[];
}

/** The four uses a day splits into, in the order of `groupTotals`. */
export const GROUPS = ['heat', 'wh', 'ev', 'rest'] as const;

/** The months' totals by use. */
export type MonthSplit = Record<(typeof GROUPS)[number], number>;

/**
 * The daily kWh: each day's mean kW times its hours, and for today only the hours so far. The grid's days are the days (a day with no grid
 * mean is not one); a sensor with no row for a day counts for nothing, and the rest never goes below zero.
 */
export function dailyTotals(
  stats: StatsReply,
  ids: FlowIds,
  keys: Pick<DayKeys, 'today' | 'hoursToday'>,
  isoDay: Formatters['isoDay'],
): DailyRow[] {
  const heater = meanByStart(stats, ids.waterHeater);
  const charger = meanByStart(stats, ids.ev);
  const rooms = ids.rooms.map(id => meanByStart(stats, id));
  return rowsOf(stats, ids.grid)
    .filter(row => row.mean != null)
    .map(({start, mean}) => {
      const day = isoDay(start + NOON_MS);
      const hours = day === keys.today ? keys.hoursToday : 24;
      const wh = (heater.get(start) || 0) * hours;
      const ev = (charger.get(start) || 0) * hours;
      const heat = sum(rooms.map(room => room.get(start) || 0)) * hours;
      const total = (mean as number) * hours;
      return {
        day,
        heat,
        wh,
        ev,
        rest: Math.max(0, total - wh - ev - heat),
        total,
        rooms: rooms.map(room => (room.get(start) || 0) * hours),
      };
    });
}

/** The heating, the water heater, the charger and the rest over the last `days` days: `[heat, wh, ev, rest]`. */
export function groupTotals(daily: readonly DailyRow[], days = 30): number[] {
  const last = daily.slice(-days);
  return GROUPS.map(group => sum(last.map(row => row[group])));
}

/** Each of the `rooms` rooms' own heating over the last `days` days, in the rooms' order. */
export function roomTotals(daily: readonly DailyRow[], rooms: number, days = 30): number[] {
  const last = daily.slice(-days);
  return Array.from({length: rooms}, (_, index) => sum(last.map(row => row.rooms[index])));
}

/** The last twelve months the days reach, by use, as `[2026-11, split]` in order. */
export function monthlyTotals(daily: readonly DailyRow[]): [string, MonthSplit][] {
  const months: Record<string, MonthSplit> = {};
  for (const row of daily) {
    const month = (months[row.day.slice(0, 7)] ??= {heat: 0, wh: 0, ev: 0, rest: 0});
    for (const group of GROUPS) month[group] += row[group];
  }
  return Object.entries(months).sort().slice(-12);
}

/** Of the last 24 hours of the water heater's power in five-minute means: its kWh, and its heating cycles (a run above 0.2 kW, joined across gaps up to five minutes). */
export function waterCycles(power: readonly Point[], now: number): {kwh24: number; cycles: number} {
  const points = power.filter(([t]) => t >= now - DAY_MS);
  let cycles = 0;
  points.forEach(([t, kw], index) => {
    const before = points[index - 1];
    if (kw > 0.2 && !(before && before[1] > 0.2 && t - before[0] <= 3e5)) cycles++;
  });
  // five-minute means of kW: twelve to the hour
  return {kwh24: sum(points.map(([, kw]) => kw)) / 12, cycles};
}

/** The water heater's daily kWh as `[day key, kWh]` for the last 14 days before today. */
export function waterDaily(
  meter: StatsReply,
  id: string | null,
  todayKey: string,
  isoDay: Formatters['isoDay'],
): [string, number][] {
  return dailyChanges(meter, id, isoDay)
    .filter(([key]) => key !== todayKey)
    .slice(-14);
}

/** The recorder's reply to each window. */
export type EnergyReplies = Record<keyof EnergyWindows, StatsReply>;

/** What the energy card and its detail read: nothing else is kept of the replies. */
export interface EnergyHistoryData {
  /** When the replies were derived, in milliseconds. */
  at: number;
  flow: FlowRow[];
  daily: DailyRow[];
  g30: number[];
  room30: number[];
  monthly: [string, MonthSplit][];
  totals: MeterTotals;
  wh24: {t: Point[]; p: Point[]};
  wh14: [string, number][];
}

/** The slices of the windows' replies, as the legacy `derive` made them. */
export function deriveEnergyHistory(
  replies: EnergyReplies,
  config: Pick<ResolvedConfig, 'entities' | 'rooms'>,
  now: number,
  fmt: Pick<Formatters, 'isoDay' | 'hourNow'>,
): EnergyHistoryData {
  const {energy, whE, whT, whP} = config.entities;
  const ids = flowIds(config);
  const keys = dayKeys(now, fmt);
  const daily = dailyTotals(replies.day400, ids, keys, fmt.isoDay);
  return {
    at: now,
    flow: hourlyFlow(replies.hour7, ids),
    daily,
    g30: groupTotals(daily),
    room30: roomTotals(daily, ids.rooms.length),
    monthly: monthlyTotals(daily),
    totals: meterTotals(replies.meter33, replies.today, {energy}, keys, fmt.isoDay),
    wh24: waterDay(replies.fiveMin25h, {temperature: whT, power: whP}),
    wh14: waterDaily(replies.meter33, whE, keys.today, fmt.isoDay),
  };
}
