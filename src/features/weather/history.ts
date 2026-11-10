// Weather's history as pure functions: the API client's rows in, the series, the months, the records and the chart options out.
// Pattern: functional core (Bernhardt, Boundaries), the data half of a humble object (Meszaros): each rule is the legacy
// panel's own (loadWxHistory, renderSeason, loadWx, wxSheet, all deleted with the history sheet) and the elements only place what comes out.
// Numbers come back as numbers, except in the season view and the chart callbacks, which take `fmt`, `t` and `now` as arguments.
// Must not: call the API client or the cache, read the clock or the DOM, or pick a colour of its own (every colour is a caller's
// token; `transparent` is the absence of one, and the sizes are the legacy options' constants).
import type {EntityKey} from '../../core/entities.ts';
import {capitalise, DASH, DAY_MS, HOUR_MS} from '../../core/figures.ts';
import type {HistoryPoint, StatisticRow} from '../../core/ha.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {degrees, whole, type Formatters} from '../../core/i18n/format.ts';
import type {Messages} from '../../core/i18n/messages.ts';
import {RANGES, type Range} from '../../ui/ranges.ts';
import type {HourSeries} from './model.ts';
import {tileDefinition, type StatTileDefinition, type Tone} from './tiles.ts';

type Translate = Messages['t'];

/** A point of a chart: milliseconds and a value. */
export type Point = [number, number];

/** A day's statistic is dated at noon of that day, so that its local day is the same in every time zone. */
const NOON_MS = 12 * 36e5;
/** A night is a frost night when its low is below this many degrees. */
export const FROST_BELOW = 0;
/** A day is a hot day when its high reaches this many degrees. */
export const HOT_FROM = 25;

/** A reading as the legacy panel stored it: two digits at most. */
const rounded = (value: number) => +value.toFixed(2);

/** A statistic of each row as `[ms, value]`, the row's start moved by `offsetMs`; the rows without it are skipped. */
const statisticPoints = (rows: readonly StatisticRow[], statistic: 'mean' | 'max', offsetMs: number): Point[] =>
  rows.flatMap(row => {
    const value = row[statistic];
    return value == null ? [] : [[row.start + offsetMs, rounded(value)] as Point];
  });

/** Where a value falls on a scale that starts at `low` and is `span` wide, in percent. */
const percentOn = (low: number, span: number) => (value: number) => ((value - low) / span) * 100;

// ---------- the seven days ----------

/** The entity ids of the seven-day charts' series; null for what the house does not have. */
export interface SevenDayIds {
  temperature: string | null;
  dewPoint: string | null;
  humidity: string | null;
  pressure: string | null;
  wind: string | null;
  gusts: string | null;
}

export type SevenDaySeries = Record<keyof SevenDayIds, Point[]>;

/** The hourly statistics as `[ms, value]` series: the mean of each hour, and the highest of each hour for the gusts; hours with no value are skipped. */
export function sevenDaySeries(
  rows: Readonly<Record<string, readonly StatisticRow[]>>,
  ids: SevenDayIds,
): SevenDaySeries {
  const series = (id: string | null, statistic: 'mean' | 'max' = 'mean'): Point[] =>
    statisticPoints(id ? (rows[id] ?? []) : [], statistic, 0);
  return {
    temperature: series(ids.temperature),
    dewPoint: series(ids.dewPoint),
    humidity: series(ids.humidity),
    pressure: series(ids.pressure),
    wind: series(ids.wind),
    gusts: series(ids.gusts, 'max'),
  };
}

// ---------- the season ----------

/** One day of the daily statistics. */
interface Day {
  at: number;
  mean: number;
  min: number;
  max: number;
}

/**
 * The days that have a mean. The recorder sends the mean, the low and the high of a day or none of them, so a day with a mean has
 * all three; one that lacked a low or a high would read it as 0°, as the legacy panel did (`Math.min(x, null)`).
 */
const temperatureDays = (rows: readonly StatisticRow[]): Day[] =>
  rows.flatMap(row =>
    row.mean == null ? [] : [{at: row.start + NOON_MS, mean: row.mean, min: row.min ?? 0, max: row.max ?? 0}],
  );

/** One calendar month of the record. */
export interface SeasonMonth {
  /** `2026-11`, the month in the house's zone. */
  key: string;
  /** The first day of the month that the record covers, at noon: format it with `fmt.month` or `fmt.date`. */
  at: number;
  /** That day's number in the month: 1 for a whole month, more for the month the record began in. */
  firstDay: number;
  /** The days counted. */
  count: number;
  /** The mean of the daily means. */
  mean: number;
  low: number;
  high: number;
  frostNights: number;
  hotDays: number;
}

/** The daily statistics grouped by month, oldest first; `isoDay` names a day in the house's zone (`fmt.isoDay`). */
export function seasonMonths(dayRows: readonly StatisticRow[], isoDay: (ms: number) => string): SeasonMonth[] {
  const months = new Map<string, SeasonMonth & {total: number}>();
  for (const day of temperatureDays(dayRows)) {
    const iso = isoDay(day.at);
    const key = iso.slice(0, 7);
    let month = months.get(key);
    if (!month) {
      month = {
        key,
        at: day.at,
        firstDay: Number(iso.slice(8)),
        count: 0,
        total: 0,
        mean: 0,
        low: Infinity,
        high: -Infinity,
        frostNights: 0,
        hotDays: 0,
      };
      months.set(key, month);
    }
    month.count++;
    month.total += day.mean;
    month.low = Math.min(month.low, day.min);
    month.high = Math.max(month.high, day.max);
    if (day.min < FROST_BELOW) month.frostNights++;
    if (day.max >= HOT_FROM) month.hotDays++;
  }
  return [...months.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map(({total, ...month}) => ({...month, mean: total / month.count}));
}

/** A figure and the day it was reached, at noon. */
export interface DayValue {
  at: number;
  value: number;
}

export interface SeasonRecords {
  warmest: DayValue;
  coldest: DayValue;
  gust: DayValue | null;
}

/** The warmest high, the coldest low and the strongest gust of the record, each with its day; the first of equals wins. Null for no days. */
export function records(dayRows: readonly StatisticRow[], gustRows: readonly StatisticRow[]): SeasonRecords | null {
  const days = temperatureDays(dayRows);
  if (!days.length) return null;
  const warmest = days.reduce((best, day) => (day.max > best.max ? day : best));
  const coldest = days.reduce((best, day) => (day.min < best.min ? day : best));
  const gusts = gustRows.flatMap(row => (row.max == null ? [] : [{at: row.start + NOON_MS, value: row.max}]));
  return {
    warmest: {at: warmest.at, value: warmest.max},
    coldest: {at: coldest.at, value: coldest.min},
    gust: gusts.length ? gusts.reduce((best, gust) => (gust.value > best.value ? gust : best)) : null,
  };
}

export interface SeasonDeps {
  fmt: Formatters;
  t: Translate;
  /** The instant the view is read at, in milliseconds: passed in, never read. */
  now: number;
}

/** One of the four tiles above the months. */
export interface SeasonTile {
  label: string;
  value: string;
  unit: string;
  sub: string;
}

/** One month's row: its words, and its bar on the scale shared by all the months, in percent. */
export interface SeasonRow {
  key: string;
  name: string;
  /** "from 5" for the month the record began in, else null. */
  from: string | null;
  low: string;
  high: string;
  /** The frost nights, else the hot days, else nothing. */
  note: string;
  /** What the average dot says when hovered. */
  title: string;
  barLeft: number;
  barWidth: number;
  averageAt: number;
}

export interface SeasonView {
  /** The sentence above the months. */
  since: string;
  tiles: SeasonTile[];
  rows: SeasonRow[];
  /** Where 0° falls on the scale in percent, or null when it is off it. */
  freezingAt: number | null;
  /** The scale: the coldest low and the width up to the warmest high, for `seasonTicks`. */
  low: number;
  span: number;
}

/** The unit the gust record is in: the wind tile's, once. */
const GUST_UNIT = tileDefinition('wind').series.find(series => series.stat === 'max')!.unit;

/** What the season block says: the record tiles, the sentence and a row a month. Null while there are no days. */
export function seasonView(
  dayRows: readonly StatisticRow[],
  gustRows: readonly StatisticRow[],
  {fmt, t, now}: SeasonDeps,
): SeasonView | null {
  const best = records(dayRows, gustRows);
  if (!best) return null;
  const months = seasonMonths(dayRows, ms => fmt.isoDay(ms));
  const low = Math.min(...months.map(month => month.low));
  const high = Math.max(...months.map(month => month.high));
  const span = high - low || 1;
  const percent = percentOn(low, span);
  const current = months.find(month => month.key === fmt.isoDay(now).slice(0, 7));
  const tile = (label: string, value: string, unit: string, sub: string): SeasonTile => ({label, value, unit, sub});
  const freezingAt = percent(0);
  return {
    since: t('weather.season.since', {date: fmt.date(months[0].at)}),
    tiles: [
      tile(t('weather.season.warmest'), `${fmt.fixed(best.warmest.value, 1)}°`, '', fmt.date(best.warmest.at)),
      tile(t('weather.season.coldest'), `${fmt.fixed(best.coldest.value, 1)}°`, '', fmt.date(best.coldest.at)),
      tile(
        capitalise(fmt.month(now, 'long')),
        current ? `${fmt.fixed(current.mean, 1)}°` : DASH,
        '',
        current ? t('weather.season.average', {n: current.frostNights}) : '',
      ),
      tile(
        t('weather.season.gust'),
        best.gust ? whole(fmt, best.gust.value) : DASH,
        GUST_UNIT,
        best.gust ? fmt.date(best.gust.at) : '',
      ),
    ],
    rows: months.map(month => ({
      key: month.key,
      name: t('weather.season.month', {month: capitalise(fmt.month(month.at, 'short')), year: month.key.slice(2, 4)}),
      from: month.firstDay > 1 ? t('weather.season.from', {day: month.firstDay}) : null,
      low: degrees(fmt, month.low),
      high: degrees(fmt, month.high),
      note: month.frostNights
        ? t('weather.season.frost', {n: month.frostNights})
        : month.hotDays
          ? t('weather.season.hot', {n: month.hotDays, limit: HOT_FROM})
          : '',
      title: t('weather.season.averageTitle', {mean: fmt.fixed(month.mean, 1)}),
      barLeft: percent(month.low),
      barWidth: Math.max(2, ((month.high - month.low) / span) * 100),
      averageAt: percent(month.mean),
    })),
    freezingAt: freezingAt > 0 && freezingAt < 100 ? freezingAt : null,
    low,
    span,
  };
}

/** The degrees marked under the bars: the multiples of `step` between -40 and 40 that the scale reaches, each at its place in percent. */
export function seasonTicks({low, span}: Pick<SeasonView, 'low' | 'span'>, step: number) {
  const percent = percentOn(low, span);
  return [-40, -30, -20, -10, 0, 10, 20, 30, 40]
    .filter(value => value % step === 0 && value >= low && value <= low + span)
    .map(value => ({value, at: percent(value)}));
}

// ---------- the detail's charts ----------

/**
 * The start the detail asks the statistics from: the top of the hour, `days` back. A start that moves with the clock is a new call to the
 * cache (it keys on the exact start), so every request of one hour carries the same one and the next opening of the detail is a hit.
 */
export const statisticsStart = (now: number, days: number): Date =>
  new Date(Math.floor(now / HOUR_MS) * HOUR_MS - days * DAY_MS);

/** How long the statistics stay fresh: the legacy panel's fifteen minutes. The pane's cache and the detail's refresh both read it. */
export const STATISTICS_TTL_MS = 15 * 60_000;

/** How long a tile's history stays fresh in the cache: the ten minutes the legacy sheet kept it. */
export const HISTORY_TTL_MS = 10 * 60_000;

/** How far back the seven-day charts reach. */
export const WEEK_DAYS = 7;
/** How far back the season reaches: every month since the records began, within the recorder's year and more. */
export const SEASON_DAYS = 400;

/** What the detail's charts take from the page's tokens: the line colours (`--c-wh`, `--c-home`, `--m-purple`) and the muted text (`--fg3`). */
export interface DetailTokens {
  warm: string;
  cool: string;
  purple: string;
  muted: string;
}

export interface DetailChartDeps {
  fmt: Formatters;
  t: Translate;
  tokens: DetailTokens;
  /** The instant the seven-day axes end at, in milliseconds: passed in, never read. */
  now: number;
}

/** The options of the detail's four charts, without the theme. */
export interface DetailCharts {
  hours: Record<string, unknown>;
  temperature: Record<string, unknown>;
  wind: Record<string, unknown>;
  pressure: Record<string, unknown>;
}

/**
 * The four charts of the detail panel, each as the legacy panel drew it: the next hours (the temperature as a line, the chance of
 * rain or snow as columns), then the seven days of temperature with the dew point and the freezing line, of wind with its gusts, and of
 * pressure. Every word and figure goes through `t` and `fmt`, and a time axis names its tooltip's day and hour with `fmt` too, where the
 * legacy options spelled Apex's English 12-hour format. `<hp-chart>` merges them over its base options.
 */
export function detailChartOptions(
  hours: HourSeries,
  week: SevenDaySeries,
  {fmt, t, tokens, now}: DetailChartDeps,
): DetailCharts {
  const degreesLabel = (value: number) => degrees(fmt, value);
  const tooltipDay = {formatter: (at: number) => `${fmt.weekday(at, 'short')} ${fmt.hour(at)}`};
  const weekAxis = {type: 'datetime', min: now - WEEK_DAYS * DAY_MS, max: now, labels: {datetimeUTC: false}};
  const percent = (value: number) => t('weather.percent', {value});
  const celsius = (value: number | null) => (value == null ? DASH : `${fmt.fixed(value, 1)} °C`);
  return {
    hours: {
      chart: {type: 'line'},
      series: [
        {name: t('weather.series.temperature'), type: 'line', data: hours.temperature},
        {name: t('weather.series.chanceOfRain'), type: 'column', data: hours.pop},
      ],
      colors: [tokens.warm, tokens.cool],
      stroke: {width: [2.6, 0], curve: 'smooth'},
      fill: {opacity: [1, 0.35]},
      plotOptions: {bar: {columnWidth: '70%', borderRadius: 3}},
      xaxis: {type: 'datetime', labels: {datetimeUTC: false, formatter: (_label: string, at: number) => fmt.hour(at)}},
      yaxis: [
        {tickAmount: 3, labels: {formatter: degreesLabel}},
        {opposite: true, min: 0, max: 100, tickAmount: 2, labels: {formatter: percent}},
      ],
      tooltip: {
        shared: true,
        x: tooltipDay,
        y: {
          formatter: (value: number, options?: {seriesIndex?: number}) =>
            options?.seriesIndex === 1 ? percent(value) : celsius(+value),
        },
      },
    },
    temperature: {
      chart: {type: 'line'},
      series: [
        {name: t('weather.series.temperature'), data: week.temperature},
        {name: t('weather.series.dewPoint'), data: week.dewPoint},
      ],
      colors: [tokens.warm, tokens.cool],
      stroke: {width: [2.4, 1.6], curve: 'smooth', dashArray: [0, 4]},
      xaxis: weekAxis,
      yaxis: {tickAmount: 4, labels: {formatter: degreesLabel}},
      annotations: {
        yaxis: [
          {
            y: 0,
            borderColor: tokens.muted,
            strokeDashArray: 3,
            label: {
              text: t('weather.series.freezing'),
              position: 'right',
              textAnchor: 'end',
              offsetX: -4,
              borderWidth: 0,
              style: {background: 'transparent', color: tokens.muted, fontSize: '11px'},
            },
          },
        ],
      },
      tooltip: {shared: true, x: tooltipDay, y: {formatter: celsius}},
    },
    wind: {
      chart: {type: 'line'},
      series: [
        {name: t('weather.series.wind'), type: 'area', data: week.wind},
        {name: t('weather.series.gusts'), type: 'line', data: week.gusts},
      ],
      colors: [tokens.cool, tokens.cool],
      fill: {type: 'solid', opacity: [0.18, 1]},
      stroke: {width: [1.8, 0], curve: 'smooth'},
      markers: {size: [0, 3], strokeWidth: 0},
      xaxis: weekAxis,
      yaxis: {min: 0, tickAmount: 3, labels: {formatter: (value: number) => whole(fmt, value)}},
      tooltip: {
        shared: true,
        x: tooltipDay,
        y: {formatter: (value: number | null) => (value == null ? DASH : `${whole(fmt, value)} km/h`)},
      },
    },
    pressure: {
      chart: {type: 'line'},
      series: [{name: t('weather.series.pressure'), data: week.pressure}],
      colors: [tokens.purple],
      stroke: {width: 2, curve: 'smooth'},
      xaxis: weekAxis,
      yaxis: {tickAmount: 3, labels: {formatter: (value: number) => fmt.fixed(value, 1)}},
      tooltip: {x: tooltipDay, y: {formatter: (value: number) => `${fmt.fixed(value, 2)} kPa`}},
    },
  };
}

// ---------- one tile's history ----------

/** The ids of the sensors a house has, by config key: a series with none is left out, as a sensor Home Assistant does not know. */
export type TileIds = Partial<Record<EntityKey, string | null>>;

/** One line of a tile's chart, with its points. */
export interface TileSeriesData {
  entity: EntityKey;
  nameKey: MessageKey;
  unit: string;
  dash: boolean;
  points: Point[];
}

/** Plain history thinned to the first state of each bucket, drawn at the middle of its bucket; a state that is no number is skipped. */
function thinned(rows: readonly HistoryPoint[], bucketMs: number): Point[] {
  const points: Point[] = [];
  let last = -1;
  for (const row of rows) {
    const value = parseFloat(row.state);
    if (!Number.isFinite(value)) continue;
    const bucket = Math.floor(row.lastUpdated / bucketMs);
    if (bucket !== last) {
      points.push([bucket * bucketMs + bucketMs / 2, value]);
      last = bucket;
    }
  }
  return points;
}

/** The recorder has rows for this id: a sensor with some is drawn from them even when none holds a value, one with none from its history. */
export const hasStatistics = (statRows: Readonly<Record<string, readonly StatisticRow[]>>, id: string): boolean =>
  (statRows[id]?.length ?? 0) > 0;

/** The ids the recorder has no statistics for: the ones whose plain history to ask for. */
export const idsWithoutStatistics = (
  statRows: Readonly<Record<string, readonly StatisticRow[]>>,
  ids: readonly string[],
): string[] => ids.filter(id => !hasStatistics(statRows, id));

/**
 * The lines of a tile's chart over a range: each series from the statistics when the recorder has rows for it, else from the
 * plain history of its sensor (Environment Canada's chance, UV and AQHI sensors keep no statistics). A row is drawn at the middle of
 * its bucket, rounded to two digits, using the statistic the series names (the mean unless it asks for the maximum). The start of
 * a request is the top of the hour (it must be stable for the cache to hit), so with `now` a row or a state from before `now`
 * less the range's days is left out: the range is exactly what the legacy sheet drew.
 */
export function tileHistory(
  definition: StatTileDefinition,
  ids: TileIds,
  statRows: Readonly<Record<string, readonly StatisticRow[]>>,
  historyRows: Readonly<Record<string, readonly HistoryPoint[]>>,
  range: Range,
  now?: number,
): TileSeriesData[] {
  const {bucketMs, days} = RANGES[range];
  const from = now === undefined ? -Infinity : now - days * DAY_MS;
  return definition.series.flatMap(({entity, nameKey, unit, stat, dash = false}) => {
    const id = ids[entity];
    if (!id) return [];
    const points = hasStatistics(statRows, id)
      ? statisticPoints(
          statRows[id].filter(row => row.start >= from),
          stat ?? 'mean',
          bucketMs / 2,
        )
      : thinned(
          (historyRows[id] ?? []).filter(row => row.lastUpdated >= from),
          bucketMs,
        );
    return [{entity, nameKey, unit, dash, points}];
  });
}

/** The low, the mean and the high of one series' points. */
export interface SeriesStats {
  entity: EntityKey;
  nameKey: MessageKey;
  unit: string;
  low: number;
  mean: number;
  high: number;
}

/** The low, mean and high of each series that has points; the element formats them with the tile's digits. */
export function tileStats(series: readonly TileSeriesData[]): SeriesStats[] {
  return series
    .filter(line => line.points.length)
    .map(({entity, nameKey, unit, points}) => {
      const values = points.map(point => point[1]);
      return {
        entity,
        nameKey,
        unit,
        low: Math.min(...values),
        mean: values.reduce((total, value) => total + value, 0) / values.length,
        high: Math.max(...values),
      };
    });
}

/** What the caller reads from the page's tokens: the line colours, the colour of each band tone and the muted text colour. */
export interface ChartTokens {
  /** In the order the lines take them; they repeat after the last. */
  series: readonly string[];
  tones: Record<Tone, string>;
  muted: string;
}

export interface ChartDeps {
  fmt: Formatters;
  t: Translate;
  tokens: ChartTokens;
  /** The instant the axis ends at, in milliseconds: passed in, never read. */
  now: number;
}

/**
 * The options of a tile's chart, without the theme: a line a series, one axis when they share a unit and one a unit when they do
 * not (the second on the right), the scale's bands as shaded stretches, steps for what is announced once. `<hp-chart>` merges
 * them over its base options.
 */
export function historyChartOptions(
  definition: StatTileDefinition,
  series: readonly TileSeriesData[],
  range: Range,
  {fmt, t, tokens, now}: ChartDeps,
) {
  const {days, tooltipFormat} = RANGES[range];
  const names = series.map(line => t(line.nameKey));
  const units = [...new Set(series.map(line => line.unit))];
  const axis = (unit: string) => ({
    min: definition.min,
    max: definition.max,
    forceNiceScale: definition.max == null,
    labels: {
      formatter: (value: number) =>
        value == null ? '' : `${fmt.number(+value, definition.dec ?? 0)}${unit === '°' ? '°' : ''}`,
    },
    title: {text: unit === '°' ? '' : unit, style: {color: tokens.muted, fontWeight: 500}},
  });
  const firstOf = (unit: string) => series.findIndex(line => line.unit === unit);
  const yaxis =
    units.length === 1
      ? axis(units[0])
      : series.map((line, index) => ({
          ...axis(line.unit),
          seriesName: names[firstOf(line.unit)],
          opposite: units.indexOf(line.unit) > 0,
          show: firstOf(line.unit) === index,
        }));
  return {
    chart: {type: 'line'},
    series: series.map((line, index) => ({name: names[index], data: line.points})),
    colors: series.map((_, index) => tokens.series[index % tokens.series.length]),
    stroke: {
      width: series.map(line => (line.dash ? 1.6 : 2.2)),
      dashArray: series.map(line => (line.dash ? 5 : 0)),
      curve: definition.stepline ? 'stepline' : 'smooth',
    },
    markers: {size: 0},
    xaxis: {type: 'datetime', min: now - days * 864e5, max: now, labels: {datetimeUTC: false}},
    yaxis,
    annotations: {
      yaxis: (definition.bands ?? []).map(band => ({
        y: band.from,
        y2: band.to,
        fillColor: tokens.tones[band.tone],
        opacity: 0.09,
        borderColor: 'transparent',
        label: {
          text: t(band.labelKey),
          position: 'left',
          textAnchor: 'start',
          offsetX: 8,
          borderWidth: 0,
          style: {background: 'transparent', color: tokens.muted, fontSize: '11px'},
        },
      })),
    },
    tooltip: {
      shared: true,
      x: {format: tooltipFormat},
      y: {
        formatter: (value: number, {seriesIndex}: {seriesIndex: number}) =>
          value == null ? DASH : `${fmt.number(+value, definition.dec ?? 1)} ${series[seriesIndex]?.unit ?? ''}`,
      },
    },
  };
}
