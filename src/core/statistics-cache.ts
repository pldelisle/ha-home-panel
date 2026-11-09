// createStatisticsCache: the one memo for the recorder reads (`statistics` and `history`), shaped like the API client it wraps.
// Pattern: memoisation (Michie, 1968) as a cache-aside read-through with a time to live; a call is keyed by its arguments, and
// a hit returns the very promise of the first call. Spec 15 "Notes": it sits in the core because two features cached already.
// A caller that wants hits passes a start it keeps stable (the top of the hour, the start of the day): a start that moves is a new call.
// Must not: touch the DOM, hold a clock of its own (`now` is injected), keep a rejection (a StaleReply included), or retry.
import type {PanelApi} from './api.ts';

/** The two reads the cache memoises, with the client's own signatures, so a caller swaps `api` for the cache unchanged. */
export type StatisticsCache = Pick<PanelApi, 'statistics' | 'history'> & {
  /** Forgets everything: for a change of the config's generation, whose cached replies belong to the old config. */
  clear(): void;
};

export interface StatisticsCacheOptions {
  /** How long a reply stays fresh, in milliseconds. */
  ttlMs: number;
  /** The clock, in milliseconds (default `Date.now`); a test drives it. */
  now?: () => number;
}

interface Entry {
  at: number;
  promise: Promise<unknown>;
}

/** The ids as the client sends them: the empty ones dropped, each once, in an order that does not change the key. */
const idsKey = (ids: readonly (string | null | undefined)[]) => [...new Set(ids.filter(Boolean))].sort();

export function createStatisticsCache(
  api: Pick<PanelApi, 'statistics' | 'history'>,
  {ttlMs, now = Date.now}: StatisticsCacheOptions,
): StatisticsCache {
  const entries = new Map<string, Entry>();

  function memo<R>(key: string, load: () => Promise<R>): Promise<R> {
    const at = now();
    const hit = entries.get(key);
    if (hit && at - hit.at < ttlMs) return hit.promise as Promise<R>;
    // an expired entry that no call asks for again would stay for good: each miss sweeps them
    for (const [other, entry] of entries) if (at - entry.at >= ttlMs) entries.delete(other);
    const promise = load();
    entries.set(key, {at, promise});
    // a failed read is not kept, whatever the reason, so the next call asks again (a clear() may have replaced the entry meanwhile)
    promise.catch(() => {
      if (entries.get(key)?.promise === promise) entries.delete(key);
    });
    return promise;
  }

  return {
    statistics(ids, period, start, types, end) {
      const key = JSON.stringify([
        'statistics',
        idsKey(ids),
        period,
        start.getTime(),
        [...types].sort(),
        end?.getTime() ?? null,
      ]);
      return memo(key, () => api.statistics(ids, period, start, types, end));
    },
    history(ids, start, options) {
      const {minimal, attributes, end} = options;
      const key = JSON.stringify([
        'history',
        idsKey(ids),
        start.getTime(),
        minimal,
        attributes,
        end?.getTime() ?? null,
      ]);
      return memo(key, () => api.history(ids, start, options));
    },
    clear() {
      entries.clear();
    },
  };
}
