// Climate's history as pure functions: the window it asks, the statistics rows in, the series, the heating kWh, the heatmap's cells and heat scale, and the three charts' options out.
// Pattern: functional core (Bernhardt, Boundaries), the data half of a humble object (Meszaros), after Air's and Energy's history; each rule is the legacy panel's
// own (`loadClimRange`, `houseSeries`, `bucket`, `heatColor`, `climateSheet`, `climateDetail`, deleted in #248) and options are plain data (ADR 0022): `fmt` and `t` are arguments.
// The caller is #246's loader and `<hp-climate-detail>`: the heat scale's stops, the only colours it owns, are the legacy panel's and name #248, which deletes them.
// Must not: call the API client or the cache, read the clock, the DOM or a viewport (`now` and `compact` are passed in), or pick a colour but the heat scale's (every other is a token).
import {oklabBlend} from '../../core/color.ts';
import type {ResolvedConfig} from '../../core/config.ts';
import {DAY_MS, HOUR_MS, hundredths} from '../../core/figures.ts';
import type {StatisticRow} from '../../core/ha.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {degrees, noonOf, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import {OFF_AT_OR_BELOW} from '../../providers/power.ts';
import {sum, windowStart, type StatisticsWindow, type StatsReply} from '../../providers/power-history.ts';
import {celsius, mergeOptions, timeAxis, type ChartOptions} from '../../ui/chart-options.ts';
import {RANGES, type Range, type StatisticsPeriod} from '../../ui/ranges.ts';
import {thinCategories} from '../../ui/thin-axis.ts';

// ---------- the window ----------

/** The statistics the rooms' charts ask of the recorder: the mean, and the low and high of each bucket (the outside chart's band). */
const TYPES = ['mean', 'min', 'max'];

/**
 * What a range asks the recorder for in one call: every room's temperature, setpoint and power, and the outside temperature. It starts at the
 * top of the hour a range back, so a second request within the hour is the shared cache's hit (ADR 0028); the axis still begins at `now` less the range.
 */
export function climateWindow(
  range: Range,
  config: Pick<ResolvedConfig, 'entities' | 'rooms'>,
  now: number,
): StatisticsWindow {
  const {rooms, entities} = config;
  return {
    start: windowStart(now, RANGES[range].days),
    period: RANGES[range].period,
    ids: [
      ...rooms.map(room => room.temp),
      ...rooms.map(room => room.target),
      ...rooms.map(room => room.power),
      entities.outT,
    ],
    types: TYPES,
  };
}

// ---------- the series ----------

/** A reading: milliseconds and a value, which a heat pump's line or a house's has gaps in; any more columns (the low and the high) are ignored. */
export type Reading = readonly [at: number, value: number | null, ...rest: (number | null)[]];

/** A temperature's mean at the middle of its bucket, with the bucket's low and high (null when the recorder gave none). */
export type RangePoint = [at: number, mean: number, min: number | null, max: number | null];

/** A setpoint at the middle of its bucket; null is a gap (the thermostat was off). */
export type SetpointPoint = [at: number, value: number | null];

const rowsOf = (stats: StatsReply, id: string | null | undefined): readonly StatisticRow[] =>
  id ? (stats[id] ?? []) : [];

/** The mean, low and high of each row of `id` at the middle of its bucket (`RANGES` has the bucket), two decimals; a row with no mean is skipped. */
export function rangeSeries(stats: StatsReply, id: string | null | undefined, range: Range): RangePoint[] {
  const offset = RANGES[range].bucketMs / 2;
  return rowsOf(stats, id).flatMap(({start, mean, min, max}) =>
    mean == null
      ? []
      : [
          [
            start + offset,
            hundredths(mean),
            min == null ? null : hundredths(min),
            max == null ? null : hundredths(max),
          ] as RangePoint,
        ],
  );
}

/**
 * A setpoint per row at the middle of its bucket: a stretch off throughout (its highest setpoint at or below the frost guard's cut-off) is a gap, one never
 * off (its lowest above the cut-off) shows its mean, and one partly off shows its highest setpoint. A row with no setpoint at all is skipped.
 */
export function setpointSeries(stats: StatsReply, id: string | null | undefined, range: Range): SetpointPoint[] {
  const offset = RANGES[range].bucketMs / 2;
  return rowsOf(stats, id).flatMap(({start, mean, min, max}) => {
    if (max == null) return [];
    const holding = min != null && min > OFF_AT_OR_BELOW && mean != null;
    return [[start + offset, max <= OFF_AT_OR_BELOW ? null : hundredths(holding ? mean : max)] as SetpointPoint];
  });
}

/** How many hours a statistics period spans. */
const PERIOD_HOURS: Record<StatisticsPeriod, number> = {'5minute': 1 / 12, hour: 1, day: 24};

/** The heating of one power sensor over the rows, in kWh: each period's mean kW times its hours, and the running period counts only the hours so far. */
export function heatingKwh(
  stats: StatsReply,
  id: string | null | undefined,
  period: StatisticsPeriod,
  now: number,
): number {
  return sum(
    rowsOf(stats, id).map(({start, mean}) =>
      mean == null ? 0 : mean * Math.max(0, Math.min(PERIOD_HOURS[period], (now - start) / HOUR_MS)),
    ),
  );
}

/** The mean of the rooms at each instant every room has a reading for: a bucket missing a room is dropped. `roomCount` is the house's, so a room with no rows drops them all. */
export function houseSeries(roomSeries: readonly (readonly Reading[])[], roomCount: number): [number, number][] {
  const byTime = new Map<number, number[]>();
  for (const series of roomSeries)
    for (const [at, value] of series) {
      if (value == null) continue;
      const values = byTime.get(at) ?? [];
      values.push(value);
      byTime.set(at, values);
    }
  return [...byTime]
    .filter(([, values]) => values.length === roomCount)
    .sort((a, b) => a[0] - b[0])
    .map(([at, values]) => [at, hundredths(sum(values) / values.length)]);
}

// ---------- the heatmap's cells ----------

/** One cell of the heatmap: a group of readings by the hour, the part of the day, the day or the week. */
export interface HeatCell {
  /** What orders and joins the readings: `2026-11-07 06`, `2026-11-07`, or the Monday of a week; the local day, the week's Monday by UTC arithmetic. */
  key: string;
  /** The cell's name on the axis and in the tooltip, unique among the cells of a range (the chart groups its cells by it). */
  label: string;
  /** The short text the time axis writes at this cell, empty where it writes none: the hour for a day, the day of a week's first block, nothing for a month or a year (the axis then thins the labels). */
  axis: string;
  /** The mean of the cell's readings, two decimals. */
  value: number;
}

/** The part of the day a six-hour block is, by its index from midnight. */
const BLOCKS: readonly MessageKey[] = [
  'climate.block.night',
  'climate.block.morning',
  'climate.block.afternoon',
  'climate.block.evening',
];

export interface BucketDeps {
  fmt: Pick<Formatters, 'dayParts' | 'hour' | 'date' | 'isoDay'>;
  t: Translate;
}

/** A day key's Monday: the week's start, by UTC arithmetic on the key (the weeks must not move with the zone), as a day key. */
const mondayOf = (day: string): string => {
  const noon = Date.parse(`${day}T12:00:00Z`);
  return new Date(noon - ((new Date(noon).getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
};

/** The cell of a reading and what a cell of its range is called, from the house's local day and hour. */
const cellOf = (at: number, range: Range, {fmt, t}: BucketDeps): Omit<HeatCell, 'value'> => {
  const {day, h, wd} = fmt.dayParts(at);
  if (range === 'day') {
    const hour = fmt.hour(at);
    return {key: `${day} ${String(h).padStart(2, '0')}`, label: `${wd}, ${hour}`, axis: hour};
  }
  if (range === 'week') {
    const block = Math.floor(h / 6);
    const dayText = `${wd} ${+day.slice(8)}`;
    return {
      key: `${day} ${String(block * 6).padStart(2, '0')}`,
      label: t(BLOCKS[block], {day: dayText}),
      axis: block === 0 ? dayText : '',
    };
  }
  const key = range === 'month' ? day : mondayOf(day);
  return {key, label: fmt.date(noonOf(key, fmt)), axis: ''};
};

/** Group a series into heatmap cells: hours for a day, six-hour blocks for a week, days for a month and weeks (Monday first) for a year; a gap is skipped. */
export function bucket(points: readonly Reading[], range: Range, deps: BucketDeps): HeatCell[] {
  const cells = new Map<string, {cell: Omit<HeatCell, 'value'>; total: number; count: number}>();
  for (const [at, value] of points) {
    if (value == null) continue;
    const {key, ...rest} = cellOf(at, range, deps);
    const group = cells.get(key) ?? {cell: {key, ...rest}, total: 0, count: 0};
    group.total += value;
    group.count++;
    cells.set(key, group);
  }
  return [...cells.values()]
    .sort((a, b) => (a.cell.key < b.cell.key ? -1 : 1))
    .map(({cell, total, count}) => ({...cell, value: hundredths(total / count)}));
}

// ---------- the heat scale ----------

/** The scale's ends, in degrees: a temperature outside them takes the end's colour. Read by #246's legend. */
export const HEAT_LO = 17;
export const HEAT_HI = 26;

/** A temperature scale: `[°C, colour]` stops, lowest first, blended between in OKLab. */
export type HeatStops = readonly (readonly [number, string])[];

/** Blue (cool) through a neutral 21 to 22° to red (warm); each step was checked for colour-blind separation. The legacy `HEAT_LIGHT` and `HEAT_DARK`. */
const HEAT_LIGHT: HeatStops = [
  [17, '#24467F'],
  [19, '#3F7DBF'],
  [20.5, '#8DBAD8'],
  [21.5, '#E6D9A2'],
  [23, '#EE9A52'],
  [24.5, '#CF592B'],
  [26, '#87210F'],
];
const HEAT_DARK: HeatStops = [
  [17, '#3561A8'],
  [19, '#4F8BCB'],
  [20.5, '#8FBAD6'],
  [21.5, '#D9C98E'],
  [23, '#EE9A52'],
  [24.5, '#D4602F'],
  [26, '#9A2C17'],
];

/** The stops of the theme's scale. */
export const heatScale = (dark: boolean): HeatStops => (dark ? HEAT_DARK : HEAT_LIGHT);

/** The colour of a temperature: the two stops around it, blended in OKLab; below the scale the first stop, above it the last. */
export function heatColor(temperature: number, stops: HeatStops): string {
  const value = Math.min(HEAT_HI, Math.max(HEAT_LO, temperature));
  let upper = 1;
  while (upper < stops.length - 1 && value > stops[upper][0]) upper++;
  const [from, fromColor] = stops[upper - 1];
  const [to, toColor] = stops[upper];
  return oklabBlend(fromColor, toColor, (value - from) / (to - from));
}

/** One band of the chart's colour scale. */
export interface HeatRange {
  from: number;
  to: number;
  color: string;
}

/** The scale in 0.1 degree steps, so neighbouring cells blend instead of jumping between bands; the first band reaches down and the last up, past the scale. */
export function heatRanges(stops: HeatStops): HeatRange[] {
  const steps = (HEAT_HI - HEAT_LO) * 10;
  return Array.from({length: steps}, (_, step) => {
    const from = HEAT_LO + step / 10;
    return {
      from: step ? from : -99,
      to: step === steps - 1 ? 99 : from + 0.0999,
      color: heatColor(from + 0.05, stops),
    };
  });
}

// ---------- the words ----------

/** The words a range gives the heatmap's title and the outside chart's note, as catalog keys: Climate's own, since no other feature reads them (the kit's `RANGES` holds what every user needs). Read by #246. */
export const RANGE_WORDS: Record<Range, {heatTitle: MessageKey; outNote: MessageKey}> = {
  day: {heatTitle: 'climate.heatTitle.day', outNote: 'climate.outNote.fiveMinute'},
  week: {heatTitle: 'climate.heatTitle.week', outNote: 'climate.outNote.hourly'},
  month: {heatTitle: 'climate.heatTitle.month', outNote: 'climate.outNote.hourly'},
  year: {heatTitle: 'climate.heatTitle.year', outNote: 'climate.outNote.daily'},
};

// ---------- the options ----------

/** What the charts take from the page's tokens: the room's line (`--c-wh`), the outside's (`--c-home`), the setpoint's (`--fg2`) and the heatmap's cell borders (`--card`). */
export interface ClimateTokens {
  room: string;
  outside: string;
  setpoint: string;
  card: string;
}

export interface ClimateChartDeps {
  fmt: Formatters;
  t: Translate;
  tokens: ClimateTokens;
  /** The instant the axis ends at, in milliseconds: passed in, never read. */
  now: number;
  /** A narrow screen (under 600 pixels): fewer labels on the heatmap's axis. */
  compact: boolean;
}

/** A room's row of the heatmap. */
export interface HeatRow {
  name: string;
  cells: readonly HeatCell[];
}

/**
 * The heatmap's options, without the theme: a row per room (the caller orders them), the 0.1 degree colour scale, cells that are rounder and
 * borders that are thinner where there are many (a week, a year), and an axis that writes a label for some cells: the first block of a week's days,
 * every third or sixth hour of a day, a thinned few of a month or a year.
 */
export function heatmapOptions(
  rows: readonly HeatRow[],
  range: Range,
  stops: HeatStops,
  {fmt, tokens, compact}: Pick<ClimateChartDeps, 'fmt' | 'tokens' | 'compact'>,
): ChartOptions {
  const dense = range === 'week' || range === 'year';
  const first = rows[0]?.cells ?? [];
  const labels = first.map(cell => cell.label);
  const axis = new Map(first.map(cell => [cell.label, cell.axis]));
  const everyHour = compact ? 6 : 3;
  const kept = new Set(labels.filter((_label, index) => index % everyHour === 0));
  const own: ChartOptions = {
    chart: {type: 'heatmap'},
    series: rows.map(({name, cells}) => ({
      name,
      data: cells.map(cell => ({x: cell.label, y: cell.value, k: cell.key})),
    })),
    plotOptions: {heatmap: {radius: dense ? 2 : 4, enableShades: false, colorScale: {ranges: heatRanges(stops)}}},
    stroke: {width: dense ? 1 : 2, colors: [tokens.card]},
    legend: {show: false},
    tooltip: {y: {formatter: (value: number | null) => celsius(fmt, value)}},
  };
  const thinned = mergeOptions(own, thinCategories(labels, 4, RANGES[range].ticks, compact));
  if (range === 'week')
    return mergeOptions(thinned, {xaxis: {labels: {formatter: (label: string) => axis.get(label) ?? ''}}});
  if (range === 'day')
    return mergeOptions(thinned, {
      xaxis: {labels: {formatter: (label: string) => (kept.has(label) ? (axis.get(label) ?? '') : '')}},
    });
  return thinned;
}

/** What a room's chart draws: its line, its setpoint's, the outside's, and whether it is the heat pump's. */
export interface RoomLines {
  /** The line's name: the room's, the heat pump's or the house average. */
  name: string;
  points: readonly Reading[];
  /** Empty when the selection has none (the house). */
  setpoints: readonly SetpointPoint[];
  outside: readonly Reading[];
  heatPump: boolean;
}

/** The two columns a chart draws of a reading. */
const plain = (points: readonly Reading[]) => points.map(([at, value]) => [at, value]);

/**
 * The options of the detail's chart, without the theme: the room's line, the thermostat's setpoint stepped and dashed when it has one, and the outside's. The
 * curve is straight for the heat pump, `monotoneCubic` with a setpoint (ApexCharts splits a `smooth` line once any series has a gap) and `smooth` otherwise.
 */
export function roomChartOptions(
  {name, points, setpoints, outside, heatPump}: RoomLines,
  range: Range,
  {fmt, t, tokens, now}: Pick<ClimateChartDeps, 'fmt' | 't' | 'tokens' | 'now'>,
): ChartOptions {
  const hasSetpoint = setpoints.some(([, value]) => value != null);
  const curve = heatPump ? 'straight' : hasSetpoint ? 'monotoneCubic' : 'smooth';
  return {
    chart: {type: 'line'},
    series: [
      {name, data: plain(points)},
      ...(hasSetpoint ? [{name: t('climate.chart.setpoint'), data: setpoints}] : []),
      {name: t('climate.chart.outside'), data: plain(outside)},
    ],
    colors: [tokens.room, ...(hasSetpoint ? [tokens.setpoint] : []), tokens.outside],
    stroke: hasSetpoint
      ? {width: [2.2, 2, 2.2], curve: [curve, 'stepline', curve], dashArray: [0, 5, 0]}
      : {width: 2.2, curve},
    xaxis: timeAxis(RANGES[range].days, now),
    yaxis: {labels: {formatter: (value: number | null) => (value == null ? '' : degrees(fmt, value))}},
    tooltip: {
      shared: true,
      x: {format: RANGES[range].tooltipFormat},
      y: {formatter: (value: number | null) => celsius(fmt, value)},
    },
  };
}

/** The outside chart's tooltip value: a band is "low to high", a mean one figure. */
const outsideValue = (fmt: Formatters, t: Translate, value: number | number[] | null): string =>
  Array.isArray(value)
    ? t('climate.chart.span', {low: fmt.fixed(+value[0], 1), high: fmt.fixed(+value[1], 1)})
    : celsius(fmt, value);

/** The outside chart's options, without the theme: a band from each bucket's low to its high (a bucket without both is left out of it) and the mean's line over it. */
export function outsideChartOptions(
  out: readonly RangePoint[],
  range: Range,
  {fmt, t, tokens, now}: Pick<ClimateChartDeps, 'fmt' | 't' | 'tokens' | 'now'>,
): ChartOptions {
  const band = out.filter((point): point is [number, number, number, number] => point[2] != null && point[3] != null);
  return {
    chart: {type: 'rangeArea'},
    series: [
      {
        name: t('climate.chart.lowToHigh'),
        type: 'rangeArea',
        data: band.map(([at, , low, high]) => ({x: at, y: [low, high]})),
      },
      {name: t(RANGES[range].meanKey), type: 'line', data: out.map(([at, mean]) => ({x: at, y: mean}))},
    ],
    colors: [tokens.outside, tokens.outside],
    fill: {opacity: [0.22, 1]},
    stroke: {width: [0, 2], curve: 'smooth'},
    xaxis: timeAxis(RANGES[range].days, now),
    yaxis: {labels: {formatter: (value: number) => degrees(fmt, value)}},
    tooltip: {
      shared: true,
      x: {format: RANGES[range].tooltipFormat},
      y: {formatter: (value: number | number[] | null) => outsideValue(fmt, t, value)},
    },
  };
}
