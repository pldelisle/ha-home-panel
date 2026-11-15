// The power history every reader of it shares: which statistics to ask, and the hourly flow, the meter's totals and the water heater's day they make.
// Pattern: an adapter below the features (ADR 0025), pure over the recorder's rows. Today the legacy `loadHistory` asks its windows and
// src/features/energy/history.ts cuts its slices; the smart stack (#240), the live pill's water heater and the Home pane (#241, which
// deletes the legacy `derive` each rule is a block of) read them next, so they are not Energy's to keep (ADR 0028). The numbers are kWh.
// The windows start on a stable hour, so the shared cache (ADR 0028) can answer a repeat.
// Must not: call the API client or the cache, word anything a person reads, or read the clock or the zone (`now` and the formats are passed in).
import type {ResolvedConfig} from '../core/config.ts';
import {DAY_MS, HOUR_MS, MINUTE_MS} from '../core/figures.ts';
import type {StatisticRow} from '../core/ha.ts';
import type {Formatters} from '../core/i18n/format.ts';

/** The recorder's reply: the rows of each entity id. */
export type StatsReply = Readonly<Record<string, readonly StatisticRow[]>>;

/** A point of a series: milliseconds and a value. */
export type Point = [number, number];

/** One call to `statistics`: what the cache is asked, spelled out so a test can read it. */
export interface StatisticsWindow {
  start: Date;
  period: 'hour' | 'day' | '5minute';
  ids: readonly (string | null)[];
  types: readonly string[];
}

/** The windows the shared slices read. */
export interface PowerWindows {
  /** The hourly mean power of the grid, the water heater, the charger and each room, for seven days. */
  hour7: StatisticsWindow;
  /** The meter's energy by hour since the start of today. */
  today: StatisticsWindow;
  /** The meter's and the water heater's daily energy, for 33 days. */
  meter33: StatisticsWindow;
  /** The water heater's temperature and power in five-minute means, for 25 hours. */
  fiveMin25h: StatisticsWindow;
}

/** The sensors a flow adds up; `rooms` are the rooms' power sensors, in the config's order (an empty one reads nothing). */
export interface FlowIds {
  grid: string | null;
  waterHeater: string | null;
  ev: string | null;
  rooms: readonly (string | null)[];
}

/** One hour of the flow: `[t, ev, wh, heat, rest, total]`, in kWh. */
export type FlowRow = [t: number, ev: number, wh: number, heat: number, rest: number, total: number];

/** The sensors the flow adds up, as the config names them. */
export const flowIds = (config: Pick<ResolvedConfig, 'entities' | 'rooms'>): FlowIds => ({
  grid: config.entities.grid,
  waterHeater: config.entities.whP,
  ev: config.entities.evP,
  rooms: config.rooms.map(room => room.power),
});

/** The day keys the totals are cut by, and how many hours of today have passed. */
export interface DayKeys {
  today: string;
  yesterday: string;
  /** `2026-11`: the month of today. */
  month: string;
  /** The hours of today so far, at least one: today's mean power is a mean over these only. */
  hoursToday: number;
}

/** A day's statistic is dated at local midnight, and half a day later it names the same local day in any zone. */
export const NOON_MS = 12 * HOUR_MS;

/** The top of the hour, `days` back: one start for every request of an hour, so the cache answers the second. */
export const windowStart = (now: number, days: number): Date =>
  new Date(Math.floor(now / HOUR_MS) * HOUR_MS - days * DAY_MS);

/** The sum of a list of numbers, a missing one counting for nothing. */
export const sum = (values: readonly (number | null | undefined)[]): number =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

/** The rows of an id; none for an id the house does not have or the recorder does not know. */
export const rowsOf = (stats: StatsReply, id: string | null) => (id ? (stats[id] ?? []) : []);

/** The mean of an id's rows by the row's start. */
export const meanByStart = (stats: StatsReply, id: string | null) =>
  new Map(rowsOf(stats, id).map(row => [row.start, row.mean]));

const rounded = (value: number): number => +value.toFixed(3);

export function powerWindows(
  now: number,
  config: Pick<ResolvedConfig, 'entities' | 'rooms'>,
  fmt: Pick<Formatters, 'hourNow'>,
): PowerWindows {
  const {energy, whE, whT} = config.entities;
  const flow = flowIds(config);
  // a minute before local midnight, as the legacy load asked, on the minute so that the whole day asks the same one
  const midnight = Math.floor(now / MINUTE_MS) * MINUTE_MS - Math.round(fmt.hourNow(now) * HOUR_MS);
  return {
    hour7: {
      start: windowStart(now, 7),
      period: 'hour',
      ids: [flow.grid, flow.waterHeater, flow.ev, ...flow.rooms],
      types: ['mean'],
    },
    today: {start: new Date(midnight - MINUTE_MS), period: 'hour', ids: [energy], types: ['change']},
    meter33: {start: windowStart(now, 33), period: 'day', ids: [energy, whE], types: ['change']},
    fiveMin25h: {start: windowStart(now, 25 / 24), period: '5minute', ids: [whT, flow.waterHeater], types: ['mean']},
  };
}

/**
 * The daily mean power of the same sensors for 400 days, the window Energy's detail ranges over and the legacy load asks: one
 * definition, so the shared cache answers the second asker (ADR 0028).
 */
export const dailyPowerWindow = (now: number, config: Pick<ResolvedConfig, 'entities' | 'rooms'>): StatisticsWindow => {
  const flow = flowIds(config);
  return {
    start: windowStart(now, 400),
    period: 'day',
    ids: [flow.grid, flow.waterHeater, flow.ev, ...flow.rooms],
    types: ['mean'],
  };
};

/** The day keys of `now` in the house's zone, with the hours of today so far (never under one, so the mean of a day's first minutes divides). */
export function dayKeys(now: number, fmt: Pick<Formatters, 'isoDay' | 'hourNow'>): DayKeys {
  const today = fmt.isoDay(now);
  return {
    today,
    yesterday: fmt.isoDay(now - DAY_MS),
    month: today.slice(0, 7),
    hoursToday: Math.max(1, Math.floor(fmt.hourNow(now))),
  };
}

/** The sensors' means for one of the grid's rows, in kW: the grid, the water heater, the charger, the heating (the rooms together) and each room. */
export interface FlowParts {
  start: number;
  grid: number;
  wh: number;
  ev: number;
  heat: number;
  rooms: number[];
}

/**
 * The split every flow is cut from: for each row the grid has a mean for, the water heater's, the charger's and the rooms' means of the
 * same start, a sensor with no row for that start counting for nothing. The hourly flow and Energy's daily totals both read it.
 */
export function flowParts(stats: StatsReply, ids: FlowIds): FlowParts[] {
  const heater = meanByStart(stats, ids.waterHeater);
  const charger = meanByStart(stats, ids.ev);
  const rooms = ids.rooms.map(id => meanByStart(stats, id));
  return rowsOf(stats, ids.grid)
    .filter(row => row.mean != null)
    .map(({start, mean}) => {
      const each = rooms.map(room => room.get(start) || 0);
      return {
        start,
        grid: mean as number,
        wh: heater.get(start) || 0,
        ev: charger.get(start) || 0,
        heat: sum(each),
        rooms: each,
      };
    });
}

/** What the grid leaves once the water heater, the charger and the heating are taken: the rest of the home, never below zero. */
export const restOf = (grid: number, wh: number, ev: number, heat: number): number =>
  Math.max(0, grid - wh - ev - heat);

/** The hourly flow: each hour's parts in kWh (an hour's mean kW is its kWh), rounded to the watt-hour. */
export function hourlyFlow(stats: StatsReply, ids: FlowIds): FlowRow[] {
  return flowParts(stats, ids).map(({start, grid, wh, ev, heat}) => [
    start,
    rounded(ev),
    rounded(wh),
    rounded(heat),
    rounded(restOf(grid, wh, ev, heat)),
    rounded(grid),
  ]);
}

/** What the meter says: today so far, yesterday, the last 30 days and this month, in kWh; yesterday is null when no day says it. */
export interface MeterTotals {
  today: number;
  yesterday: number | null;
  d30: number;
  month: number;
}

/** A meter's daily changes as `[day key, kWh]`, a day with no change reading as nothing; the key is the local day of the row's noon. */
export function dailyChanges(stats: StatsReply, id: string | null, isoDay: (d: number) => string): [string, number][] {
  return rowsOf(stats, id).map(row => [isoDay(row.start + NOON_MS), row.change || 0]);
}

export function meterTotals(
  meterStats: StatsReply,
  todayStats: StatsReply,
  ids: {energy: string | null},
  keys: Pick<DayKeys, 'yesterday' | 'month'>,
  isoDay: Formatters['isoDay'],
): MeterTotals {
  const days = dailyChanges(meterStats, ids.energy, isoDay);
  return {
    today: sum(rowsOf(todayStats, ids.energy).map(row => row.change)),
    yesterday: days.find(([key]) => key === keys.yesterday)?.[1] ?? null,
    d30: sum(days.slice(-30).map(([, kwh]) => kwh)),
    month: sum(days.filter(([key]) => key.startsWith(keys.month)).map(([, kwh]) => kwh)),
  };
}

/** The water heater's temperature and power in five-minute means, the rows with no mean left out. */
export function waterDay(
  fiveMin: StatsReply,
  ids: {temperature: string | null; power: string | null},
): {t: Point[]; p: Point[]} {
  const points = (id: string | null): Point[] =>
    rowsOf(fiveMin, id).flatMap(row => (row.mean == null ? [] : [[row.start, row.mean] as Point]));
  return {t: points(ids.temperature), p: points(ids.power)};
}
