// CardCache: the smart stack's rotation picks from the cards it keeps; the rules run again only when the store told a change, the
// minute turned, the history or the forecast is a new one, or the config's generation moved.
import {describe, expect, test, vi} from 'vitest';
import {CardCache, type CardKey} from '../../../../src/features/stack/card-cache.ts';

const NOW = Date.UTC(2026, 10, 7, 19, 0, 0);
const key = (over: Partial<CardKey> = {}): CardKey => ({
  changes: 0,
  now: NOW,
  history: null,
  forecast: [],
  generation: 1,
  ...over,
});

describe('CardCache', () => {
  test('a tick in the same minute picks from the kept cards; each change of the key computes them again', () => {
    const cache = new CardCache<string[]>();
    const forecast: unknown[] = [];
    const compute = vi.fn(() => ['card']);
    const first = cache.get(key({forecast}), compute);
    // three twenty-second turns inside the minute: no rule runs
    expect(cache.get(key({forecast, now: NOW + 20_000}), compute)).toBe(first);
    expect(cache.get(key({forecast, now: NOW + 59_999}), compute)).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
    for (const over of [{now: NOW + 60_000}, {changes: 1}, {history: {at: NOW}}, {forecast: []}, {generation: 2}])
      cache.get(key({forecast, ...over}), compute);
    expect(compute).toHaveBeenCalledTimes(6);
  });
});
