// createStatisticsCache: the one memo for the recorder reads (`statistics` and `history`), shaped like the API client it wraps.
// Pattern: memoisation (Michie, 1968), a cache-aside read-through with a time to live: a call is keyed by its arguments and a hit
// returns the first call's promise. Why here, spec 15 "Notes": "Two features already cache (this.WX, this.CR), so ... the shared module is justified now".
// A caller that wants hits passes a start it keeps stable (the top of the hour, the start of the day): a start that moves is a new call.
// It also keeps the time of the last reply (`lastLoadedAt`, the settings' foot) and, per scope (a pane's view of it, `scoped`), the time of the
// newest answer that scope was given, a hit included (`answeredAt`): the header's clock line says when the history on screen was last answered (#426).
// Must not: touch the DOM, read a clock but the `now` it is given (`Date.now` only as the default), keep a rejection (a StaleReply included), or retry.
import type {PanelApi} from './api.ts';

/** The two reads the cache memoises, with the client's own signatures, so a caller swaps `api` for the cache unchanged. */
export type StatisticsCache = Pick<PanelApi, 'statistics' | 'history'> & {
  /** Forgets everything, the last reply's time included: for a change of the config's generation, whose cached replies belong to the old config. */
  clear(): void;
  /** When the last reply arrived, in milliseconds, or null before the first (and after `clear`): the header's "Live · history" line (#269). */
  readonly lastLoadedAt: number | null;
  /** A view of this cache for one pane: the same memo, and every answer it gives (a hit too) is noted under `scope`. */
  scoped(scope: string): StatisticsCache;
  /** When `scope` was last answered, in milliseconds, or null when it never was (and after `clear`): a pane that reads no history has none. */
  answeredAt(scope: string): number | null;
};

/** How long a recorder reply stays fresh, the legacy panel's fifteen minutes: the cache's time to live, and how long a feature keeps what it derived. */
export const STATISTICS_TTL_MS = 15 * 60_000;

/** How soon after a failed load a feature's history controller (Energy's, Climate's) asks the cache again: a failed load must not turn every update into a request. */
export const HISTORY_RETRY_MS = 60_000;

export interface StatisticsCacheOptions {
  /** How long a reply stays fresh, in milliseconds. */
  ttlMs: number;
  /** The clock, in milliseconds (default `Date.now`); a test drives it. */
  now?: () => number;
  /** Called at each reply that moves `lastLoadedAt`: the shell draws the header's clock line and the settings popup's version line again. */
  onLoad?: () => void;
}

interface Entry {
  at: number;
  promise: Promise<unknown>;
}

/**
 * The ids that name the reply: empty ones dropped, each once, sorted. `statistics` sends exactly these; `history` sends the list as
 * given, but its reply is keyed by id, so the same set reads the same.
 */
const idsKey = (ids: readonly (string | null | undefined)[]) => [...new Set(ids.filter(Boolean))].sort();

export function createStatisticsCache(
  api: Pick<PanelApi, 'statistics' | 'history'>,
  {ttlMs, now = Date.now, onLoad}: StatisticsCacheOptions,
): StatisticsCache {
  const entries = new Map<string, Entry>();
  let lastLoadedAt: number | null = null;
  // the time of the newest answer each scope was given: a reply that came, or a hit that returned a reply that came
  const answers = new Map<string, number>();
  // a reply of the config before the last `clear` is not counted: it belongs to the old config
  let generation = 0;

  function memo<R>(key: string, load: () => Promise<R>, scope: string | undefined): Promise<R> {
    const at = now();
    const asked = generation;
    // an answer is noted when the reply arrives, for the scope that asked; a reply of the config before a `clear` is not
    const note = (promise: Promise<unknown>) => {
      if (scope === undefined) return;
      promise.then(
        () => {
          if (asked === generation) answers.set(scope, now());
        },
        () => {},
      );
    };
    const hit = entries.get(key);
    if (hit && at - hit.at < ttlMs) {
      note(hit.promise);
      return hit.promise as Promise<R>;
    }
    // an expired entry that no call asks for again would stay for good: each miss sweeps them
    for (const [other, entry] of entries) if (at - entry.at >= ttlMs) entries.delete(other);
    const promise = load();
    entries.set(key, {at, promise});
    note(promise);
    promise.then(
      () => {
        if (asked !== generation) return;
        lastLoadedAt = now();
        onLoad?.();
      },
      () => {},
    );
    // a failed read is not kept, whatever the reason, so the next call asks again (a clear() may have replaced the entry meanwhile)
    promise.catch(() => {
      if (entries.get(key)?.promise === promise) entries.delete(key);
    });
    return promise;
  }

  const view = (scope: string | undefined): StatisticsCache => ({
    statistics(ids, period, start, types, end) {
      const key = JSON.stringify([
        'statistics',
        idsKey(ids),
        period,
        start.getTime(),
        [...types].sort(),
        end?.getTime() ?? null,
      ]);
      return memo(key, () => api.statistics(ids, period, start, types, end), scope);
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
      return memo(key, () => api.history(ids, start, options), scope);
    },
    clear() {
      entries.clear();
      answers.clear();
      lastLoadedAt = null;
      generation++;
    },
    get lastLoadedAt() {
      return lastLoadedAt;
    },
    scoped: name => view(name),
    answeredAt: name => answers.get(name) ?? null,
  });
  return view(undefined);
}
