// RANGES against the legacy panel's CRANGE, which it copied: the same four ranges, the same spans, periods, ticks and tooltip formats, and the English
// words of the catalog equal to the class's. The guard once read the table from the class's source; #246 deleted CRANGE, and the snapshot below is it
// as it was, kept so that a change to a range's numbers or words is a deliberate one, made here as well, and not a slip.
import {describe, expect, test} from 'vitest';
import {en} from '../../../src/core/i18n/en.ts';
import {bucketMiddle, RANGES, type Range} from '../../../src/ui/ranges.ts';

interface OldRange {
  days: number;
  period: string;
  mid: number;
  label: string;
  short: string;
  ticks: number;
  tipFmt: string;
  meanName: string;
}

const OLD: Record<Range, OldRange> = {
  day: {
    days: 1,
    period: '5minute',
    mid: 15e4,
    label: 'last 24 hours',
    short: '24 h',
    ticks: 8,
    tipFmt: 'ddd h:mm tt',
    meanName: '5-minute mean',
  },
  week: {
    days: 7,
    period: 'hour',
    mid: 18e5,
    label: 'last 7 days',
    short: '7 days',
    ticks: 7,
    tipFmt: 'ddd h tt',
    meanName: 'Hourly mean',
  },
  month: {
    days: 30,
    period: 'hour',
    mid: 18e5,
    label: 'last 30 days',
    short: '30 days',
    ticks: 10,
    tipFmt: 'ddd MMM d, h tt',
    meanName: 'Hourly mean',
  },
  year: {
    days: 365,
    period: 'day',
    mid: 432e5,
    label: 'last 12 months',
    short: '12 months',
    ticks: 12,
    tipFmt: 'ddd MMM d, yyyy',
    meanName: 'Daily mean',
  },
};

describe('RANGES against the legacy CRANGE', () => {
  test('every range has a tab word, and it is the capitalised name the class gave its tab', () => {
    for (const range of Object.keys(RANGES) as Range[])
      expect(en[RANGES[range].tabKey]).toBe(range[0].toUpperCase() + range.slice(1));
  });

  test('the same four ranges, in the order of their tabs', () => {
    expect(Object.keys(RANGES)).toEqual(Object.keys(OLD));
    expect(Object.keys(RANGES)).toEqual(['day', 'week', 'month', 'year']);
  });

  test.each(Object.keys(OLD) as Range[])('%s: the span, the period, the ticks, the tooltip and the words', range => {
    const was = OLD[range];
    const now = RANGES[range];
    expect([now.days, now.period, now.ticks, now.tooltipFormat]).toEqual([was.days, was.period, was.ticks, was.tipFmt]);
    // a row is drawn in the middle of its bucket: the class stored that offset, the table stores the bucket
    expect(bucketMiddle(range)).toBe(was.mid);
    expect([en[now.labelKey], en[now.shortKey], en[now.meanKey]]).toEqual([was.label, was.short, was.meanName]);
  });

  test('each range has the bucket of its statistics period: 5 minutes, an hour, a day', () => {
    expect(Object.values(RANGES).map(range => [range.period, range.bucketMs])).toEqual([
      ['5minute', 3e5],
      ['hour', 36e5],
      ['hour', 36e5],
      ['day', 864e5],
    ]);
  });

  test('bucketMiddle is half the bucket: two and a half minutes, half an hour, half a day', () => {
    expect((['day', 'week', 'month', 'year'] as const).map(bucketMiddle)).toEqual([15e4, 18e5, 18e5, 432e5]);
  });
});
