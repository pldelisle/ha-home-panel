// Air's history as pure functions: the statistics rows in, the series per room and for the outdoor air, the chart words and the options out.
// Pattern: functional core (Bernhardt, Boundaries), the data half of a humble object (Meszaros), after Weather's history; each rule is the
// legacy panel's own (`loadAirRange`, `airChart`, `airOutChart`, deleted by #234) and options are plain data (ADR 0022): `fmt` and `t` are arguments.
// The callers are #233's `<hp-air-detail>`: `metricIds` names what it asks the recorder for, the series and options feed its two `<hp-chart>`s.
// Must not: call the API client or the cache, read the clock or the DOM, or pick a colour of its own (every colour is a caller's token).
import {DASH, DAY_MS} from '../../core/figures.ts';
import type {StatisticRow} from '../../core/ha.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {whole, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import {AQ_BANDS, OUTDOOR_BANDS, type Pollutant} from '../../providers/air-quality.ts';
import {RANGES, type Range} from '../../ui/ranges.ts';
import type {AirInputs} from './inputs.ts';

/** A point of a chart: milliseconds and a value. */
export type Point = [number, number];

/** What a room's card and tiles read, by the suffix of its sensor. */
export type Metric = 'pm1' | 'pm2_5' | 'pm10' | 'co' | 'co2' | 'voc' | 'humidity';
/** The four the history charts. */
export type ChartMetric = 'pm2_5' | 'co2' | 'voc' | 'humidity';

/** A metric's name, as a catalog key, and its unit, which is a symbol and not a word. */
export const METRICS: Record<Metric, {label: MessageKey; unit: string}> = {
  pm1: {label: 'air.metric.pm1', unit: 'µg/m³'},
  pm2_5: {label: 'air.metric.pm25', unit: 'µg/m³'},
  pm10: {label: 'air.metric.pm10', unit: 'µg/m³'},
  co: {label: 'air.metric.co', unit: 'ppm'},
  co2: {label: 'air.metric.co2', unit: 'ppm'},
  voc: {label: 'air.metric.voc', unit: 'µg/m³'},
  humidity: {label: 'air.metric.humidity', unit: '%'},
};

/** The metrics the chart offers, in the order of its radio group. */
export const CHART_METRICS: readonly ChartMetric[] = ['pm2_5', 'co2', 'voc', 'humidity'];

/** Comfortable indoor humidity, in percent: the chart's band and its caption. */
const COMFORTABLE_HUMIDITY = [30, 60] as const;

/** How a metric's chart is drawn and read: the band it shades and that band's label, what its caption says, and whether the station's line joins. */
interface ChartRule {
  shade: readonly [number, number];
  shadeLabel: MessageKey;
  caption: (words: {t: Translate; fmt: Formatters}) => string;
  /** The station's PM2.5 is charted beside the rooms' for that one metric. */
  withStation: boolean;
}

/** A rated pollutant's rule: the good band is shaded from zero, the caption says both edges. */
const pollutantRule = (k: Pollutant & ChartMetric, withStation: boolean): ChartRule => ({
  shade: [0, AQ_BANDS[k][0]],
  shadeLabel: 'air.level.good',
  caption: ({t, fmt}) =>
    [
      t('air.goodUpTo', {
        good: fmt.integer(AQ_BANDS[k][0]),
        moderate: fmt.integer(AQ_BANDS[k][1]),
        unit: METRICS[k].unit,
      }),
      ...(withStation ? [t('air.dashedOutdoor')] : []),
    ].join(' '),
  withStation,
});

/** The rule of each charted metric; humidity has no level, only a comfortable band. */
const CHART_RULES: Record<ChartMetric, ChartRule> = {
  pm2_5: pollutantRule('pm2_5', true),
  co2: pollutantRule('co2', false),
  voc: pollutantRule('voc', false),
  humidity: {
    shade: COMFORTABLE_HUMIDITY,
    shadeLabel: 'air.comfortable',
    caption: ({t, fmt}) =>
      t('air.comfortableHumidity', {
        from: fmt.integer(COMFORTABLE_HUMIDITY[0]),
        to: fmt.integer(COMFORTABLE_HUMIDITY[1]),
      }),
    withStation: false,
  },
};

/** The legacy sheet's defaults: the first range tab and the first metric. */
export const DEFAULT_RANGE: Range = 'day';
export const DEFAULT_METRIC: ChartMetric = 'pm2_5';

// ---------- the series ----------

/** A statistic's mean of each row as `[ms, value]`, moved to the middle of its bucket and rounded to one decimal; the rows without one are skipped. */
const meanPoints = (rows: readonly StatisticRow[], offsetMs: number): Point[] =>
  rows.flatMap(row => (row.mean == null ? [] : [[row.start + offsetMs, +row.mean.toFixed(1)] as Point]));

type Rows = Readonly<Record<string, readonly StatisticRow[]>>;
const pointsOf = (stats: Rows, id: string | null | undefined, range: Range): Point[] =>
  id ? meanPoints(stats[id] ?? [], RANGES[range].bucketMs / 2) : [];

/** The sensor ids a metric's chart asks the recorder for: each room's, and the station's PM2.5 for that one. */
export function metricIds({rooms, outside}: Pick<AirInputs, 'rooms' | 'outside'>, metric: ChartMetric): string[] {
  const ids = rooms.map(room => room.sensors[metric]);
  if (CHART_RULES[metric].withStation) ids.push(outside?.pm ?? undefined);
  return ids.filter((id): id is string => !!id);
}

export interface MetricSeries {
  /** One line per room, in the rooms' order; a room with no rows has no points. */
  rooms: {name: string; points: Point[]}[];
  /** The station's PM2.5 as a dashed line; null for any other metric and for a house without the station's sensor. */
  outside: Point[] | null;
}

/** The mean of each bucket for a metric, per room: the line is drawn at the middle of its bucket, as the legacy chart was. */
export function metricSeries(
  stats: Rows,
  {rooms, outside}: Pick<AirInputs, 'rooms' | 'outside'>,
  metric: ChartMetric,
  range: Range,
): MetricSeries {
  const station = CHART_RULES[metric].withStation ? (outside?.pm ?? null) : null;
  return {
    rooms: rooms.map(room => ({name: room.name, points: pointsOf(stats, room.sensors[metric], range)})),
    outside: station ? pointsOf(stats, station, range) : null,
  };
}

export interface OutdoorSeries {
  aqi: Point[];
  aqhi: Point[];
}

/** The outdoor air index of the station and Environment Canada's AQHI over the range; a series with no id is empty. */
export const outdoorSeries = (
  stats: Rows,
  ids: {aqi: string | null; aqhi: string | null},
  range: Range,
): OutdoorSeries => ({aqi: pointsOf(stats, ids.aqi, range), aqhi: pointsOf(stats, ids.aqhi, range)});

// ---------- the words ----------

/** A chart's title and its caption: "PM2.5, last 24 hours", and what its band means. */
export function chartText(
  metric: ChartMetric,
  range: Range,
  words: {t: Translate; fmt: Formatters},
): {title: string; caption: string} {
  const {t} = words;
  return {
    title: t('air.chartTitle', {metric: t(METRICS[metric].label), range: t(RANGES[range].labelKey)}),
    caption: CHART_RULES[metric].caption(words),
  };
}

// ---------- the options ----------

/** What the charts take from the page's tokens: the four room colours (`--c-home`, `--c-wh`, `--c-heat`, `--c-ev`), the station's (`--c-rest`), the bands' (`--ok`, `--warn`), the axis titles' (`--fg3`) and the outdoor lines' (`--m-orange`, `--m-purple`). */
export interface AirTokens {
  rooms: readonly [string, string, string, string];
  station: string;
  ok: string;
  warn: string;
  muted: string;
  aqi: string;
  aqhi: string;
}

export interface AirChartDeps {
  fmt: Formatters;
  t: Translate;
  tokens: AirTokens;
  /** The instant the axis ends at, in milliseconds: passed in, never read. */
  now: number;
}

/** A band's label, at the left edge of the chart. */
const bandLabel = (text: string, muted: string) => ({
  text,
  position: 'left',
  textAnchor: 'start',
  offsetX: 8,
  borderWidth: 0,
  style: {background: 'transparent', color: muted, fontSize: '11px'},
});

/** The time axis of a range, ending now. */
const timeAxis = (range: Range, now: number) => ({
  type: 'datetime',
  min: now - RANGES[range].days * DAY_MS,
  max: now,
  labels: {datetimeUTC: false},
});

/**
 * The options of a metric's chart, without the theme: a line per room in the four room colours, the station's PM2.5 as a thinner dashed line,
 * the band of the good air (the comfortable humidity for that one), and an integer axis. `<hp-chart>` merges them over its base options.
 */
export function airChartOptions(
  series: MetricSeries,
  metric: ChartMetric,
  range: Range,
  {fmt, t, tokens, now}: AirChartDeps,
) {
  const lines = [
    ...series.rooms.map(({name, points}) => ({name, data: points})),
    ...(series.outside ? [{name: t('air.outside'), data: series.outside}] : []),
  ];
  const station = (index: number) => series.outside !== null && index === lines.length - 1;
  const {shade, shadeLabel} = CHART_RULES[metric];
  return {
    chart: {type: 'line'},
    series: lines,
    colors: [...series.rooms.map((_, index) => tokens.rooms[index % tokens.rooms.length]), tokens.station],
    stroke: {
      width: lines.map((_, index) => (station(index) ? 1.6 : 2.2)),
      dashArray: lines.map((_, index) => (station(index) ? 5 : 0)),
      curve: 'smooth',
    },
    annotations: {
      yaxis: [
        {
          y: shade[0],
          y2: shade[1],
          fillColor: tokens.ok,
          opacity: 0.1,
          borderColor: 'transparent',
          label: bandLabel(t(shadeLabel), tokens.muted),
        },
      ],
    },
    xaxis: timeAxis(range, now),
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: {formatter: (value: number | null) => (value == null ? '' : fmt.integer(value))},
    },
    tooltip: {
      shared: true,
      x: {format: RANGES[range].tooltipFormat},
      y: {
        formatter: (value: number | null) =>
          value == null ? DASH : `${fmt.number(+value, 1)} ${METRICS[metric].unit}`,
      },
    },
  };
}

/**
 * The options of the outdoor chart, without the theme: the station's US AQI on the left axis with the good and moderate bands, and the AQHI on a
 * second axis on the right, from 0 to 10; a line is left out when it has no points, and the bands with the AQI.
 */
export function outdoorChartOptions(series: OutdoorSeries, range: Range, {fmt, t, tokens, now}: AirChartDeps) {
  const axis = (seriesName: string, title: string, extra: Record<string, unknown>) => ({
    seriesName,
    min: 0,
    title: {text: title, style: {color: tokens.muted, fontWeight: 500}},
    labels: {formatter: (value: number) => whole(fmt, value)},
    ...extra,
  });
  const lines: {name: string; data: Point[]; color: string; axis: Record<string, unknown>}[] = [];
  if (series.aqi.length) {
    const name = t('air.aqiSeries');
    lines.push({
      name,
      data: series.aqi,
      color: tokens.aqi,
      axis: axis(name, t('air.axis.aqi'), {forceNiceScale: true}),
    });
  }
  if (series.aqhi.length) {
    const name = t('air.aqhiSeries');
    lines.push({
      name,
      data: series.aqhi,
      color: tokens.aqhi,
      axis: axis(name, t('air.axis.aqhi'), {opposite: true, max: 10, tickAmount: 5}),
    });
  }
  const band = (from: number, to: number, fillColor: string, opacity: number, label: string) => ({
    y: from,
    y2: to,
    fillColor,
    opacity,
    borderColor: 'transparent',
    label: bandLabel(label, tokens.muted),
  });
  return {
    chart: {type: 'line'},
    series: lines.map(({name, data}) => ({name, data})),
    colors: lines.map(line => line.color),
    stroke: {width: 2, curve: 'smooth'},
    xaxis: timeAxis(range, now),
    yaxis: lines.map(line => line.axis),
    annotations: series.aqi.length
      ? {
          yaxis: [
            band(0, OUTDOOR_BANDS[0], tokens.ok, 0.1, t('air.level.good')),
            band(OUTDOOR_BANDS[0], OUTDOOR_BANDS[1], tokens.warn, 0.08, t('air.level.moderate')),
          ],
        }
      : {},
    tooltip: {
      shared: true,
      x: {format: RANGES[range].tooltipFormat},
      y: {formatter: (value: number | null) => (value == null ? DASH : whole(fmt, value))},
    },
  };
}
