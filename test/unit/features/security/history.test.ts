// The sensor history sheet's rules (segments, periodStats, axisTicks, durationText, eventRows, statTiles, sheetTexts) and the
// glow rule (newlyActive), as pure functions over literal points.
import {describe, expect, test} from 'vitest';
import {activeOf, newlyActive} from '../../../../src/features/security/activity.ts';
import {readSecurity} from '../../../../src/features/security/inputs.ts';
import {
  EVENT_LIMIT,
  axisTicks,
  durationText,
  eventRows,
  periodStats,
  segments,
  sheetTexts,
  statTiles,
  type Segment,
} from '../../../../src/features/security/history.ts';
import type {HistoryPoint} from '../../../../src/core/ha.ts';
import {NOW, depsOf, fullHouse, readingOf, type Language} from '../media/support.ts';

const MIN = 6e4;
const HOUR = 36e5;
const T0 = NOW - 24 * HOUR;

const point = (state: string, lastUpdated: number): HistoryPoint => ({state, lastUpdated, lastChanged: lastUpdated});
const seg = (a: number, b: number, live = false): Segment => ({a, b, live});
const words = (language: Language = 'en') => depsOf(fullHouse, language);

describe('segments', () => {
  test('an on that began before the window starts at the window', () => {
    expect(segments([point('on', T0 - 5 * HOUR), point('off', T0 + HOUR)], T0, NOW)).toEqual([seg(T0, T0 + HOUR)]);
  });

  test('an on that is still on at the end closes at now and is live', () => {
    expect(segments([point('off', T0), point('on', NOW - 5 * MIN)], T0, NOW)).toEqual([seg(NOW - 5 * MIN, NOW, true)]);
  });

  test('back-to-back runs are two segments, and a repeated state changes nothing', () => {
    const points = [
      point('on', T0 + HOUR),
      point('on', T0 + 2 * HOUR),
      point('off', T0 + 3 * HOUR),
      point('off', T0 + 4 * HOUR),
      point('on', T0 + 5 * HOUR),
      point('unavailable', T0 + 6 * HOUR),
    ];
    expect(segments(points, T0, NOW)).toEqual([seg(T0 + HOUR, T0 + 3 * HOUR), seg(T0 + 5 * HOUR, T0 + 6 * HOUR)]);
  });

  test('no point, or no on, is no segment', () => {
    expect(segments([], T0, NOW)).toEqual([]);
    expect(segments([point('off', T0), point('unknown', T0 + HOUR)], T0, NOW)).toEqual([]);
  });
});

describe('periodStats', () => {
  test('the count, the total, the longest and when the last one ended', () => {
    const segs = [seg(0, 10 * MIN), seg(HOUR, HOUR + 30 * MIN)];
    expect(periodStats(segs, 2 * HOUR)).toEqual({count: 2, total: 40 * MIN, longest: 30 * MIN, last: HOUR + 30 * MIN});
  });

  test('a live period grows with `now` and counts from its start', () => {
    const segs = [seg(HOUR, HOUR + MIN, true)];
    expect(periodStats(segs, HOUR + 10 * MIN)).toEqual({count: 1, total: 10 * MIN, longest: 10 * MIN, last: HOUR});
  });

  test('none is zero and no last', () => {
    expect(periodStats([], NOW)).toEqual({count: 0, total: 0, longest: 0, last: null});
  });
});

describe('axisTicks', () => {
  test('n + 1 instants, evenly from the start to now', () => {
    expect(axisTicks(0, 24 * HOUR, 4)).toEqual([0, 6 * HOUR, 12 * HOUR, 18 * HOUR, 24 * HOUR]);
    expect(axisTicks(T0, NOW, 7)).toHaveLength(8);
  });
});

describe('durationText', () => {
  test.each([
    [0, '1 s'],
    [40_000, '40 s'],
    [59_000, '59 s'],
    [60_000, '1 min'],
    [59 * MIN, '59 min'],
    [61 * MIN, '1 h 1 min'],
    [HOUR + 5 * MIN, '1 h 5 min'],
    [3 * HOUR, '3 h 0 min'],
  ])('%s ms is %s', (ms, text) => {
    expect(durationText(ms, words().t)).toBe(text);
  });
});

describe('eventRows', () => {
  const {t, fmt} = words();

  test('newest first, a live door is still open, the others say how long', () => {
    const rows = eventRows([seg(T0 + HOUR, T0 + HOUR + 3 * MIN), seg(NOW - MIN, NOW, true)], 'door', 'day', fmt, t);
    expect(rows.map(r => r.text)).toEqual(['Still open', 'Open for 3 min']);
    expect(rows.map(r => r.key)).toEqual([NOW - MIN, T0 + HOUR]);
  });

  test('motion words its rows its own way', () => {
    const rows = eventRows(
      [seg(NOW - 2 * HOUR, NOW - 2 * HOUR + 40_000), seg(NOW - MIN, NOW, true)],
      'motion',
      'day',
      fmt,
      t,
    );
    expect(rows.map(r => r.text)).toEqual(['Motion now', 'Motion for 40 s']);
  });

  test('the day gives the time, the week the date and the time', () => {
    const one = [seg(NOW - HOUR, NOW - 30 * MIN)];
    const day = eventRows(one, 'door', 'day', fmt, t)[0].when;
    expect(day).toBe(fmt.time(NOW - HOUR));
    expect(eventRows(one, 'door', 'week', fmt, t)[0].when).toBe(`${fmt.date(NOW - HOUR)} ${day}`);
  });

  test('only the last forty are listed', () => {
    const many = Array.from({length: EVENT_LIMIT + 10}, (_, i) => seg(T0 + i * 10 * MIN, T0 + i * 10 * MIN + MIN));
    const rows = eventRows(many, 'door', 'day', fmt, t);
    expect(rows).toHaveLength(EVENT_LIMIT);
    expect(rows[0].key).toBe(many.at(-1)!.a);
    expect(rows.at(-1)!.key).toBe(many[10].a);
  });
});

describe('statTiles', () => {
  const {t, fmt} = words();

  test('a door: how many times, the total, the longest and when it last closed', () => {
    const stats = periodStats(
      [seg(NOW - 3 * HOUR, NOW - 3 * HOUR + 5 * MIN), seg(NOW - 2 * HOUR, NOW - 30 * MIN)],
      NOW,
    );
    expect(statTiles(stats, 'door', NOW, fmt, t)).toEqual([
      {label: 'Times opened', value: '2'},
      {label: 'Total open', value: '1 h 35 min'},
      {label: 'Longest', value: '1 h 30 min'},
      {label: 'Last', value: '30 min ago'},
    ]);
  });

  test('a motion sensor words its first two tiles its own way; a live period counts from its start', () => {
    const stats = periodStats([seg(NOW - 5 * MIN, NOW, true)], NOW);
    expect(statTiles(stats, 'motion', NOW, fmt, t).map(tile => [tile.label, tile.value])).toEqual([
      ['Motion events', '1'],
      ['Total motion', '5 min'],
      ['Longest', '5 min'],
      ['Last', '5 min ago'],
    ]);
  });

  test('without a period the figures are dashes', () => {
    expect(statTiles(periodStats([], NOW), 'door', NOW, fmt, t).map(tile => tile.value)).toEqual(['0', '–', '–', '–']);
  });
});

describe('sheetTexts', () => {
  test('a door, in English and in French', () => {
    const en = words();
    expect(sheetTexts('door', 'Front door', 'last 24 hours', en.t)).toEqual({
      title: 'Front door',
      kind: 'Door',
      heading: 'Front door, last 24 hours',
      strip: 'Open periods',
      empty: 'Not opened in this period',
      loading: 'Loading history…',
      unavailable: 'History is not available right now.',
      overPeriod: 'Over the period',
    });
    expect(sheetTexts('door', 'Front door', 'dernières 24 heures', words('fr').t)).toMatchObject({
      kind: 'Porte',
      heading: 'Front door, dernières 24 heures',
      empty: 'Pas ouverte sur la période',
    });
  });

  test('a motion sensor', () => {
    expect(sheetTexts('motion', 'Hall', 'last 7 days', words().t)).toMatchObject({
      kind: 'Motion',
      strip: 'Motion periods',
      empty: 'No motion in this period',
    });
  });
});

describe('activeOf', () => {
  test('is each sensor of the reading, on or not', () => {
    const {states, registries, names} = readingOf(fullHouse);
    const {sensors} = readSecurity(states, registries, names);
    expect(activeOf(sensors)).toEqual({'binary_sensor.front_door': false, 'binary_sensor.hall_motion': true});
  });
});

describe('newlyActive', () => {
  test('off to on counts', () => {
    expect(newlyActive({a: false, b: false}, {a: true, b: false})).toEqual(['a']);
  });

  test('an id the previous reading did not know does not count, nor does the first reading', () => {
    expect(newlyActive({a: false}, {a: true, b: true})).toEqual(['a']);
    expect(newlyActive({}, {a: true})).toEqual([]);
  });

  test('on to on, on to off and off to off do not count', () => {
    expect(newlyActive({a: true, b: true, c: false}, {a: true, b: false, c: false})).toEqual([]);
  });
});
