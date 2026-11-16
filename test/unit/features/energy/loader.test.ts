// EnergyHistory at the controller seam (ADR 0005): a fake cache, a fake store and a fake host; no Lit element is mounted in Node.
// The clock is Vitest's, so "fifteen minutes" is a call to advanceTimersByTime and not a wait.
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {StaleReply} from '../../../../src/core/api.ts';
import {DEFAULT_ENTITIES} from '../../../../src/core/entities.ts';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {deriveEnergyHistory, type EnergyReplies} from '../../../../src/features/energy/history.ts';
import {STATISTICS_TTL_MS} from '../../../../src/core/statistics-cache.ts';
import {HISTORY_RETRY_MS} from '../../../../src/core/statistics-cache.ts';
import {EnergyHistory, type EnergyHistoryDeps} from '../../../../src/features/energy/loader.ts';
import {fakeHass} from '../../fake-hass.ts';

const fmt = createFormatters(
  panelLocale(fakeHass({locale: {language: 'en'}}), {timeZone: 'America/Toronto', browserLocale: 'en'}),
);
const NOW = Date.parse('2026-11-09T09:45:00-05:00');
const HOUR = 36e5;
const DAY = 864e5;
const row = (start: number, fields: Partial<StatisticRow>): StatisticRow => ({start, end: start + HOUR, ...fields});
const config = {
  entities: {
    ...DEFAULT_ENTITIES,
    grid: 'sensor.grid',
    whP: 'sensor.wh_power',
    whT: 'sensor.wh_temp',
    whE: 'sensor.wh_energy',
    evP: 'sensor.ev',
    energy: 'sensor.meter',
  },
  rooms: [{power: 'sensor.a_power'}] as never,
};

type Call = [ids: readonly (string | null | undefined)[], period: string];

/** A cache that answers each window by its period, and remembers what it was asked; `answer` may be replaced to hold or fail a reply. */
function fakeCache() {
  const calls: Call[] = [];
  const state = {
    answer: (ids: readonly (string | null | undefined)[], period: string): Promise<Record<string, StatisticRow[]>> => {
      const midnight = Date.parse('2026-11-09T00:00:00-05:00');
      if (period === 'hour' && ids[0] === 'sensor.grid')
        return Promise.resolve({'sensor.grid': [row(NOW - HOUR, {mean: 2})]});
      if (period === 'day' && ids[0] === 'sensor.grid')
        return Promise.resolve({'sensor.grid': [row(midnight - DAY, {mean: 1})]});
      return Promise.resolve({});
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
  const deps: EnergyHistoryDeps = {cache, store, fmt};
  const history = new EnergyHistory(host, () => deps);
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

describe('EnergyHistory', () => {
  test('registers with its host, and loads the five windows in one go when the host connects', async () => {
    const {history, host, calls, controller} = setup();
    expect(controller).toBe(history);
    history.hostConnected();
    await settle();
    expect(calls.map(([, period]) => period).sort()).toEqual(['5minute', 'day', 'day', 'hour', 'hour']);
    expect(history.error).toBeNull();
    expect(history.data?.at).toBe(NOW);
    expect(history.data?.flow).toEqual([[NOW - HOUR, 0, 0, 0, 2, 2]]);
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
    expect(calls).toHaveLength(5);
  });

  test('loads again once the data is fifteen minutes old', async () => {
    const {history, calls} = setup();
    history.hostConnected();
    await vi.advanceTimersByTimeAsync(STATISTICS_TTL_MS);
    history.hostUpdate();
    await settle();
    expect(calls).toHaveLength(10);
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
    expect(calls).toHaveLength(10);
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
    expect(calls).toHaveLength(5);
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
    expect(calls).toHaveLength(10);
    held.splice(0, 5).forEach(release => release()); // the first five answer last: dropped
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
    expect(calls).toHaveLength(10);
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
    expect(calls).toHaveLength(10);
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

  test('a rejection with neither a message nor a code still gives a reason', async () => {
    const {history, state} = setup();
    state.answer = () => Promise.reject(new Error(''));
    history.hostConnected();
    await settle();
    expect(history.error).toBe('Error');
  });
});

describe('deriveEnergyHistory', () => {
  const midnight = Date.parse('2026-11-09T00:00:00-05:00');
  const replies: EnergyReplies = {
    hour7: {
      'sensor.grid': [row(NOW - HOUR, {mean: 3})],
      'sensor.wh_power': [row(NOW - HOUR, {mean: 1})],
      'sensor.a_power': [row(NOW - HOUR, {mean: 0.5})],
    },
    day400: {
      'sensor.grid': [row(midnight - DAY, {mean: 1}), row(midnight, {mean: 2})],
      'sensor.a_power': [row(midnight - DAY, {mean: 0.25})],
    },
    meter33: {
      'sensor.meter': [row(midnight - DAY, {change: 7}), row(midnight, {change: 3})],
      'sensor.wh_energy': [row(midnight - DAY, {change: 2}), row(midnight, {change: 1})],
    },
    today: {'sensor.meter': [row(midnight, {change: 3})]},
    fiveMin25h: {'sensor.wh_temp': [row(NOW - 3e5, {mean: 50})], 'sensor.wh_power': [row(NOW - 3e5, {mean: 4})]},
  };

  test('every slice from its window: the hourly week, the days, the months, the meter and the water heater', () => {
    const data = deriveEnergyHistory(replies, config, NOW, fmt);
    expect(data.at).toBe(NOW);
    expect(data.flow).toEqual([[NOW - HOUR, 0, 1, 0.5, 1.5, 3]]);
    // yesterday is 24 hours; today 9 of them (09:45)
    expect(data.daily.map(day => [day.day, day.total, day.heat])).toEqual([
      ['2026-11-08', 24, 6],
      ['2026-11-09', 18, 0],
    ]);
    expect(data.g30).toEqual([6, 0, 0, 36]);
    expect(data.room30).toEqual([6]);
    expect(data.monthly).toEqual([['2026-11', {heat: 6, wh: 0, ev: 0, rest: 36}]]);
    expect(data.totals).toEqual({today: 3, yesterday: 7, d30: 10, month: 10});
    expect(data.wh24).toEqual({t: [[NOW - 3e5, 50]], p: [[NOW - 3e5, 4]]});
    expect(data.wh14).toEqual([['2026-11-08', 2]]);
  });
});
