// The evaluation of a series question: statistics rows in, the answer a chart draws out, every figure computed here and none by a model.
// Pattern: a pure function over values (functional core; ADR 0040, "The model plans, the panel computes"); spec 29, "The evaluation".
// `empty` (no rows at all) is its own result, as "no moments matched" will be: an answer of nothing is not a missing one.
// Must not: fetch, read the clock (the window carries `now` for a period that includes it), word a figure, or know a plan or a catalog.
import type {StatisticRow, StatisticsPeriod} from '../../core/ha.ts';
import {HOUR_MS, MINUTE_MS, DAY_MS} from '../../core/figures.ts';
import type {PeriodWindow} from './period.ts';

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
