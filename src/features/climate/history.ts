// Climate's history as pure functions: the window it asks, the replies in, the series, the heating kWh and bars, the heatmap's cells and heat scale, and the three charts' options out.
// Pattern: functional core (Bernhardt, Boundaries), the data half of a humble object (Meszaros), after Air's and Energy's history; each rule is the legacy panel's own
// (`loadClimRange`, `houseSeries`, `bucket`, `heatColor`, `climateSheet`, `climateDetail`, deleted in #246) and options are plain data (ADR 0022): `fmt` and `t` are arguments.
// The callers are the loader (the window and the derivation), the model (the figures) and `ClimateCharts` (the options); its heat scale's stops are the only colours it owns.
// Must not: call the API client or the cache, read the clock, the DOM or a viewport (`now` and `compact` are passed in), or pick a colour but the heat scale's (every other is a token).
import {oklabBlend} from '../../core/color.ts';
import type {ResolvedConfig} from '../../core/config.ts';
import {DAY_MS, HOUR_MS, hundredths} from '../../core/figures.ts';
import type {HistoryPoint, StatisticRow} from '../../core/ha.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {degrees, noonOf, power, utcNoonOf, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import {hpSeries, NO_TARGET_MODES} from '../../providers/heat-pump.ts';
import {HEATING_KW, OFF_AT_OR_BELOW} from '../../providers/power.ts';
import {sum, windowStart, type StatisticsWindow, type StatsReply} from '../../providers/power-history.ts';
import {celsius, mergeOptions, timeAxis, tooltipDate, type ChartOptions} from '../../ui/chart-options.ts';
import {bucketMiddle, RANGES, type Range, type StatisticsPeriod} from '../../ui/ranges.ts';
import {thinCategories} from '../../ui/thin-axis.ts';

// ---------- the window ----------

/** The statistics the rooms' charts ask of the recorder: the mean, and the low and high of each bucket. */
const TYPES = ['mean', 'min', 'max'];

/**
 * What a range asks the recorder for in one call: every room's temperature, setpoint and power, and the outside temperature. It starts at the
 * top of the hour a range back, so a second request within the hour is the shared cache's hit (ADR 0028); the axis still begins at `now` less the range.
 * Read by the loader.
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

/** The mean, low and high of each row of `id` at the middle of its bucket, two decimals; a row with no mean is skipped. Read by `deriveClimateHistory` for the rooms and the outside. */
export function rangeSeries(stats: StatsReply, id: string | null | undefined, range: Range): RangePoint[] {
  const offset = bucketMiddle(range);
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
 * off (its lowest above the cut-off) shows its mean, and one partly off shows its highest setpoint. A row with no setpoint at all is skipped. Read by `deriveClimateHistory`.
 */
export function setpointSeries(stats: StatsReply, id: string | null | undefined, range: Range): SetpointPoint[] {
  const offset = bucketMiddle(range);
  return rowsOf(stats, id).flatMap(({start, mean, min, max}) => {
    if (max == null) return [];
    const holding = min != null && min > OFF_AT_OR_BELOW && mean != null;
    return [[start + offset, max <= OFF_AT_OR_BELOW ? null : hundredths(holding ? mean : max)] as SetpointPoint];
  });
}

/** How many hours a statistics period spans. */
const PERIOD_HOURS: Record<StatisticsPeriod, number> = {'5minute': 1 / 12, hour: 1, day: 24};

/** A heating bar: milliseconds at the middle of its bucket, and the bucket's figure (a baseboard's mean kW, or the heat pump's whole percent of the bucket spent heating). */
export type HeatingBar = readonly [at: number, value: number];

/** The baseboard's mean kW of each row of `id` at the middle of its bucket, two decimals; a row with no mean, or a mean at or under `HEATING_KW`, draws no bar. Read by `deriveClimateHistory` for each room. */
export function heatingBars(stats: StatsReply, id: string | null | undefined, range: Range): HeatingBar[] {
  const offset = bucketMiddle(range);
  return rowsOf(stats, id).flatMap(({start, mean}) =>
    mean == null || mean <= HEATING_KW ? [] : [[start + offset, hundredths(mean)] as HeatingBar],
  );
}

/**
 * The share of each bucket the heat pump spent heating, in whole percent at the middle of the bucket (buckets of `bucketMs` counted from `start`): a point holds
 * from its `lastUpdated` to the next point's (the last one to `end`) and counts when it is not `unavailable` and its `hvac_action` is `heating`. What lies outside
 * `[start, end)` is clipped, so the running bucket counts only up to `end`; a bucket with no heating draws no bar. Read by `deriveClimateHistory`.
 */
export function heatingShare(
  points: readonly HistoryPoint[],
  start: number,
  end: number,
  bucketMs: number,
): HeatingBar[] {
  const heating = new Map<number, number>();
  points.forEach((point, index) => {
    if (point.state === 'unavailable' || point.attributes?.hvac_action !== 'heating') return;
    const until = Math.min(end, points[index + 1]?.lastUpdated ?? end);
    for (let at = Math.max(start, point.lastUpdated); at < until;) {
      const bucketIndex = Math.floor((at - start) / bucketMs);
      const next = Math.min(until, start + (bucketIndex + 1) * bucketMs);
      heating.set(bucketIndex, (heating.get(bucketIndex) ?? 0) + next - at);
      at = next;
    }
  });
  return [...heating]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([bucketIndex, ms]) => {
      const percent = Math.round((ms / bucketMs) * 100);
      return percent > 0 ? [[start + bucketIndex * bucketMs + bucketMs / 2, percent] as HeatingBar] : [];
    });
}

/** The heating of one power sensor over the rows, in kWh: each period's mean kW times its hours, and the running period counts only the hours so far. Read by `deriveClimateHistory` for each room's figure. */
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

/** The mean of the rooms at each instant every room has a reading for: a bucket missing a room is dropped. `roomCount` is the house's, so a room with no rows drops them all. Read by `selectedSeries` for the house line. */
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

// ---------- what a range's load comes to ----------

/** What a range's load brought back: the statistics of the window, and the heat pump's state history (empty when the house has none or it failed to read). */
export interface ClimateReplies {
  statistics: StatsReply;
  history: Readonly<Record<string, readonly HistoryPoint[]>>;
}

/** A heat pump's line: its readings by the instant they were reported, a null breaking the line. */
export type HeatPumpLine = [at: number, value: number | null][];

/** One range's history, derived once per load: every room's series, the outside, the heat pump's lines, and what the tiles read off them. */
export interface ClimateHistoryData {
  range: Range;
  /** The instant the load was asked at, milliseconds: the axis ends there, and the loader's ten minutes count from it. */
  at: number;
  /** The top of the hour the window starts at; the heat pump's history is told to start late when it begins more than a day after it. */
  start: number;
  /** Each room's temperature by the room's key, the mean with its low and high. */
  rooms: Record<string, RangePoint[]>;
  /** Each room's setpoint by the room's key. */
  sp: Record<string, SetpointPoint[]>;
  /** The heating of each room over the range, in kWh. */
  kwh: Record<string, number>;
  /** Each room's baseboard as bars: its mean kW per bucket, none for a bucket at or under `HEATING_KW`. */
  heat: Record<string, HeatingBar[]>;
  out: RangePoint[];
  hp: HeatPumpLine;
  /** The heat pump's target, a gap in the modes that have none (`off`, `fan_only`, `dry`). */
  hpSp: HeatPumpLine;
  /** The instant the heat pump's line starts; null without one. */
  hpFrom: number | null;
  /** The share of each bucket the heat pump spent heating, in whole percent. */
  hpHeat: HeatingBar[];
}

/** A reading that is a number: an attribute the unit reports as anything else is no reading. */
const numeric = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The rows and the state history a load brought back, as one range's data: the legacy `loadClimRange`'s result, with `start` the window's. */
export function deriveClimateHistory(
  replies: ClimateReplies,
  range: Range,
  config: Pick<ResolvedConfig, 'entities' | 'rooms'>,
  at: number,
  start: number,
): ClimateHistoryData {
  const {statistics, history} = replies;
  const {period} = RANGES[range];
  const rooms: ClimateHistoryData['rooms'] = {};
  const sp: ClimateHistoryData['sp'] = {};
  const kwh: ClimateHistoryData['kwh'] = {};
  const heat: ClimateHistoryData['heat'] = {};
  for (const room of config.rooms) {
    rooms[room.k] = rangeSeries(statistics, room.temp, range);
    sp[room.k] = setpointSeries(statistics, room.target, range);
    kwh[room.k] = heatingKwh(statistics, room.power, period, at);
    heat[room.k] = heatingBars(statistics, room.power, range);
  }
  const points = (config.entities.hp && history[config.entities.hp]) || [];
  const hp = hpSeries(points, attributes => numeric(attributes.current_temperature));
  return {
    range,
    at,
    start,
    rooms,
    sp,
    kwh,
    heat,
    out: rangeSeries(statistics, config.entities.outT, range),
    hp,
    hpSp: hpSeries(points, (attributes, state) =>
      NO_TARGET_MODES.has(state) ? null : numeric(attributes.temperature),
    ),
    hpFrom: hp.length ? hp[0][0] : null,
    hpHeat: heatingShare(points, start, at, RANGES[range].bucketMs),
  };
}

/** What the detail's chart draws of a selection: its line, its setpoint's and the bars of when the heating ran. */
export interface SelectedSeries {
  points: readonly Reading[];
  /** Empty for the house, which has no setpoint. */
  setpoints: readonly SetpointPoint[];
  /** The bars under the line: kW for a room (the house's is the rooms' sum), the share of each bucket for the heat pump; empty when nothing heated. */
  heating: {unit: 'kw' | 'share'; bars: readonly HeatingBar[]};
}

/** The rooms' kW added at each bucket, two decimals: a room with no bar at a bucket counts as 0 there (unlike `houseSeries`, whose mean drops it). Read by `selectedSeries` for the house. */
export function houseHeating(roomBars: readonly (readonly HeatingBar[])[]): HeatingBar[] {
  const byTime = new Map<number, number>();
  for (const bars of roomBars) for (const [at, kw] of bars) byTime.set(at, (byTime.get(at) ?? 0) + kw);
  return [...byTime].sort((a, b) => a[0] - b[0]).map(([at, kw]) => [at, hundredths(kw)]);
}

/** The line a selection draws: the heat pump's, the house's (the mean of the rooms), or a room's, with its setpoint. */
export function selectedSeries(
  data: ClimateHistoryData,
  selection: string,
  roomKeys: readonly string[],
): SelectedSeries {
  if (selection === 'hp') return {points: data.hp, setpoints: data.hpSp, heating: {unit: 'share', bars: data.hpHeat}};
  if (selection === 'house')
    return {
      points: houseSeries(
        roomKeys.map(key => data.rooms[key] ?? []),
        roomKeys.length,
      ),
      setpoints: [],
      heating: {unit: 'kw', bars: houseHeating(roomKeys.map(key => data.heat[key] ?? []))},
    };
  return {
    points: data.rooms[selection] ?? [],
    setpoints: data.sp[selection] ?? [],
    heating: {unit: 'kw', bars: data.heat[selection] ?? []},
  };
}

/** The heating over the range of a selection, in kWh: the house's total or a room's own; null for the heat pump, which has no power sensor. */
export function selectedKwh(data: ClimateHistoryData, selection: string): number | null {
  if (selection === 'hp') return null;
  return selection === 'house' ? sum(Object.values(data.kwh)) : (data.kwh[selection] ?? null);
}

/** The first instant of the heat pump's line when it starts more than a day after the range does (the recorder keeps about ten days of its history); null otherwise. */
export function lateHeatPumpStart(data: ClimateHistoryData): number | null {
  return data.hpFrom !== null && data.hpFrom > data.start + DAY_MS ? data.hpFrom : null;
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
  const noon = utcNoonOf(day);
  return new Date(noon - ((new Date(noon).getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
};

/** A cell without its value: what names it, from the house's local day and hour. */
type CellName = Omit<HeatCell, 'value'>;

/** What the time axis writes under the heatmap's cells, from each label's `axis` text, the labels in order, and the screen's width; absent, the thinned labels stand. */
type AxisWriter = (
  axis: ReadonlyMap<string, string>,
  labels: readonly string[],
  compact: boolean,
) => (label: string) => string;

/** A day cell: `axis` names the day as a month or a year names it. */
const dayCell = (key: string, fmt: BucketDeps['fmt']): CellName => ({key, label: fmt.date(noonOf(key, fmt)), axis: ''});

/** How each range lays the heatmap out: the cell a reading falls in, whether the cells are many (rounder, thinner borders), and what the axis writes. */
interface HeatLayout {
  /** Many cells (a week's blocks, a year's weeks): rounder cells and thinner borders. */
  dense: boolean;
  cell: (at: number, deps: BucketDeps) => CellName;
  axis?: AxisWriter;
}

/** The layouts by range: one table, not four branches (`RANGES` holds what every reader of a range needs; this is the heatmap's own). */
const LAYOUTS: Record<Range, HeatLayout> = {
  day: {
    dense: false,
    cell: (at, {fmt}) => {
      const {day, h, wd} = fmt.dayParts(at);
      const hour = fmt.hour(at);
      return {key: `${day} ${String(h).padStart(2, '0')}`, label: `${wd}, ${hour}`, axis: hour};
    },
    // every third hour, every sixth on a phone
    axis: (axis, labels, compact) => {
      const everyHour = compact ? 6 : 3;
      const kept = new Set(labels.filter((_label, index) => index % everyHour === 0));
      return label => (kept.has(label) ? (axis.get(label) ?? '') : '');
    },
  },
  week: {
    dense: true,
    cell: (at, {fmt, t}) => {
      const {day, h, wd} = fmt.dayParts(at);
      const block = Math.floor(h / 6);
      const dayText = `${wd} ${+day.slice(8)}`;
      return {
        key: `${day} ${String(block * 6).padStart(2, '0')}`,
        label: t(BLOCKS[block], {day: dayText}),
        axis: block === 0 ? dayText : '',
      };
    },
    // the day under its first block
    axis: axis => label => axis.get(label) ?? '',
  },
  month: {dense: false, cell: (at, {fmt}) => dayCell(fmt.dayParts(at).day, fmt)},
  year: {dense: true, cell: (at, {fmt}) => dayCell(mondayOf(fmt.dayParts(at).day), fmt)},
};

/** Group a series into heatmap cells: hours for a day, six-hour blocks for a week, days for a month and weeks (Monday first) for a year; a gap is skipped. Read by `ClimateCharts`. */
export function bucket(points: readonly Reading[], range: Range, deps: BucketDeps): HeatCell[] {
  const cells = new Map<string, {cell: CellName; total: number; count: number}>();
  for (const [at, value] of points) {
    if (value == null) continue;
    const {key, ...rest} = LAYOUTS[range].cell(at, deps);
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

/** The scale's ends, in degrees: a temperature outside them takes the end's colour. Both scales' first and last stops; read by `heatLegend`. */
export const HEAT_LO = 17;
export const HEAT_HI = 26;

/** A temperature scale: `[°C, colour]` stops, lowest first, blended between in OKLab; a temperature past either end takes the end's colour. */
export type HeatStops = readonly (readonly [number, string])[];

/** Blue (cool) through a neutral 21 to 22° to red (warm); each step was checked for colour-blind separation. The legacy `HEAT_LIGHT` and `HEAT_DARK`. */
const HEAT_LIGHT: HeatStops = [
  [HEAT_LO, '#24467F'],
  [19, '#3F7DBF'],
  [20.5, '#8DBAD8'],
  [21.5, '#E6D9A2'],
  [23, '#EE9A52'],
  [24.5, '#CF592B'],
  [HEAT_HI, '#87210F'],
];
const HEAT_DARK: HeatStops = [
  [HEAT_LO, '#3561A8'],
  [19, '#4F8BCB'],
  [20.5, '#8FBAD6'],
  [21.5, '#D9C98E'],
  [23, '#EE9A52'],
  [24.5, '#D4602F'],
  [HEAT_HI, '#9A2C17'],
];

/** The stops of the theme's scale. Read by `<hp-heat-legend>` and `ClimateCharts`, which hand them to `heatLegend` and `heatmapOptions`. */
export const heatScale = (dark: boolean): HeatStops => (dark ? HEAT_DARK : HEAT_LIGHT);

/** The ends of a scale: its first and last stops' degrees. */
const endsOf = (stops: HeatStops): [lo: number, hi: number] => [stops[0][0], stops[stops.length - 1][0]];

/** The colour of a temperature: the two stops around it, blended in OKLab; below the scale the first stop, above it the last. Exported for the test, which pins the stops themselves (`heatRanges` samples between them). */
export function heatColor(temperature: number, stops: HeatStops): string {
  const [lo, hi] = endsOf(stops);
  const value = Math.min(hi, Math.max(lo, temperature));
  let upper = 1;
  while (upper < stops.length - 1 && value > stops[upper][0]) upper++;
  const [from, fromColor] = stops[upper - 1];
  const [to, toColor] = stops[upper];
  return oklabBlend(fromColor, toColor, (value - from) / (to - from));
}

/** One band of the chart's colour scale: what `heatRanges` returns. */
export interface HeatRange {
  from: number;
  to: number;
  color: string;
}

/** The scale in 0.1 degree steps, so neighbouring cells blend instead of jumping between bands; the first band reaches down and the last up, past the scale. */
export function heatRanges(stops: HeatStops): HeatRange[] {
  const [lo, hi] = endsOf(stops);
  const steps = (hi - lo) * 10;
  return Array.from({length: steps}, (_, step) => {
    const from = lo + step / 10;
    return {
      from: step ? from : -99,
      to: step === steps - 1 ? 99 : from + 0.0999,
      color: heatColor(from + 0.05, stops),
    };
  });
}

/** What `<hp-heat-legend>` draws: the bar's colours, evenly spaced, and the degrees written under it, each at its place along the bar in percent. */
export interface HeatLegend {
  colors: string[];
  ticks: {degrees: number; at: number}[];
}

/** The scale as the legend shows it: a colour for every half degree (the bar is a gradient between them) and a tick every two degrees from the first. */
export function heatLegend(stops: HeatStops): HeatLegend {
  const [lo, hi] = endsOf(stops);
  return {
    colors: Array.from({length: (hi - lo) * 2 + 1}, (_, step) => heatColor(lo + step / 2, stops)),
    ticks: Array.from({length: Math.ceil((hi - lo) / 2)}, (_, step) => ({
      degrees: lo + step * 2,
      at: ((step * 2) / (hi - lo)) * 100,
    })),
  };
}

// ---------- the words ----------

/** The words a range gives the heatmap's title, as catalog keys: Climate's own, since no other feature reads them (the kit's `RANGES` holds what every user needs). Read by the model. */
export const RANGE_WORDS: Record<Range, {heatTitle: MessageKey}> = {
  day: {heatTitle: 'climate.heatTitle.day'},
  week: {heatTitle: 'climate.heatTitle.week'},
  month: {heatTitle: 'climate.heatTitle.month'},
  year: {heatTitle: 'climate.heatTitle.year'},
};

// ---------- the options ----------

/** What the charts take from the page's tokens: the room's line (`--c-wh`) and the heating bars' (the same, muted by their opacity), the outside's (`--c-home`), the setpoint's (`--fg2`) and the heatmap's cell borders (`--card`). */
export interface ClimateTokens {
  room: string;
  heating: string;
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
 * every third or sixth hour of a day, a thinned few of a month or a year (`LAYOUTS` holds each range's rule). Read by `ClimateCharts`.
 */
export function heatmapOptions(
  rows: readonly HeatRow[],
  range: Range,
  stops: HeatStops,
  {fmt, tokens, compact}: Pick<ClimateChartDeps, 'fmt' | 'tokens' | 'compact'>,
): ChartOptions {
  const {dense, axis: writer} = LAYOUTS[range];
  const first = rows[0]?.cells ?? [];
  const labels = first.map(cell => cell.label);
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
  if (!writer) return thinned;
  const axis = new Map(first.map(cell => [cell.label, cell.axis]));
  return mergeOptions(thinned, {xaxis: {labels: {formatter: writer(axis, labels, compact)}}});
}

/** What a room's chart draws: its line, its setpoint's, the outside's, the heating bars under them, and whether it is the heat pump's. */
export interface RoomLines {
  /** The line's name: the room's, the heat pump's or the house average. */
  name: string;
  points: readonly Reading[];
  /** Empty when the selection has none (the house). */
  setpoints: readonly SetpointPoint[];
  outside: readonly Reading[];
  heating: SelectedSeries['heating'];
  heatPump: boolean;
}

/** The two columns a chart draws of a reading. */
const plain = (points: readonly Reading[]) => points.map(([at, value]) => [at, value]);

/**
 * The options of the detail's chart, without the theme: the room's line, the thermostat's setpoint stepped and dashed when it has one, and the outside's. The
 * curve is straight for the heat pump, `monotoneCubic` with a setpoint (ApexCharts splits a `smooth` line once any series has a gap) and `smooth` otherwise.
 * With heating bars it adds them as a muted column series on a second axis at the right (0 to the largest kW in whole kW, never under 1, or 0 to 100 %) while
 * every line shares the left axis; without bars the options are the chart's alone. Read by `ClimateCharts`.
 */
export function roomChartOptions(
  {name, points, setpoints, outside, heating, heatPump}: RoomLines,
  range: Range,
  {fmt, t, tokens, now}: Pick<ClimateChartDeps, 'fmt' | 't' | 'tokens' | 'now'>,
): ChartOptions {
  const hasSetpoint = setpoints.some(([, value]) => value != null);
  const curve = heatPump ? 'straight' : hasSetpoint ? 'monotoneCubic' : 'smooth';
  const lines = [
    {name, data: plain(points)},
    ...(hasSetpoint ? [{name: t('climate.chart.setpoint'), data: setpoints}] : []),
    {name: t('climate.chart.outside'), data: plain(outside)},
  ];
  const colors = [tokens.room, ...(hasSetpoint ? [tokens.setpoint] : []), tokens.outside];
  const degreeLabel = (value: number | null) => (value == null ? '' : degrees(fmt, value));
  const own: ChartOptions = {
    chart: {type: 'line'},
    series: lines,
    colors,
    stroke: hasSetpoint
      ? {width: [2.2, 2, 2.2], curve: [curve, 'stepline', curve], dashArray: [0, 5, 0]}
      : {width: 2.2, curve},
    xaxis: timeAxis(RANGES[range].days, now, fmt),
    yaxis: {labels: {formatter: degreeLabel}},
    tooltip: {
      shared: true,
      x: {formatter: tooltipDate(RANGES[range].tooltip, fmt)},
      y: {formatter: (value: number | null) => celsius(fmt, value)},
    },
  };
  const {unit, bars} = heating;
  if (!bars.length) return own;
  const share = unit === 'share';
  const barLabel = (value: number | null): string =>
    value == null ? '' : share ? `${fmt.integer(value)} %` : power(fmt, value * 1000);
  const stepped = (index: number): boolean => hasSetpoint && index === 1;
  return mergeOptions(own, {
    series: [
      ...lines.map(line => ({...line, type: 'line'})),
      {name: t(share ? 'climate.chart.heatingTime' : 'climate.chart.heating'), type: 'column', data: bars},
    ],
    colors: [...colors, tokens.heating],
    // a width that is a number, not an array, would draw a border around the columns
    stroke: {
      width: [...lines.map((_, index) => (stepped(index) ? 2 : 2.2)), 0],
      curve: [...lines.map((_, index) => (stepped(index) ? 'stepline' : curve)), 'straight'],
      dashArray: [...lines.map((_, index) => (stepped(index) ? 5 : 0)), 0],
    },
    fill: {opacity: [...lines.map(() => 1), 0.35]},
    plotOptions: {bar: {columnWidth: '80%'}},
    // every temperature line names the room's, so ApexCharts gives them one scale; only the first writes its labels
    yaxis: [
      ...lines.map((_, index) => ({seriesName: name, show: index === 0, labels: {formatter: degreeLabel}})),
      {
        opposite: true,
        min: 0,
        max: share ? 100 : Math.max(1, Math.ceil(Math.max(...bars.map(([, kw]) => kw)))),
        tickAmount: 2,
        labels: {formatter: barLabel},
      },
    ],
    tooltip: {
      y: [...lines.map(() => ({formatter: (value: number | null) => celsius(fmt, value)})), {formatter: barLabel}],
    },
  });
}
