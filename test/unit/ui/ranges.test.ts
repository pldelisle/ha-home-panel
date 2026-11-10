// RANGES against the legacy panel's CRANGE, which it copies: the same four ranges, the same spans, periods, ticks and tooltip
// formats, and the English words of the catalog equal to the class's. The guard goes with CRANGE when Climate, the last reader of
// the class's table, has moved.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe, expect, test} from 'vitest';
import {en} from '../../../src/core/i18n/en.ts';
import {RANGES, type Range} from '../../../src/ui/ranges.ts';

const panel = readFileSync(new URL('../../../src/home-panel.js', import.meta.url), 'utf8');

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

const START = 'const CRANGE = ';
const from = panel.indexOf(START);
if (from < 0) throw new Error('the class no longer holds CRANGE: delete this guard with it');
const OLD = runInNewContext(
  `(${panel
    .slice(from + START.length, panel.indexOf('\n// heatmap:', from))
    .trim()
    .replace(/;$/, '')})`,
) as Record<Range, OldRange>;

describe('RANGES against the class CRANGE', () => {
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
    expect(now.bucketMs / 2).toBe(was.mid);
    expect([en[now.labelKey], en[now.shortKey], en[now.meanKey]]).toEqual([was.label, was.short, was.meanName]);
  });

  test('plain history is thinned to the bucket of the period', () => {
    expect(Object.values(RANGES).map(range => [range.period, range.bucketMs])).toEqual([
      ['5minute', 3e5],
      ['hour', 36e5],
      ['hour', 36e5],
      ['day', 864e5],
    ]);
  });
});
