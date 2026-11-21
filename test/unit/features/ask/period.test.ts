// resolvePeriod: the nine closed words of a plan as a window of the house's calendar. Fixed clocks, in the house's zone, with the
// expected instants written out in UTC (Toronto is UTC-5 in winter and UTC-4 in summer).
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../../src/core/i18n/locale.ts';
import {PERIODS, resolvePeriod, weekStartOf, type Period, type WeekStart} from '../../../../src/features/ask/period.ts';

const ZONE = 'America/Toronto';
const MONDAY: WeekStart = 1;
const SUNDAY: WeekStart = 0;

/** The window as ISO instants, so a failure reads as dates. */
const window = (period: Period, now: string, weekStart = MONDAY, zone = ZONE) => {
  const w = resolvePeriod(period, new Date(now), createFormatters(englishLocale(zone)), weekStart);
  return [w.start.toISOString(), w.end.toISOString(), w.statistic];
};

// Wednesday 2 pm in Toronto, after the clocks went back (EST)
const WEDNESDAY = '2026-11-18T19:00:00Z';
const WEDNESDAY_ISO = '2026-11-18T19:00:00.000Z';

describe('the nine periods on a Wednesday afternoon', () => {
  test('today runs from midnight to now, in 5-minute statistics', () => {
    expect(window('today', WEDNESDAY)).toEqual(['2026-11-18T05:00:00.000Z', WEDNESDAY_ISO, '5minute']);
  });

  test('yesterday is the whole of the day before', () => {
    expect(window('yesterday', WEDNESDAY)).toEqual(['2026-11-17T05:00:00.000Z', '2026-11-18T05:00:00.000Z', '5minute']);
  });

  test('the last 24 hours start on the hour, so a repeat in the same hour asks the same question', () => {
    expect(window('last_24h', '2026-11-18T19:30:00Z')).toEqual([
      '2026-11-17T19:00:00.000Z',
      '2026-11-18T19:30:00.000Z',
      '5minute',
    ]);
    expect(window('last_24h', '2026-11-18T19:59:00Z')[0]).toBe('2026-11-17T19:00:00.000Z');
  });

  test('this week and last week begin on the week start, hourly', () => {
    expect(window('this_week', WEDNESDAY, MONDAY)).toEqual(['2026-11-16T05:00:00.000Z', WEDNESDAY_ISO, 'hour']);
    expect(window('last_week', WEDNESDAY, MONDAY)).toEqual([
      '2026-11-09T05:00:00.000Z',
      '2026-11-16T05:00:00.000Z',
      'hour',
    ]);
    expect(window('this_week', WEDNESDAY, SUNDAY)[0]).toBe('2026-11-15T05:00:00.000Z');
    expect(window('last_week', WEDNESDAY, SUNDAY).slice(0, 2)).toEqual([
      '2026-11-08T05:00:00.000Z',
      '2026-11-15T05:00:00.000Z',
    ]);
  });

  test('the last 7 days are seven calendar days, today among them, hourly', () => {
    expect(window('last_7_days', WEDNESDAY)).toEqual(['2026-11-12T05:00:00.000Z', WEDNESDAY_ISO, 'hour']);
  });

  test('this month and last month begin on the first, daily', () => {
    expect(window('this_month', WEDNESDAY)).toEqual(['2026-11-01T04:00:00.000Z', WEDNESDAY_ISO, 'day']);
    expect(window('last_month', WEDNESDAY)).toEqual(['2026-10-01T04:00:00.000Z', '2026-11-01T04:00:00.000Z', 'day']);
  });

  test('the last 30 days are thirty calendar days, today among them, daily', () => {
    expect(window('last_30_days', WEDNESDAY)).toEqual(['2026-10-20T04:00:00.000Z', WEDNESDAY_ISO, 'day']);
  });

  test('the table lists the nine words the plan accepts', () => {
    expect(PERIODS).toEqual([
      'today',
      'yesterday',
      'last_24h',
      'this_week',
      'last_week',
      'last_7_days',
      'this_month',
      'last_month',
      'last_30_days',
    ]);
  });
});

describe('the edges of the calendar', () => {
  test('on a Sunday a Monday week started six days ago, and a Sunday week starts today', () => {
    const sunday = '2026-11-22T15:00:00Z'; // 10 am in Toronto
    expect(window('this_week', sunday, MONDAY)[0]).toBe('2026-11-16T05:00:00.000Z');
    expect(window('this_week', sunday, SUNDAY)[0]).toBe('2026-11-22T05:00:00.000Z');
  });

  test('just after midnight is still the new day, and just before is the old one', () => {
    expect(window('today', '2026-11-19T05:01:00Z')[0]).toBe('2026-11-19T05:00:00.000Z');
    expect(window('today', '2026-11-19T04:59:00Z')[0]).toBe('2026-11-18T05:00:00.000Z');
  });

  test('on the last day of a month, last month is the whole one before', () => {
    expect(window('this_month', '2026-03-31T14:00:00Z').slice(0, 2)).toEqual([
      '2026-03-01T05:00:00.000Z',
      '2026-03-31T14:00:00.000Z',
    ]);
    expect(window('last_month', '2026-03-31T14:00:00Z').slice(0, 2)).toEqual([
      '2026-02-01T05:00:00.000Z',
      '2026-03-01T05:00:00.000Z',
    ]);
  });

  test('in January last month is December of the year before', () => {
    expect(window('last_month', '2026-01-15T17:00:00Z').slice(0, 2)).toEqual([
      '2025-12-01T05:00:00.000Z',
      '2026-01-01T05:00:00.000Z',
    ]);
  });

  test('a week can reach back across the new year', () => {
    expect(window('last_week', '2026-01-02T17:00:00Z', MONDAY).slice(0, 2)).toEqual([
      '2025-12-22T05:00:00.000Z',
      '2025-12-29T05:00:00.000Z',
    ]);
  });

  test('the day the clocks go forward is 23 hours, and the one they go back is 25', () => {
    // Sunday 8 March 2026: 2 am becomes 3 am
    expect(window('yesterday', '2026-03-09T19:00:00Z').slice(0, 2)).toEqual([
      '2026-03-08T05:00:00.000Z',
      '2026-03-09T04:00:00.000Z',
    ]);
    // Sunday 1 November 2026: 2 am becomes 1 am
    expect(window('yesterday', '2026-11-02T17:00:00Z').slice(0, 2)).toEqual([
      '2026-11-01T04:00:00.000Z',
      '2026-11-02T05:00:00.000Z',
    ]);
  });

  test('a week that holds the change begins at its own midnight, not 168 hours back', () => {
    // Monday 2 March to Monday 9 March 2026: the clocks went forward on the Sunday between
    expect(window('last_week', '2026-03-12T17:00:00Z', MONDAY).slice(0, 2)).toEqual([
      '2026-03-02T05:00:00.000Z',
      '2026-03-09T04:00:00.000Z',
    ]);
  });

  test('the zone decides what day it is: the same instant is two different days', () => {
    const instant = '2026-11-18T03:00:00Z'; // the 17th in Toronto, the 18th in Paris
    expect(window('today', instant, MONDAY, 'America/Toronto')[0]).toBe('2026-11-17T05:00:00.000Z');
    expect(window('today', instant, MONDAY, 'Europe/Paris')[0]).toBe('2026-11-17T23:00:00.000Z');
  });
});

describe('weekStartOf', () => {
  test.each([
    ['en-CA', 0],
    ['fr-CA', 0],
    ['fr-FR', 1],
    ['de', 1],
  ] as const)('the week of %s begins on day %s', (tag, first) => {
    expect(weekStartOf(tag)).toBe(first);
  });

  describe('where the runtime has no getWeekInfo (Firefox)', () => {
    const proto = Intl.Locale.prototype as unknown as {getWeekInfo?: unknown};
    const original = Object.getOwnPropertyDescriptor(proto, 'getWeekInfo');
    beforeAll(() => Object.defineProperty(proto, 'getWeekInfo', {value: undefined, configurable: true}));
    afterAll(() => original && Object.defineProperty(proto, 'getWeekInfo', original));

    test.each([
      ['en', 0], // English's likely region is the United States
      ['en-CA', 0],
      ['fr-CA', 0],
      ['es-MX', 0],
      ['pt-BR', 0],
      ['ja-JP', 0],
      ['he-IL', 0],
      ['en-US', 0],
      ['fr', 1], // France
      ['fr-FR', 1],
      ['de', 1],
      ['en-GB', 1],
    ] as const)('the week of %s begins on day %s, from its region', (tag, first) => {
      expect(weekStartOf(tag)).toBe(first);
    });
  });

  test('a tag the runtime cannot read begins on Monday', () => {
    expect(weekStartOf('not a tag!')).toBe(1);
  });
});
