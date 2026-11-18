// The line under the header's clock (#426): empty while the history is fresh, "Updated 1:20 pm" once it is older than its refresh interval plus a margin.
import {describe, expect, test} from 'vitest';
import {STATISTICS_TTL_MS} from '../../../src/core/statistics-cache.ts';
import {CLOCK_NOTE_MARGIN_MS, isHistoryStale} from '../../../src/shell/clock-note.ts';

describe('the history is stale', () => {
  const at = 1_000_000;
  const limit = STATISTICS_TTL_MS + CLOCK_NOTE_MARGIN_MS;

  test('never before its first reply, and not while it is within its interval and the margin', () => {
    expect(isHistoryStale(null, at + 10 * limit)).toBe(false);
    expect(isHistoryStale(at, at)).toBe(false);
    expect(isHistoryStale(at, at + limit)).toBe(false);
  });

  test('once it is older than the interval plus the margin', () => {
    expect(isHistoryStale(at, at + limit + 1)).toBe(true);
  });
});
