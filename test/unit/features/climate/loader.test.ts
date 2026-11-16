// ClimateHistory at the controller seam (ADR 0005): a fake cache, a fake store and a fake host; no Lit element is mounted in Node.
// The clock is Vitest's, so "ten minutes" is a call to advanceTimersByTime and not a wait.
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {StaleReply} from '../../../../src/core/api.ts';
import {DEFAULT_ENTITIES} from '../../../../src/core/entities.ts';
import type {HistoryPoint, StatisticRow} from '../../../../src/core/ha.ts';
import {
  HISTORY_TTL_MS,
  RETRY_MS,
  ClimateHistory,
  type ClimateHistoryDeps,
} from '../../../../src/features/climate/loader.ts';
import type {Range} from '../../../../src/ui/ranges.ts';

const NOW = Date.parse('2026-11-09T09:45:00-05:00');
const HOUR = 36e5;
const row = (start: number, mean: number): StatisticRow => ({
  start,
  end: start + HOUR,
  mean,
  min: mean - 1,
  max: mean + 1,
});
const config = {
  entities: {...DEFAULT_ENTITIES, outT: 'sensor.out', hp: 'climate.pump'},
  rooms: [{k: 'den', temp: 'sensor.den_t', target: 'sensor.den_sp', power: 'sensor.den_p'}],
};

type Stats = Record<string, StatisticRow[]>;
type States = Record<string, HistoryPoint[]>;

/** A cache that answers every window with the den's temperature and the pump's state, and remembers what it was asked; `statistics` and `history` may be replaced to hold or fail a reply. */
function fakeCache() {
  const calls = {
    statistics: [] as {ids: readonly (string | null)[]; period: string; start: Date}[],
    history: [] as string[][],
  };
  const state = {
    statistics: (): Promise<Stats> => Promise.resolve({'sensor.den_t': [row(NOW - HOUR, 20)]}),
    history: (): Promise<States> =>
      Promise.resolve({
        'climate.pump': [
          {state: 'heat', lastUpdated: NOW - HOUR, lastChanged: NOW - HOUR, attributes: {current_temperature: 19}},
        ],
      }),
  };
  const cache = {
    statistics: (ids: readonly (string | null)[], period: string, start: Date) => {
      calls.statistics.push({ids, period, start});
      return state.statistics();
    },
    history: (ids: readonly string[]) => {
      calls.history.push([...ids]);
      return state.history();
    },
  };
  return {cache, calls, state};
}

function setup(overrides: Partial<{config: unknown; shown: boolean}> = {}) {
  const {cache, calls, state} = fakeCache();
  const world = {
    generation: 1,
    range: 'day' as Range,
    shown: overrides.shown ?? true,
    config: overrides.config ?? config,
  };
  const controllers: {hostConnected?(): void; hostUpdate?(): void; hostDisconnected?(): void}[] = [];
  const host = {
    addController: (controller: (typeof controllers)[number]) => controllers.push(controller),
    removeController: () => undefined,
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
  const history = new ClimateHistory(host, () =>
    world.shown
      ? ({
          cache,
          store: {generation: world.generation, config: world.config},
          range: world.range,
        } as unknown as ClimateHistoryDeps)
      : null,
  );
  return {history, host, calls, state, world, controller: controllers[0]};
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

describe('ClimateHistory', () => {
  test('registers with its host, and loads the range in one statistics request and one history request when the pane is shown', async () => {
    const {history, host, calls, controller, world} = setup();
    expect(controller).toBe(history);
    history.hostConnected();
    await settle();
    expect(calls.statistics).toHaveLength(1);
    expect(calls.statistics[0]).toMatchObject({period: '5minute'});
    expect(calls.statistics[0].ids).toEqual(['sensor.den_t', 'sensor.den_sp', 'sensor.den_p', 'sensor.out']);
    expect(calls.history).toEqual([['climate.pump']]);
    const data = history.data('day', world.generation);
    expect(data?.at).toBe(NOW);
    expect(data?.rooms.den).toHaveLength(1);
    expect(data?.hp).toEqual([[NOW - HOUR, 19]]);
    expect(history.failed('day', world.generation)).toBe(false);
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
  });

  test('asks nothing of a pane that is not shown, then asks once it is, and not twice while the request is on its way', async () => {
    const {history, calls, world} = setup({shown: false});
    history.hostConnected();
    history.hostUpdate();
    await settle();
    expect(calls.statistics).toHaveLength(0);
    world.shown = true;
    history.hostUpdate();
    history.hostUpdate();
    await settle();
    expect(calls.statistics).toHaveLength(1);
  });

  test('draws from memory within ten minutes, whatever the updates, and asks again once the entry is ten minutes old', async () => {
    const {history, calls} = setup();
    history.hostConnected();
    await vi.advanceTimersByTimeAsync(HISTORY_TTL_MS - 1);
    history.hostUpdate();
    await settle();
    expect(calls.statistics).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    history.hostUpdate();
    await settle();
    expect(calls.statistics).toHaveLength(2);
    expect(history.data('day', 1)?.at).toBe(NOW + HISTORY_TTL_MS);
  });

  test('a range loads once: another range asks for its own, and the first redraws from memory when it is chosen again', async () => {
    const {history, calls, world} = setup();
    history.hostConnected();
    await settle();
    world.range = 'week';
    history.hostUpdate();
    await settle();
    expect(calls.statistics.map(call => call.period)).toEqual(['5minute', 'hour']);
    expect(calls.history).toHaveLength(2);
    expect(history.data('week', 1)?.range).toBe('week');
    world.range = 'day';
    history.hostUpdate();
    world.range = 'week';
    history.hostUpdate();
    await settle();
    expect(calls.statistics).toHaveLength(2);
  });

  test('a late reply for a range that is no longer shown is dropped, and the range shown is asked for', async () => {
    const {history, host, calls, state, world} = setup();
    let release: (rows: Stats) => void = () => undefined;
    state.statistics = () => new Promise<Stats>(resolve => (release = resolve));
    history.hostConnected();
    world.range = 'week';
    state.statistics = () => Promise.resolve({'sensor.den_t': [row(NOW - HOUR, 18)]});
    history.hostUpdate();
    await settle();
    release({'sensor.den_t': [row(NOW - HOUR, 25)]});
    await settle();
    expect(calls.statistics.map(call => call.period)).toEqual(['5minute', 'hour']);
    expect(history.data('day', 1)).toBeNull();
    expect(history.data('week', 1)?.rooms.den[0][1]).toBe(18);
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
  });

  test('a reply that arrives after the pane left is dropped, and coming back asks again', async () => {
    const {history, host, calls, state} = setup();
    let release: (rows: Stats) => void = () => undefined;
    state.statistics = () => new Promise<Stats>(resolve => (release = resolve));
    history.hostConnected();
    history.hostDisconnected();
    release({'sensor.den_t': [row(NOW - HOUR, 25)]});
    await settle();
    expect(history.data('day', 1)).toBeNull();
    expect(host.requestUpdate).not.toHaveBeenCalled();
    state.statistics = () => Promise.resolve({});
    history.hostConnected();
    await settle();
    expect(calls.statistics).toHaveLength(2);
    expect(history.data('day', 1)).not.toBeNull();
  });

  test('a config of another generation has no data, and loads again', async () => {
    const {history, calls, world} = setup();
    history.hostConnected();
    await settle();
    world.generation = 2;
    expect(history.data('day', 2)).toBeNull();
    history.hostUpdate();
    await settle();
    expect(calls.statistics).toHaveLength(2);
    expect(history.data('day', 2)).not.toBeNull();
  });

  test('what was derived under another config is let go, not kept for a generation that may come back', async () => {
    const {history, world} = setup();
    history.hostConnected();
    await settle();
    world.range = 'week';
    history.hostUpdate();
    await settle();
    world.generation = 2;
    world.range = 'day';
    history.hostUpdate();
    await settle();
    // the week was never asked again under the new config, yet its old entry is gone: back under the old generation there is nothing
    expect(history.data('week', 1)).toBeNull();
    expect(history.data('day', 1)).toBeNull();
    expect(history.data('day', 2)).not.toBeNull();
  });

  test('asks the cache for the sensors a house has: a room missing one, or an unset outside sensor, sends no empty id', async () => {
    const missing = {
      entities: {...DEFAULT_ENTITIES, outT: null, hp: null},
      rooms: [{k: 'den', temp: 'sensor.den_t', target: null, power: undefined}],
    };
    const {history, calls} = setup({config: missing});
    history.hostConnected();
    await settle();
    expect(calls.statistics).toHaveLength(1);
    expect(calls.statistics[0].ids).toEqual(['sensor.den_t']);
    expect(history.data('day', 1)?.rooms.den).toBeDefined();
  });

  test('a StaleReply is no failure: the next update asks again under the new config', async () => {
    const {history, calls, state, world} = setup();
    state.statistics = () => Promise.reject(new StaleReply());
    history.hostConnected();
    await settle();
    expect(history.failed('day', world.generation)).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
    state.statistics = () => Promise.resolve({});
    history.hostUpdate();
    await settle();
    expect(calls.statistics).toHaveLength(2);
    expect(history.data('day', 1)).not.toBeNull();
  });

  test('a failure is logged and said, asked again no sooner than a minute, and cleared by the next success; only for its own range', async () => {
    const {history, calls, state, world} = setup();
    state.statistics = () => Promise.reject(new Error('boom'));
    history.hostConnected();
    await settle();
    expect(history.failed('day', 1)).toBe(true);
    expect(history.failed('week', 1)).toBe(false);
    expect(history.failed('day', 2)).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(1);
    history.hostUpdate();
    await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
    history.hostUpdate();
    await settle();
    expect(calls.statistics).toHaveLength(1);
    // another range is not held back by the day's failure
    world.range = 'week';
    state.statistics = () => Promise.resolve({});
    history.hostUpdate();
    await settle();
    expect(calls.statistics).toHaveLength(2);
    world.range = 'day';
    await vi.advanceTimersByTimeAsync(1);
    history.hostUpdate();
    await settle();
    expect(calls.statistics).toHaveLength(3);
    expect(history.failed('day', 1)).toBe(false);
    expect(history.data('day', 1)).not.toBeNull();
  });

  test('a heat pump history that fails is an empty one, the rooms still draw; a StaleReply from it is not', async () => {
    const {history, calls, state} = setup();
    state.history = () => Promise.reject(new Error('no history'));
    history.hostConnected();
    await settle();
    expect(history.data('day', 1)?.hp).toEqual([]);
    expect(history.data('day', 1)?.rooms.den).toHaveLength(1);
    state.history = () => Promise.reject(new StaleReply());
    await vi.advanceTimersByTimeAsync(HISTORY_TTL_MS);
    history.hostUpdate();
    await settle();
    expect(calls.history).toHaveLength(2);
    // the reply was let through as a StaleReply, not read as an empty history: the entry is the first load's
    expect(history.data('day', 1)?.at).toBe(NOW);
    expect(history.failed('day', 1)).toBe(false);
  });

  test('a house without a heat pump asks for no history, and one with no sensor at all asks for no statistics', async () => {
    const bare = {entities: {...DEFAULT_ENTITIES, hp: null, outT: null}, rooms: []};
    const {history, calls} = setup({config: bare});
    history.hostConnected();
    await settle();
    expect(calls.history).toEqual([]);
    expect(calls.statistics).toEqual([]);
    expect(history.data('day', 1)).toMatchObject({rooms: {}, out: [], hp: []});
    const withoutPump = setup({config: {...config, entities: {...config.entities, hp: null}}});
    withoutPump.history.hostConnected();
    await settle();
    expect(withoutPump.calls.history).toEqual([]);
    expect(withoutPump.calls.statistics).toHaveLength(1);
  });

  test('without the cache (it arrives when the pane connects) it asks nothing', async () => {
    const controllers: {hostUpdate?(): void}[] = [];
    const host = {
      addController: (controller: (typeof controllers)[number]) => controllers.push(controller),
      removeController: () => undefined,
      requestUpdate: vi.fn(),
      updateComplete: Promise.resolve(true),
    };
    const history = new ClimateHistory(
      host,
      () => ({cache: undefined, store: {generation: 1, config}, range: 'day'}) as unknown as ClimateHistoryDeps,
    );
    history.hostUpdate();
    await settle();
    expect(history.data('day', 1)).toBeNull();
    expect(host.requestUpdate).not.toHaveBeenCalled();
  });
});
