// CarHistory at the controller seam (ADR 0005): a fake cache, a fake store and a fake host; no Lit element is mounted in Node.
// The clock is Vitest's, so "fifteen minutes" is a call to advanceTimersByTime and not a wait.
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {StaleReply} from '../../../../src/core/api.ts';
import {DEFAULT_ENTITIES} from '../../../../src/core/entities.ts';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {HISTORY_RETRY_MS, STATISTICS_TTL_MS} from '../../../../src/core/statistics-cache.ts';
import {CarHistory, type CarHistoryDeps} from '../../../../src/features/car/loader.ts';
import {fakeHass} from '../../fake-hass.ts';

const fmt = createFormatters(
  panelLocale(fakeHass({locale: {language: 'en'}}), {timeZone: 'America/Toronto', browserLocale: 'en'}),
);
const NOW = Date.parse('2026-11-09T09:45:00-05:00');
const HOUR = 36e5;
const DAY = 864e5;
const row = (start: number, fields: Partial<StatisticRow>): StatisticRow => ({start, end: start + HOUR, ...fields});
const config = {entities: {...DEFAULT_ENTITIES, grid: 'sensor.grid', evP: 'sensor.ev'}};

type Call = [ids: readonly (string | null | undefined)[], period: string];

/** A cache that answers each window by its period, and remembers what it was asked; `answer` may be replaced to hold or fail a reply. */
function fakeCache() {
  const calls: Call[] = [];
  const state = {
    answer: (ids: readonly (string | null | undefined)[], period: string): Promise<Record<string, StatisticRow[]>> => {
      const midnight = Date.parse('2026-11-09T00:00:00-05:00');
      if (period === 'hour') {
        // two hours of 7 kW: one session of 14 kWh
        return Promise.resolve({
          'sensor.ev': [row(NOW - 3 * HOUR, {mean: 7, max: 7.4}), row(NOW - 2 * HOUR, {mean: 7, max: 7.1})],
        });
      }
      return Promise.resolve({
        'sensor.grid': [row(midnight - DAY, {mean: 1}), row(midnight, {mean: 2})],
        'sensor.ev': [row(midnight - DAY, {mean: 0.5})],
      });
    },
  };
  const cache = {
    statistics: (ids: readonly (string | null | undefined)[], period: string) => {
      calls.push([ids, period]);
      return state.answer(ids, period);
    },
  };
  return {cache, calls, state};
}

function setup() {
  const {cache, calls, state} = fakeCache();
  const store = {generation: 1, config};
  const controllers: {hostConnected?(): void; hostUpdate?(): void; hostDisconnected?(): void}[] = [];
  const host = {
    active: true,
    addController: (controller: (typeof controllers)[number]) => controllers.push(controller),
    removeController: () => undefined,
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
  const deps = {cache, store, fmt} as unknown as CarHistoryDeps;
  const history = new CarHistory(host, () => deps);
  return {history, host, calls, state, store, controller: controllers[0]};
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

describe('CarHistory', () => {
  test('registers with its host, and loads the two windows together when the host connects', async () => {
    const {history, host, calls, controller} = setup();
    expect(controller).toBe(history);
    history.hostConnected();
    await settle();
    expect(calls.map(([, period]) => period).sort()).toEqual(['day', 'hour']);
    expect(history.error).toBeNull();
    expect(history.data?.at).toBe(NOW);
    expect(history.data?.sessions).toHaveLength(1);
    expect(history.data?.sessions[0]).toMatchObject({kwh: 14, peak: 7.4});
    expect(history.data?.daily).toEqual([
      {day: '2026-11-08', ev: 12},
      {day: '2026-11-09', ev: 0},
    ]);
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
  });

  test('does not load again within fifteen minutes, whatever the updates', async () => {
    const {history, calls} = setup();
    history.hostConnected();
    await settle();
    history.hostUpdate();
    history.hostConnected();
    await vi.advanceTimersByTimeAsync(STATISTICS_TTL_MS - 1);
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(2);
  });

  test('loads again once the data is fifteen minutes old', async () => {
    const {history, calls} = setup();
    history.hostConnected();
    await vi.advanceTimersByTimeAsync(STATISTICS_TTL_MS);
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(4);
    expect(history.data?.at).toBe(NOW + STATISTICS_TTL_MS);
  });

  test('loads again after the config generation changed, once', async () => {
    const {history, calls, store} = setup();
    history.hostConnected();
    await settle();
    store.generation = 2;
    history.hostUpdate();
    history.hostUpdate(); // the load of generation 2 is on its way: no second one
    await settle();
    expect(calls).toHaveLength(4);
  });

  test('asks nothing while the host is hidden, even when it connects, and loads once when it is shown', async () => {
    const {history, host, calls} = setup();
    host.active = false;
    history.hostConnected();
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(0);
    host.active = true;
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(2);
  });

  test('drops a reply that was on its way when the config changed', async () => {
    const {history, host, calls, state, store} = setup();
    const held: (() => void)[] = [];
    const answer = state.answer;
    state.answer = (ids, period) => new Promise(resolve => held.push(() => resolve(answer(ids, period))));
    history.hostConnected();
    await settle();
    store.generation = 2;
    history.hostUpdate(); // a second request, for generation 2
    await settle();
    expect(calls).toHaveLength(4);
    held.splice(0, 2).forEach(release => release()); // the first two answer last: dropped
    await settle();
    expect(history.data).toBeNull();
    expect(host.requestUpdate).not.toHaveBeenCalled();
    held.forEach(release => release());
    await settle();
    expect(history.data).not.toBeNull();
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
  });

  test('drops a reply that arrives after the host disconnected, and loads again when it connects', async () => {
    const {history, host, calls, state, controller} = setup();
    const held: (() => void)[] = [];
    const answer = state.answer;
    state.answer = (ids, period) => new Promise(resolve => held.push(() => resolve(answer(ids, period))));
    history.hostConnected();
    controller.hostDisconnected?.();
    held.forEach(release => release());
    await settle();
    expect(history.data).toBeNull();
    expect(host.requestUpdate).not.toHaveBeenCalled();
    state.answer = answer;
    history.hostConnected();
    await settle();
    expect(calls).toHaveLength(4);
    expect(history.data).not.toBeNull();
  });

  test('drops a failure that arrives after the host disconnected', async () => {
    const {history, host, state, controller} = setup();
    let fail: (reason: unknown) => void = () => undefined;
    state.answer = () => new Promise((_, reject) => (fail = reject));
    history.hostConnected();
    controller.hostDisconnected?.();
    fail(new Error('too late'));
    await settle();
    expect(history.error).toBeNull();
    expect(host.requestUpdate).not.toHaveBeenCalled();
  });

  test('a StaleReply is no failure: the error stays empty and the next update asks again', async () => {
    const {history, host, calls, state} = setup();
    const answer = state.answer;
    state.answer = () => Promise.reject(new StaleReply(1, 2));
    history.hostConnected();
    await settle();
    expect(history.error).toBeNull();
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    state.answer = answer;
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(4);
    expect(history.data).not.toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  test('a failure sets the error, says it once a minute at most, and a later success clears it', async () => {
    const {history, host, calls, state} = setup();
    const answer = state.answer;
    state.answer = () => Promise.reject(Object.assign(new Error('No recorder'), {code: 'unknown_error'}));
    history.hostConnected();
    await settle();
    expect(history.error).toBe('No recorder');
    expect(history.data).toBeNull();
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    const asked = calls.length;
    history.hostUpdate(); // the update the failure itself caused
    await settle();
    expect(calls).toHaveLength(asked);
    state.answer = () => Promise.reject(Object.assign(new Error(''), {code: 'timeout'}));
    await vi.advanceTimersByTimeAsync(HISTORY_RETRY_MS);
    history.hostUpdate();
    await settle();
    expect(history.error).toBe('timeout');
    state.answer = answer;
    await vi.advanceTimersByTimeAsync(HISTORY_RETRY_MS);
    history.hostUpdate();
    await settle();
    expect(history.error).toBeNull();
    expect(history.data).not.toBeNull();
  });
});
