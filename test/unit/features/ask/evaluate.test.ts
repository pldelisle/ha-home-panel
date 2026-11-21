// evaluateSeries: literal statistics rows in, the answer a chart draws out: the points, the low, the high, the mean and how much of the
// period the recorder had rows for. evaluateMoments: state history (a binary sensor) or statistics rows (a measure) in, the spans that meet
// a test out, with their count and total. No model, no clock, no house.
import {describe, expect, test} from 'vitest';
import type {HistoryPoint, StatisticRow} from '../../../../src/core/ha.ts';
import {evaluateMoments, evaluateSeries} from '../../../../src/features/ask/evaluate.ts';
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

const MIN = 6e4;
/** A state of a binary sensor from `time` on, as the recorder's history gives it. */
const point = (time: number, state: string): HistoryPoint => ({state, lastUpdated: time, lastChanged: time});
const history = (...points: HistoryPoint[]) => ({history: points});
const on = {test: {on: true}, longerThanMin: null};
const off = {test: {on: false}, longerThanMin: null};
/** A window of the 17th, 10:00 to 22:00, which ended before `later` (a calendar period that is over). */
const day = hourly(10, 22);
const LATER = at(23);

describe('moments of a binary sensor: the spans of state history', () => {
  test('lists each span in time order with the count and the total, whatever order the points came in', () => {
    const answer = evaluateMoments(
      history(point(at(15), 'off'), point(at(10, 30), 'off'), point(at(14), 'on'), point(at(10, 10), 'on')),
      on,
      day,
      LATER,
    );
    expect(answer).toEqual({
      kind: 'moments',
      spans: [
        {start: at(10, 10), end: at(10, 30), ongoing: false},
        {start: at(14), end: at(15), ongoing: false},
      ],
      count: 2,
      totalMs: 20 * MIN + 60 * MIN,
      coverage: 710 / 720,
      from: at(10, 10),
    });
  });

  test('a span that began before the period starts at the period start, the first point being the state then, not a change', () => {
    const answer = evaluateMoments(history(point(at(8), 'on'), point(at(11), 'off')), on, day, LATER);
    expect(answer).toMatchObject({spans: [{start: at(10), end: at(11), ongoing: false}], coverage: 1});
  });

  test('a span that is open at the period end is cut there, and is "still" only when the period reaches now', () => {
    const points = history(point(at(9), 'off'), point(at(21, 30), 'on'));
    expect(evaluateMoments(points, on, day, LATER)).toMatchObject({
      spans: [{start: at(21, 30), end: at(22), ongoing: false}],
      totalMs: 30 * MIN,
    });
    expect(evaluateMoments(points, on, day, at(22))).toMatchObject({
      spans: [{start: at(21, 30), end: at(22), ongoing: true}],
    });
  });

  test('a point at the end of the window or after it changes nothing, and the same state twice is one span', () => {
    const answer = evaluateMoments(
      history(
        point(at(11), 'on'),
        point(at(12), 'on'),
        point(at(13), 'off'),
        point(at(22), 'on'),
        point(at(23), 'off'),
      ),
      on,
      day,
      LATER,
    );
    expect(answer).toMatchObject({spans: [{start: at(11), end: at(13)}], count: 1});
  });

  test('an unavailable or unknown gap ends a span and is not counted, in either test', () => {
    const points = history(
      point(at(10), 'on'),
      point(at(11), 'unavailable'),
      point(at(12), 'on'),
      point(at(13), 'unknown'),
      point(at(14), 'off'),
      point(at(16), 'unavailable'),
      point(at(17), 'off'),
    );
    expect(evaluateMoments(points, on, day, LATER)).toMatchObject({
      spans: [
        {start: at(10), end: at(11)},
        {start: at(12), end: at(13)},
      ],
      totalMs: 2 * HOUR,
    });
    expect(evaluateMoments(points, off, day, LATER)).toMatchObject({
      spans: [
        {start: at(14), end: at(16)},
        {start: at(17), end: at(22)},
      ],
      totalMs: 7 * HOUR,
    });
  });

  test('home is on and every other state of a person, a zone included, is away; the gap is neither', () => {
    const points = history(
      point(at(10), 'home'),
      point(at(12), 'not_home'),
      point(at(14), 'office'),
      point(at(16), 'unavailable'),
      point(at(18), 'home'),
    );
    expect(evaluateMoments(points, on, day, LATER)).toMatchObject({count: 2, totalMs: 6 * HOUR});
    expect(evaluateMoments(points, off, day, LATER)).toMatchObject({
      spans: [{start: at(12), end: at(16)}],
      count: 1,
    });
  });

  test('a span must last at least the minimum, and exactly the minimum is kept', () => {
    const points = history(
      point(at(10), 'on'),
      point(at(10, 10), 'off'),
      point(at(11), 'on'),
      point(at(11, 9), 'off'),
      point(at(12), 'on'),
      point(at(12, 30), 'off'),
    );
    const longer = (longerThanMin: number | null) =>
      evaluateMoments(points, {test: {on: true}, longerThanMin}, day, LATER);
    expect(longer(null)).toMatchObject({count: 3});
    expect(longer(10)).toMatchObject({count: 2, totalMs: 40 * MIN});
    expect(longer(10.5)).toMatchObject({count: 1, totalMs: 30 * MIN});
    expect(longer(31)).toMatchObject({count: 0, spans: [], totalMs: 0});
  });

  test('nothing matched is an answer of no moments, with the coverage; no point in the window is empty', () => {
    expect(evaluateMoments(history(point(at(9), 'off')), on, day, LATER)).toEqual({
      kind: 'moments',
      spans: [],
      count: 0,
      totalMs: 0,
      coverage: 1,
      from: at(10),
    });
    expect(evaluateMoments(history(), on, day, LATER)).toEqual({kind: 'empty'});
    expect(evaluateMoments(history(point(at(22), 'on')), on, day, LATER)).toEqual({kind: 'empty'});
  });

  test('coverage is the part of the period from the first point on, and the answer says from when', () => {
    const answer = evaluateMoments(history(point(at(16), 'on'), point(at(18), 'off')), on, day, LATER);
    expect(answer).toMatchObject({coverage: 0.5, from: at(16), count: 1});
  });
});

describe('moments of a measure: the buckets that meet a threshold', () => {
  const means = (...values: (number | null)[]) => ({statistics: values.map((value, i) => row(10 + i, value))});
  const above = (value: number, longerThanMin: number | null = null) => ({test: {above: value}, longerThanMin});
  const below = (value: number) => ({test: {below: value}, longerThanMin: null});

  test('joins the buckets in a row into a span from the first start to the last end, with the count and the total', () => {
    const answer = evaluateMoments(means(20, 23.5, 24, 22, 22, 25, 21), above(23), day, LATER);
    expect(answer).toEqual({
      kind: 'moments',
      spans: [
        {start: at(11), end: at(13), ongoing: false},
        {start: at(15), end: at(16), ongoing: false},
      ],
      count: 2,
      totalMs: 3 * HOUR,
      coverage: 7 / 12,
      from: at(10),
    });
  });

  test('a threshold exactly met counts, above and below', () => {
    expect(evaluateMoments(means(22.9, 23, 23.1), above(23), day, LATER)).toMatchObject({
      spans: [{start: at(11), end: at(13)}],
    });
    expect(evaluateMoments(means(22.9, 23, 23.1), below(23), day, LATER)).toMatchObject({
      spans: [{start: at(10), end: at(12)}],
    });
  });

  test('a bucket with no value, and a bucket the recorder has no row for, each end a span', () => {
    const rows = [row(10, 24), row(11, null), row(12, 24), row(14, 24), row(15, 24)];
    expect(evaluateMoments({statistics: rows}, above(23), day, LATER)).toMatchObject({
      spans: [
        {start: at(10), end: at(11)},
        {start: at(12), end: at(13)},
        {start: at(14), end: at(16)},
      ],
      count: 3,
    });
  });

  test('a span that reaches the end of a window that ends now is still going, and is cut at now, not at its bucket end', () => {
    const window = hourly(10, 12, 20);
    const answer = evaluateMoments(means(20, 24, 25), above(23), window, at(12, 20));
    expect(answer).toMatchObject({spans: [{start: at(11), end: at(12, 20), ongoing: true}], totalMs: 80 * MIN});
    expect(evaluateMoments(means(20, 24, 25), above(23), window, at(13))).toMatchObject({
      spans: [{start: at(11), end: at(12, 20), ongoing: false}],
    });
  });

  test('a bucket outside the window is left out, and the minimum length keeps the spans that last it', () => {
    const rows = [row(9, 30), row(10, 24), row(11, 20), row(12, 24), row(13, 24), row(22, 30)];
    expect(evaluateMoments({statistics: rows}, above(23), day, LATER)).toMatchObject({count: 2});
    expect(evaluateMoments({statistics: rows}, above(23, 120), day, LATER)).toMatchObject({
      spans: [{start: at(12), end: at(14)}],
      count: 1,
      totalMs: 2 * HOUR,
    });
  });

  test('no row with a value is empty; rows none of which meet the test are an answer of no moments', () => {
    expect(evaluateMoments({statistics: []}, above(23), day, LATER)).toEqual({kind: 'empty'});
    expect(evaluateMoments(means(null, null), above(23), day, LATER)).toEqual({kind: 'empty'});
    expect(evaluateMoments(means(20, 21), above(23), day, LATER)).toMatchObject({kind: 'moments', count: 0, spans: []});
  });

  test('a test that does not go with the data it was given has nothing to say', () => {
    expect(evaluateMoments(means(20, 24), on, day, LATER)).toEqual({kind: 'empty'});
    expect(evaluateMoments(history(point(at(10), 'on')), above(23), day, LATER)).toEqual({kind: 'empty'});
    expect(evaluateMoments(history(point(at(10), 'on')), off, day, LATER)).toMatchObject({count: 0});
  });
});
