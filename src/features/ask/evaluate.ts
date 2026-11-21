// The evaluation of a question: statistics rows in, the series a chart draws out; state history or rows in, the spans of a test out; every figure computed here and none by a model.
// Pattern: a pure function over values (functional core; ADR 0040, "The model plans, the panel computes"); spec 29, "The evaluation".
// `empty` (no rows at all) is its own result, distinct from "no moments matched" (a moments answer with a count of 0): an answer of nothing is not a missing one.
// Must not: fetch, read the clock (the window carries the period's end, the caller `now`), word a figure, or know a plan (it takes a test and a minimum) or a catalog.
import type {HistoryPoint, StatisticRow, StatisticsPeriod} from '../../core/ha.ts';
import {HOUR_MS, MINUTE_MS, DAY_MS} from '../../core/figures.ts';
import type {PeriodWindow} from './period.ts';
import type {Test} from './plan.ts';

/** One bucket of the series: when it starts and its mean. */
export interface SeriesPoint {
  at: number;
  value: number;
}

export interface SeriesAnswer {
  kind: 'series';
  points: SeriesPoint[];
  /** The lowest reading of the period: the smallest `min` of a bucket, else its mean. */
  low: number;
  /** The highest reading of the period: the largest `max` of a bucket, else its mean. */
  high: number;
  /** The mean of the buckets' means. */
  mean: number;
  /** From 0 to 1: the buckets that have a value, of the buckets the period holds. Under 1 the answer says where the history starts. */
  coverage: number;
  /** When the first bucket with a value starts, in milliseconds. */
  from: number;
}

/** No bucket of the window had a value. */
export interface EmptyAnswer {
  kind: 'empty';
}

const BUCKET_MS: Record<StatisticsPeriod, number> = {'5minute': 5 * MINUTE_MS, hour: HOUR_MS, day: DAY_MS};

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The series a window's rows make. A row outside `[start, end)` or with no mean is left out. Coverage counts the buckets that have a value
 * against the whole buckets the window holds, so the bucket still running at `now` is not a missing one.
 */
export function evaluateSeries(rows: readonly StatisticRow[], window: PeriodWindow): SeriesAnswer | EmptyAnswer {
  const start = window.start.getTime();
  const end = window.end.getTime();
  const kept = rows
    .filter(row => row.start >= start && row.start < end && finite(row.mean))
    .sort((a, b) => a.start - b.start);
  if (kept.length === 0) return {kind: 'empty'};
  const means = kept.map(row => row.mean as number);
  const whole = Math.max(1, Math.floor((end - start) / BUCKET_MS[window.statistic]));
  return {
    kind: 'series',
    points: kept.map((row, i) => ({at: row.start, value: means[i]})),
    low: Math.min(...kept.map((row, i) => (finite(row.min) ? row.min : means[i]))),
    high: Math.max(...kept.map((row, i) => (finite(row.max) ? row.max : means[i]))),
    mean: means.reduce((sum, mean) => sum + mean, 0) / means.length,
    coverage: Math.min(1, kept.length / whole),
    from: kept[0].start,
  };
}

/** One stretch of time the test held, in milliseconds. */
export interface Moment {
  start: number;
  end: number;
  /** The stretch was still going when the period ended and the period reaches now: "still". */
  ongoing: boolean;
}

/** The spans that met a test: each, how many, how long in all, and how much of the period the recorder covered. */
export interface MomentsAnswer {
  kind: 'moments';
  /** In time order; only the spans that lasted the plan's minimum. */
  spans: Moment[];
  count: number;
  totalMs: number;
  /** From 0 to 1: the part of the period the recorder had rows for. Under 1 the answer says where the history starts. */
  coverage: number;
  /** When the history the answer covers begins, in milliseconds. */
  from: number;
}

/** What a moments question asks of the history: the test, and the shortest span in minutes (null for none). */
export interface MomentsQuery {
  test: Test;
  longerThanMin: number | null;
}

/** What the recorder gave: a binary sensor's state history, or a measure's statistics rows. */
export type MomentsInput = {history: readonly HistoryPoint[]} | {statistics: readonly StatisticRow[]};

/** A state that says nothing about the sensor: it ends a span, and counts as neither side of the test. */
const GAPS: ReadonlySet<string> = new Set(['unavailable', 'unknown', '']);

/** The threshold tests of a measure. */
type Threshold = Exclude<Test, {on: boolean}>;

/** Whether a measure's bucket mean meets a threshold; a threshold exactly met is met. */
const meets = (test: Threshold, mean: number): boolean => ('above' in test ? mean >= test.above : mean <= test.below);

/** A stretch of the window and whether the test held for it; null for a gap. */
interface Segment {
  from: number;
  to: number;
  holds: boolean | null;
}

/** The spans of the contiguous segments where the test held, as `[start, end)` pairs, in order; a gap or a segment where it did not hold ends one. */
function joined(segments: readonly Segment[]): [number, number][] {
  const spans: [number, number][] = [];
  for (const {from, to, holds} of segments) {
    if (!holds) continue;
    const last = spans[spans.length - 1];
    if (last && last[1] === from) last[1] = to;
    else spans.push([from, to]);
  }
  return spans;
}

/** The answer of spans: the ones of at least the minimum length, marked `ongoing` when they reach a window end that is not before `now`. */
function answerOf(
  spans: readonly [number, number][],
  query: MomentsQuery,
  window: PeriodWindow,
  now: number,
  covered: {coverage: number; from: number},
): MomentsAnswer {
  const end = window.end.getTime();
  const shortest = (query.longerThanMin ?? 0) * MINUTE_MS;
  const kept = spans
    .filter(([from, to]) => to - from >= shortest)
    .map(([from, to]): Moment => ({start: from, end: to, ongoing: to === end && now <= end}));
  const totalMs = kept.reduce((sum, moment) => sum + moment.end - moment.start, 0);
  return {kind: 'moments', spans: kept, count: kept.length, totalMs, ...covered};
}

/**
 * A binary sensor's state history: each point holds from its change to the next, the first one from the window start if it came before it.
 * This is Security's `segments()` (src/features/security/history.ts) generalised, with one deliberate difference: there, any state that is not `on`
 * ends a run; here `unavailable` and `unknown` are neither side of the test, so a gap is not "off" and is not counted (spec 29, "The evaluation").
 */
function momentsOfHistory(
  points: readonly HistoryPoint[],
  test: {on: boolean},
  query: MomentsQuery,
  window: PeriodWindow,
  now: number,
): MomentsAnswer | EmptyAnswer {
  const start = window.start.getTime();
  const end = window.end.getTime();
  const known = points.filter(point => point.lastChanged < end).sort((a, b) => a.lastChanged - b.lastChanged);
  if (known.length === 0) return {kind: 'empty'};
  const segments = known.map((point, i): Segment => {
    const holds = GAPS.has(point.state) ? null : (point.state === 'on' || point.state === 'home') === test.on;
    return {from: Math.max(start, point.lastChanged), to: Math.min(end, known[i + 1]?.lastChanged ?? end), holds};
  });
  const from = Math.max(start, known[0].lastChanged);
  return answerOf(joined(segments), query, window, now, {coverage: Math.min(1, (end - from) / (end - start)), from});
}

/** A measure's statistics rows: a bucket holds when its mean meets the threshold, and a bucket with no value or no row is a gap. */
function momentsOfStatistics(
  rows: readonly StatisticRow[],
  test: Threshold,
  query: MomentsQuery,
  window: PeriodWindow,
  now: number,
): MomentsAnswer | EmptyAnswer {
  const series = evaluateSeries(rows, window);
  if (series.kind === 'empty') return series;
  const bucket = BUCKET_MS[window.statistic];
  const end = window.end.getTime();
  // a window that ends now has no bucket the recorder has closed after the newest it wrote (an hourly row is written after its hour): a run that includes the newest bucket is taken to go on to now
  const newest = series.points[series.points.length - 1].at;
  const segments = series.points.map((point): Segment => ({
    from: point.at,
    to: point.at === newest && end >= now ? end : Math.min(end, point.at + bucket),
    holds: meets(test, point.value),
  }));
  return answerOf(joined(segments), query, window, now, {coverage: series.coverage, from: series.from});
}

/**
 * The spans of a period where a test held, from the history that suits the sensor: a binary sensor's states (`on` is open, on or home; its opposite is every
 * other state but a gap) or a measure's bucket means against a threshold. `now` says whether a span that reaches the window's end is still going. Data that does not go with the test is empty.
 */
export function evaluateMoments(
  input: MomentsInput,
  query: MomentsQuery,
  window: PeriodWindow,
  now: number,
): MomentsAnswer | EmptyAnswer {
  const {test} = query;
  if ('history' in input)
    return 'on' in test ? momentsOfHistory(input.history, test, query, window, now) : {kind: 'empty'};
  return 'on' in test ? {kind: 'empty'} : momentsOfStatistics(input.statistics, test, query, window, now);
}
