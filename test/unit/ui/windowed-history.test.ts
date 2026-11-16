// WindowedHistory at the controller seam (ADR 0005): two made-up windows, a fake cache, a fake store and a fake host; no Lit element is mounted in Node.
// What a feature asks and derives is its own test's (the Car's and Energy's loaders); this file holds the lifecycle they share, under a fake clock.
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {StaleReply} from '../../../src/core/api.ts';
import type {ResolvedConfig} from '../../../src/core/config.ts';
import type {StatisticRow} from '../../../src/core/ha.ts';
import {HISTORY_RETRY_MS, STATISTICS_TTL_MS} from '../../../src/core/statistics-cache.ts';
import {
  WindowedHistory,
  type WindowedHistoryDeps,
  type WindowRequest,
} from '../../../src/ui/controllers/windowed-history.ts';

const NOW = Date.parse('2026-11-09T09:45:00-05:00');
const START = new Date(NOW - 864e5);
const row = (start: number, mean: number): StatisticRow => ({start, end: start + 36e5, mean});

interface Two {
  hours: WindowRequest;
  days: WindowRequest;
}
interface Total {
  at: number;
  /** The sum of the means of both replies. */
  total: number;
  format: string;
}

type Ask = [ids: readonly (string | null | undefined)[], period: string];

/** A cache that answers `sensor.x` by its period (`hour` 1, `day` 10), remembers what it was asked, and whose `answer` a test may replace to hold or fail a reply. */
function fakeCache() {
  const calls: Ask[] = [];
  const state = {
    answer: (_ids: Ask[0], period: string): Promise<Record<string, StatisticRow[]>> =>
      Promise.resolve({'sensor.x': [row(NOW, period === 'hour' ? 1 : 10)]}),
  };
  const cache = {
    statistics: (ids: Ask[0], period: string) => {
      calls.push([ids, period]);
      return state.answer(ids, period);
    },
  };
  return {cache, calls, state};
}

function setup(active = true) {
  const {cache, calls, state} = fakeCache();
  const store = {generation: 1, config: {} as ResolvedConfig};
  const controllers: object[] = [];
  const host = {
    active,
    addController: (controller: object) => controllers.push(controller),
    removeController: () => undefined,
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
  const deps: WindowedHistoryDeps<string> = {cache, store, fmt: 'format'};
  const windows = vi.fn<(now: number, config: ResolvedConfig, fmt: string) => Two>(() => ({
    hours: {start: START, period: 'hour', ids: ['sensor.x'], types: ['mean']},
    days: {start: START, period: 'day', ids: ['sensor.x'], types: ['mean']},
  }));
  const history = new WindowedHistory<Two, Total, string>(host, () => deps, {
    windows,
    derive: (replies, _config, now, fmt) => ({
      at: now,
      total: [...replies.hours['sensor.x'], ...replies.days['sensor.x']].reduce((sum, {mean}) => sum + (mean ?? 0), 0),
      format: fmt,
    }),
    tag: 'home-panel test history',
  });
  return {history, host, calls, state, store, windows, controllers};
}

/** Lets the promises of the controller settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WindowedHistory', () => {
  test('leaves registering to its owner, and asks the windows its feature names together, in their order, with the time and the formats', async () => {
    const {history, host, calls, windows, controllers} = setup();
    expect(controllers).toEqual([]);
    history.hostConnected();
    await settle();
    expect(calls.map(([, period]) => period)).toEqual(['hour', 'day']);
    expect(windows).toHaveBeenCalledWith(NOW, {}, 'format');
    expect(history.data).toEqual({at: NOW, total: 11, format: 'format'});
    expect(history.error).toBeNull();
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
  });

  test('asks nothing while the host is not shown, and loads when it is', async () => {
    const {history, host, calls} = setup(false);
    history.hostConnected();
    history.hostUpdate();
    await settle();
    expect(calls).toEqual([]);
    host.active = true;
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(2);
  });

  test('does not load again within fifteen minutes, and loads once the data is that old', async () => {
    const {history, calls} = setup();
    history.hostConnected();
    await settle();
    history.hostUpdate();
    await vi.advanceTimersByTimeAsync(STATISTICS_TTL_MS - 1);
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(4);
    expect(history.data?.at).toBe(NOW + STATISTICS_TTL_MS);
  });

  test('loads again after the config generation changed, once, and asks once for a request in flight', async () => {
    const {history, calls, store} = setup();
    history.hostConnected();
    await settle();
    store.generation = 2;
    history.hostUpdate();
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(4);
  });

  test('lets go of a reply that comes after the host left, and asks again when it is back', async () => {
    const {history, host, calls, state} = setup();
    let release: (reply: Record<string, StatisticRow[]>) => void = () => undefined;
    state.answer = () => new Promise(resolve => (release = resolve));
    history.hostConnected();
    history.hostDisconnected();
    release({'sensor.x': [row(NOW, 5)]});
    await settle();
    expect(history.data).toBeNull();
    expect(host.requestUpdate).not.toHaveBeenCalled();
    state.answer = () => Promise.resolve({'sensor.x': [row(NOW, 2)]});
    history.hostConnected();
    await settle();
    expect(calls.length).toBeGreaterThan(2);
    expect(history.data?.total).toBe(4);
  });

  test('lets go of a failure that comes after the host left: it is no error to show', async () => {
    const {history, host, state} = setup();
    state.answer = () => Promise.reject(new Error('late'));
    history.hostConnected();
    history.hostDisconnected();
    await settle();
    expect(history.error).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
    expect(host.requestUpdate).not.toHaveBeenCalled();
  });

  test('a reply of a config that is gone is no failure: nothing is logged and the next update asks again', async () => {
    const {history, host, calls, state} = setup();
    state.answer = () => Promise.reject(new StaleReply(1, 2));
    history.hostConnected();
    await settle();
    expect(history.error).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    state.answer = () => Promise.resolve({'sensor.x': [row(NOW, 1)]});
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(4);
    expect(history.data?.total).toBe(2);
  });

  test('a failure is logged under the feature’s tag and its reason kept, asked again no sooner than a minute, and cleared by a load that works', async () => {
    const {history, host, calls, state} = setup();
    state.answer = () => Promise.reject(new Error('no recorder'));
    history.hostConnected();
    await settle();
    expect(history.error).toBe('no recorder');
    expect(console.error).toHaveBeenCalledWith('home-panel test history', expect.any(Error));
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    history.hostUpdate();
    await vi.advanceTimersByTimeAsync(HISTORY_RETRY_MS - 1);
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(2);
    state.answer = () => Promise.resolve({'sensor.x': [row(NOW, 3)]});
    await vi.advanceTimersByTimeAsync(1);
    history.hostUpdate();
    await settle();
    expect(history.error).toBeNull();
    expect(history.data?.total).toBe(6);
  });
});
