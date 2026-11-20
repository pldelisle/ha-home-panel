// evaluateSeries: literal statistics rows in, the answer a chart draws out: the points, the low, the high, the mean and how much of the
// period the recorder had rows for. No model, no clock, no house.
import {describe, expect, test} from 'vitest';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import {evaluateSeries} from '../../../../src/features/ask/evaluate.ts';
import type {PeriodWindow} from '../../../../src/features/ask/period.ts';

const HOUR = 36e5;
const at = (hour: number, minute = 0) => Date.UTC(2026, 10, 17, hour, minute);

/** One hourly bucket starting at `hour`. */
const row = (hour: number, mean: number | null, min?: number | null, max?: number | null): StatisticRow => ({
  start: at(hour),
  end: at(hour) + HOUR,
  mean,
  min,
  max,
});

/** An hourly window from `from` to `to` o'clock (the end may be mid-hour for a period that includes now). */
const hourly = (from: number, to: number, minute = 0): PeriodWindow => ({
  start: new Date(at(from)),
  end: new Date(at(to, minute)),
  statistic: 'hour',
});

describe('a period the recorder covers', () => {
  const rows = [row(10, 20, 19.5, 20.5), row(11, 21, 20.5, 21.5), row(12, 22, 21.5, 23), row(13, 21, 20, 22)];

  test('gives the points, the low and the high of the buckets, the mean of their means', () => {
    expect(evaluateSeries(rows, hourly(10, 14))).toEqual({
      kind: 'series',
      points: [
        {at: at(10), value: 20},
        {at: at(11), value: 21},
        {at: at(12), value: 22},
        {at: at(13), value: 21},
      ],
      low: 19.5,
      high: 23,
      mean: 21,
      coverage: 1,
      from: at(10),
    });
  });

  test('takes the low and the high from the means when a bucket has no extremes', () => {
    const answer = evaluateSeries([row(10, 18), row(11, 24), row(12, 20, 15, null)], hourly(10, 13));
    expect(answer).toMatchObject({kind: 'series', low: 15, high: 24});
  });

  test('puts the points in time order whatever order the rows came in', () => {
    const answer = evaluateSeries([...rows].reverse(), hourly(10, 14));
    expect(answer.kind === 'series' && answer.points.map(point => point.at)).toEqual([at(10), at(11), at(12), at(13)]);
  });

  test('leaves out the rows outside the window, the ones before it and the one that starts at its end', () => {
    const answer = evaluateSeries([row(9, 5, 5, 5), ...rows, row(14, 90, 90, 90)], hourly(10, 14));
    expect(answer).toMatchObject({kind: 'series', low: 19.5, high: 23, coverage: 1, from: at(10)});
  });
});

describe('coverage', () => {
  test('is the share of the period the recorder had rows for, and the answer says where the history starts', () => {
    expect(evaluateSeries([row(12, 22), row(13, 21)], hourly(10, 14))).toMatchObject({coverage: 0.5, from: at(12)});
  });

  test('counts a gap in the middle, and a bucket with no value is a gap', () => {
    const answer = evaluateSeries([row(10, 20), row(11, null), row(12, 22), row(13, 21)], hourly(10, 14));
    expect(answer).toMatchObject({coverage: 0.75});
    expect(answer.kind === 'series' && answer.points).toHaveLength(3);
  });

  test('does not count the bucket still running as missing, for a period that ends now', () => {
    expect(evaluateSeries([row(10, 20), row(11, 21), row(12, 22)], hourly(10, 13, 30))).toMatchObject({coverage: 1});
  });

  test('never passes the whole, and a window shorter than a bucket holding a row is covered', () => {
    const extra = [row(10, 20), row(10, 20), row(11, 21)];
    expect(evaluateSeries(extra, hourly(10, 11))).toMatchObject({coverage: 1});
    expect(evaluateSeries([row(10, 20)], hourly(10, 10, 20))).toMatchObject({coverage: 1});
  });

  test('is sized by the statistic: a day bucket and a 5-minute bucket', () => {
    const day = {start: new Date(at(0)), end: new Date(at(0) + 4 * 24 * HOUR), statistic: 'day'} as const;
    const days = [0, 1].map(i => ({start: at(0) + i * 24 * HOUR, end: at(0) + (i + 1) * 24 * HOUR, mean: 10}));
    expect(evaluateSeries(days, day)).toMatchObject({coverage: 0.5});
    const minutes = {start: new Date(at(10)), end: new Date(at(10, 20)), statistic: '5minute'} as const;
    const fives = [0, 5].map(m => ({start: at(10, m), end: at(10, m + 5), mean: 10}));
    expect(evaluateSeries(fives, minutes)).toMatchObject({coverage: 0.5});
  });
});

describe('no rows', () => {
  test('is the result empty, which is not an answer of zero', () => {
    expect(evaluateSeries([], hourly(10, 14))).toEqual({kind: 'empty'});
  });

  test('so are rows that all have no value, or that all lie outside the window', () => {
    expect(evaluateSeries([row(10, null), row(11, null)], hourly(10, 14))).toEqual({kind: 'empty'});
    expect(evaluateSeries([row(8, 20), row(14, 21)], hourly(10, 14))).toEqual({kind: 'empty'});
  });
});
