// The statistics cache at the hass seam (ADR 0005): the real API client over the fake hass, a clock the test drives, and the
// messages that left (`hass.calls.ws`) as the proof of what was asked and what was not.
import {describe, expect, test} from 'vitest';
import {createApi, StaleReply} from '../../../src/core/api.ts';
import {resolveConfig} from '../../../src/core/config.ts';
import {createStatisticsCache} from '../../../src/core/statistics-cache.ts';
import {createStore} from '../../../src/core/store.ts';
import {fakeHass} from '../fake-hass.ts';

const TTL = 15 * 60_000;
const START = new Date('2026-01-01T00:00:00.000Z');
const END = new Date('2026-01-02T00:00:00.000Z');
const MINIMAL = {minimal: true, attributes: false};

function setup() {
  const hass = fakeHass();
  const store = createStore({defaultTimeZone: 'UTC', resolve: resolveConfig});
  store.setHass(hass);
  const clock = {at: 1_000_000};
  const cache = createStatisticsCache(createApi(store), {ttlMs: TTL, now: () => clock.at});
  const asked = (type: string) => hass.calls.ws.filter(msg => (msg as {type: string}).type === type).length;
  return {hass, store, clock, cache, statisticsAsked: () => asked('recorder/statistics_during_period')};
}

describe('statistics', () => {
  test('a fresh hit returns the same promise and asks nothing more', async () => {
    const {cache, statisticsAsked} = setup();
    const first = cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    const second = cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    expect(second).toBe(first);
    await first;
    expect(statisticsAsked()).toBe(1);
  });

  test('the message that leaves is the client own, with the end time when there is one', async () => {
    const {hass, cache} = setup();
    await cache.statistics(['sensor.a', 'sensor.b'], 'day', START, ['min', 'max'], END);
    expect(hass.calls.ws).toEqual([
      {
        type: 'recorder/statistics_during_period',
        start_time: '2026-01-01T00:00:00.000Z',
        end_time: '2026-01-02T00:00:00.000Z',
        statistic_ids: ['sensor.a', 'sensor.b'],
        period: 'day',
        types: ['min', 'max'],
        units: {power: 'kW', energy: 'kWh', temperature: '°C'},
      },
    ]);
  });

  test('the reply is the client own', async () => {
    const {hass, cache} = setup();
    hass.replies.set('recorder/statistics_during_period', () => ({
      'sensor.a': [{start: 1767225600000, end: 1767229200000, mean: 1.5}],
    }));
    expect(await cache.statistics(['sensor.a'], 'hour', START, ['mean'])).toEqual({
      'sensor.a': [expect.objectContaining({start: 1767225600000, mean: 1.5})],
    });
  });

  test('the order of the ids, a repeated id, an empty one and the order of the types do not change the key', async () => {
    const {cache, statisticsAsked} = setup();
    const first = cache.statistics(['sensor.b', 'sensor.a'], 'hour', START, ['mean', 'max']);
    expect(
      cache.statistics(['sensor.a', null, 'sensor.b', 'sensor.a', undefined], 'hour', START, ['max', 'mean']),
    ).toBe(first);
    await first;
    expect(statisticsAsked()).toBe(1);
  });

  test.each([
    ['another id', () => ['sensor.c'] as string[], 'hour', START, ['mean'], undefined],
    ['another period', () => ['sensor.a'], 'day', START, ['mean'], undefined],
    ['another start', () => ['sensor.a'], 'hour', END, ['mean'], undefined],
    ['other types', () => ['sensor.a'], 'hour', START, ['mean', 'min'], undefined],
    ['an end', () => ['sensor.a'], 'hour', START, ['mean'], END],
  ] as const)('%s is another call', async (_name, ids, period, start, types, end) => {
    const {cache, statisticsAsked} = setup();
    await cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    await cache.statistics(ids(), period, start, types, end);
    expect(statisticsAsked()).toBe(2);
  });

  test('a miss after the time to live asks again, and the reply of the new call is the one kept', async () => {
    const {cache, clock, statisticsAsked} = setup();
    const first = cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    clock.at += TTL - 1;
    expect(cache.statistics(['sensor.a'], 'hour', START, ['mean'])).toBe(first);
    clock.at += 1;
    const second = cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    expect(second).not.toBe(first);
    expect(cache.statistics(['sensor.a'], 'hour', START, ['mean'])).toBe(second);
    await second;
    expect(statisticsAsked()).toBe(2);
  });

  test('a call that never asks the client (no id left) is cached like any other', async () => {
    const {hass, cache} = setup();
    const first = cache.statistics([null], 'hour', START, ['mean']);
    expect(cache.statistics([undefined], 'hour', START, ['mean'])).toBe(first);
    expect(await first).toEqual({});
    expect(hass.calls.ws).toEqual([]);
  });

  test('a rejected call is not cached: the next call asks again', async () => {
    const {hass, cache, statisticsAsked} = setup();
    hass.replies.set('recorder/statistics_during_period', () => Promise.reject(new Error('recorder busy')));
    await expect(cache.statistics(['sensor.a'], 'hour', START, ['mean'])).rejects.toThrow('recorder busy');
    hass.replies.set('recorder/statistics_during_period', () => ({'sensor.a': []}));
    await expect(cache.statistics(['sensor.a'], 'hour', START, ['mean'])).resolves.toEqual({'sensor.a': []});
    expect(statisticsAsked()).toBe(2);
  });

  test('a StaleReply passes through to every caller that shared the call, and is not cached either', async () => {
    const {hass, store, cache, statisticsAsked} = setup();
    let release = () => {};
    hass.replies.set(
      'recorder/statistics_during_period',
      () =>
        new Promise(resolve => {
          release = () => resolve({});
        }),
    );
    const first = cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    const second = cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    store.setPanelConfig({people: ['x']});
    release();
    await expect(first).rejects.toBeInstanceOf(StaleReply);
    await expect(second).rejects.toBeInstanceOf(StaleReply);
    hass.replies.set('recorder/statistics_during_period', () => ({}));
    await cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    expect(statisticsAsked()).toBe(2);
  });

  test('a call that misses after other entries expired still answers right (the sweep of their memory is not observable)', async () => {
    const {cache, clock, statisticsAsked} = setup();
    await cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    await cache.statistics(['sensor.b'], 'hour', START, ['mean']);
    clock.at += TTL;
    await cache.statistics(['sensor.c'], 'hour', START, ['mean']);
    await cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    expect(statisticsAsked()).toBe(4);
  });
});

describe('history', () => {
  test('a fresh hit returns the same promise; the message is the one the client sends', async () => {
    const {hass, cache} = setup();
    const first = cache.history(['sensor.b', 'sensor.a'], START, MINIMAL);
    expect(cache.history(['sensor.a', 'sensor.b'], START, MINIMAL)).toBe(first);
    await first;
    expect(hass.calls.ws).toEqual([
      {
        type: 'history/history_during_period',
        start_time: '2026-01-01T00:00:00.000Z',
        entity_ids: ['sensor.b', 'sensor.a'],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      },
    ]);
  });

  test('the options are part of the key: minimal, attributes and end', async () => {
    const {hass, cache} = setup();
    await cache.history(['sensor.a'], START, MINIMAL);
    await cache.history(['sensor.a'], START, {minimal: false, attributes: false});
    await cache.history(['sensor.a'], START, {minimal: true, attributes: true});
    await cache.history(['sensor.a'], START, {...MINIMAL, end: END});
    expect(hass.calls.ws).toHaveLength(4);
  });

  test('an expired entry asks again; a rejection is not kept', async () => {
    const {hass, cache, clock} = setup();
    await cache.history(['sensor.a'], START, MINIMAL);
    clock.at += TTL;
    hass.replies.set('history/history_during_period', () => Promise.reject(new Error('recorder busy')));
    await expect(cache.history(['sensor.a'], START, MINIMAL)).rejects.toThrow('recorder busy');
    hass.replies.set('history/history_during_period', () => ({}));
    await expect(cache.history(['sensor.a'], START, MINIMAL)).resolves.toEqual({});
    expect(hass.calls.ws).toHaveLength(3);
  });

  test('statistics and history never share an entry', async () => {
    const {hass, cache} = setup();
    await cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    await cache.history(['sensor.a'], START, MINIMAL);
    expect(hass.calls.ws).toHaveLength(2);
  });
});

describe('clear', () => {
  test('forgets the fresh entries of both reads', async () => {
    const {hass, cache} = setup();
    await cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    await cache.history(['sensor.a'], START, MINIMAL);
    cache.clear();
    await cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    await cache.history(['sensor.a'], START, MINIMAL);
    expect(hass.calls.ws).toHaveLength(4);
  });

  test('a call that fails after a clear() does not forget the newer call for the same key', async () => {
    const {hass, cache, statisticsAsked} = setup();
    let fail: (reason: Error) => void = () => {};
    hass.replies.set(
      'recorder/statistics_during_period',
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const old = cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    const oldFailed = expect(old).rejects.toThrow('recorder busy');
    cache.clear();
    hass.replies.set('recorder/statistics_during_period', () => ({}));
    const fresh = cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    fail(new Error('recorder busy'));
    await oldFailed;
    expect(cache.statistics(['sensor.a'], 'hour', START, ['mean'])).toBe(fresh);
    expect(statisticsAsked()).toBe(2);
  });
});

describe('the clock', () => {
  test('is Date.now unless the caller injects one', async () => {
    const hass = fakeHass();
    const store = createStore({defaultTimeZone: 'UTC', resolve: resolveConfig});
    store.setHass(hass);
    const cache = createStatisticsCache(createApi(store), {ttlMs: TTL});
    const first = cache.statistics(['sensor.a'], 'hour', START, ['mean']);
    expect(cache.statistics(['sensor.a'], 'hour', START, ['mean'])).toBe(first);
    await first;
  });
});
