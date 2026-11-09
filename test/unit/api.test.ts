// The API client at the hass seam (ADR 0005, ADR 0014): hand it the fake hass, assert the exact message that left and the
// typed value that came back from a literal wire reply. No socket is mocked; callWS is a function on an object.
import {describe, expect, test, vi} from 'vitest';
import {createApi, StaleReply} from '../../src/core/api.ts';
import type {ForecastEntry} from '../../src/core/ha.ts';
import {createStore} from '../../src/core/store.ts';
import {fakeHass} from './fake-hass.ts';

const setup = (init: Parameters<typeof fakeHass>[0] = {}) => {
  const hass = fakeHass(init);
  const store = createStore({defaultTimeZone: 'UTC', resolve: raw => raw});
  store.setHass(hass);
  return {hass, store, api: createApi(store)};
};

const START = new Date('2026-01-01T00:00:00.000Z');
const END = new Date('2026-01-02T00:00:00.000Z');

describe('statistics', () => {
  test('sends the statistics message, with the ids asked once and the empty ones dropped', async () => {
    const {hass, api} = setup();
    await api.statistics(['sensor.a', undefined, 'sensor.a', null, 'sensor.b'], 'hour', START, ['mean', 'max']);
    expect(hass.calls.ws).toEqual([
      {
        type: 'recorder/statistics_during_period',
        start_time: '2026-01-01T00:00:00.000Z',
        statistic_ids: ['sensor.a', 'sensor.b'],
        period: 'hour',
        types: ['mean', 'max'],
        units: {power: 'kW', energy: 'kWh', temperature: '°C'},
      },
    ]);
  });

  test('adds the end time when there is one', async () => {
    const {hass, api} = setup();
    await api.statistics(['sensor.a'], 'day', START, ['change'], END);
    expect(hass.calls.ws[0]).toMatchObject({end_time: '2026-01-02T00:00:00.000Z', types: ['change']});
  });

  test('asks nothing when no id is left', async () => {
    const {hass, api} = setup();
    expect(await api.statistics([undefined, null, ''], 'hour', START, ['mean'])).toEqual({});
    expect(hass.calls.ws).toEqual([]);
  });

  test('reads start and end as milliseconds, whether Home Assistant sent a number or an ISO string', async () => {
    const {hass, api} = setup();
    hass.replies.set('recorder/statistics_during_period', () => ({
      'sensor.a': [
        {
          start: 1767225600000,
          end: 1767229200000,
          mean: 1.5,
          min: 1,
          max: 2,
          change: null,
          sum: 9,
          state: 3,
          extra: 'x',
        },
        {start: '2026-01-01T01:00:00+00:00', end: '2026-01-01T02:00:00+00:00', mean: null},
      ],
    }));
    expect(await api.statistics(['sensor.a'], 'hour', START, ['mean'])).toEqual({
      'sensor.a': [
        {start: 1767225600000, end: 1767229200000, mean: 1.5, min: 1, max: 2, change: null, sum: 9, state: 3},
        {start: 1767229200000, end: 1767232800000, mean: null},
      ],
    });
  });

  test('an empty reply is an empty record', async () => {
    const {hass, api} = setup();
    hass.replies.set('recorder/statistics_during_period', () => null);
    expect(await api.statistics(['sensor.a'], 'hour', START, ['mean'])).toEqual({});
  });
});

describe('history', () => {
  test('sends the minimal message the sensor sheet and the weather sheet send', async () => {
    const {hass, api} = setup();
    await api.history(['binary_sensor.door'], START, {minimal: true, attributes: false});
    expect(hass.calls.ws).toEqual([
      {
        type: 'history/history_during_period',
        start_time: '2026-01-01T00:00:00.000Z',
        entity_ids: ['binary_sensor.door'],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      },
    ]);
  });

  test('sends the full message the heat pump loads send, and the end time when there is one', async () => {
    const {hass, api} = setup();
    await api.history(['climate.pump'], START, {minimal: false, attributes: true, end: END});
    expect(hass.calls.ws).toEqual([
      {
        type: 'history/history_during_period',
        start_time: '2026-01-01T00:00:00.000Z',
        entity_ids: ['climate.pump'],
        minimal_response: false,
        no_attributes: false,
        significant_changes_only: false,
        end_time: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  test('reads the minimal shape: seconds to milliseconds, lu else lc, lc else lu', async () => {
    const {hass, api} = setup();
    hass.replies.set('history/history_during_period', () => ({
      'binary_sensor.door': [
        {s: 'on', a: {friendly_name: 'Door'}, lu: 1767225601, lc: 1767225600},
        {s: 'off', lc: 1767225700},
        {s: 'on', lu: 1767225800},
      ],
    }));
    expect(await api.history(['binary_sensor.door'], START, {minimal: true, attributes: false})).toEqual({
      'binary_sensor.door': [
        {state: 'on', lastUpdated: 1767225601000, lastChanged: 1767225600000, attributes: {friendly_name: 'Door'}},
        {state: 'off', lastUpdated: 1767225700000, lastChanged: 1767225700000},
        {state: 'on', lastUpdated: 1767225800000, lastChanged: 1767225800000},
      ],
    });
  });

  test('reads the full shape: ISO strings or numbers to milliseconds, attributes kept', async () => {
    const {hass, api} = setup();
    hass.replies.set('history/history_during_period', () => ({
      'climate.pump': [
        {
          state: 'heat',
          attributes: {current_temperature: 21},
          last_updated: '2026-01-01T00:00:01+00:00',
          last_changed: '2026-01-01T00:00:00+00:00',
        },
        {state: 'off', last_updated: 1767225700000, last_changed: 1767225700000},
      ],
    }));
    expect(await api.history(['climate.pump'], START, {minimal: false, attributes: true})).toEqual({
      'climate.pump': [
        {state: 'heat', lastUpdated: 1767225601000, lastChanged: 1767225600000, attributes: {current_temperature: 21}},
        {state: 'off', lastUpdated: 1767225700000, lastChanged: 1767225700000},
      ],
    });
  });

  test('an empty reply is an empty record', async () => {
    const {hass, api} = setup();
    hass.replies.set('history/history_during_period', () => undefined);
    expect(await api.history(['climate.pump'], START, {minimal: false, attributes: true})).toEqual({});
  });
});

describe('system data', () => {
  test('gets the value under the key', async () => {
    const {hass, api} = setup();
    hass.replies.set('frontend/get_system_data', () => ({value: {light_order: ['a', 'b'], light_links: [['a', 'b']]}}));
    expect(await api.getSystemData('home_panel')).toEqual({light_order: ['a', 'b'], light_links: [['a', 'b']]});
    expect(hass.calls.ws).toEqual([{type: 'frontend/get_system_data', key: 'home_panel'}]);
  });

  test('is null when nothing is set, or when there is no reply', async () => {
    const {hass, api} = setup();
    expect(await api.getSystemData('home_panel')).toBeNull();
    hass.replies.set('frontend/get_system_data', () => null);
    expect(await api.getSystemData('home_panel')).toBeNull();
  });

  test('a read that opts out of the staleness check resolves although the config changed meanwhile', async () => {
    const ctx = setup();
    let release = () => {};
    ctx.hass.replies.set(
      'frontend/get_system_data',
      () =>
        new Promise(resolve => {
          release = () => resolve({value: {light_order: ['a']}});
        }),
    );
    const asked = ctx.api.getSystemData('home_panel', {stale: false});
    ctx.store.setPanelConfig({people: ['x']});
    release();
    await expect(asked).resolves.toEqual({light_order: ['a']});
    expect(ctx.hass.calls.ws).toEqual([{type: 'frontend/get_system_data', key: 'home_panel'}]);
  });

  test('sets the value under the key', async () => {
    const {hass, api} = setup();
    await api.setSystemData('home_panel', {light_order: null, light_links: [['a', 'b']]});
    expect(hass.calls.ws).toEqual([
      {type: 'frontend/set_system_data', key: 'home_panel', value: {light_order: null, light_links: [['a', 'b']]}},
    ]);
  });
});

describe('automation traces', () => {
  const summary = {
    item_id: 'a1',
    run_id: 'r1',
    timestamp: {start: '2026-01-01T00:00:00+00:00', finish: '2026-01-01T00:00:01+00:00'},
    state: 'stopped',
    script_execution: 'finished',
    last_step: 'action/0',
  };

  test('lists the runs of a domain', async () => {
    const {hass, api} = setup();
    hass.replies.set('trace/list', () => [summary]);
    expect(await api.traceList('automation')).toEqual([summary]);
    expect(hass.calls.ws).toEqual([{type: 'trace/list', domain: 'automation'}]);
  });

  test('a missing list is an empty list', async () => {
    const {hass, api} = setup();
    hass.replies.set('trace/list', () => null);
    expect(await api.traceList('automation')).toEqual([]);
  });

  test('gets one trace', async () => {
    const {hass, api} = setup();
    const trace = {trace: {'trigger/0': [{timestamp: '2026-01-01T00:00:00+00:00'}]}, last_step: 'action/0'};
    hass.replies.set('trace/get', () => trace);
    expect(await api.traceGet('automation', 'a1', 'r1')).toEqual(trace);
    expect(hass.calls.ws).toEqual([{type: 'trace/get', domain: 'automation', item_id: 'a1', run_id: 'r1'}]);
  });

  test('a missing trace is an empty one', async () => {
    const {hass, api} = setup();
    hass.replies.set('trace/get', () => undefined);
    expect(await api.traceGet('automation', 'a1', 'r1')).toEqual({});
  });

  test('gets the configuration of an automation', async () => {
    const {hass, api} = setup();
    hass.replies.set('automation/config', () => ({config: {alias: 'Porch light', triggers: []}}));
    expect(await api.automationConfig('automation.porch')).toEqual({config: {alias: 'Porch light', triggers: []}});
    expect(hass.calls.ws).toEqual([{type: 'automation/config', entity_id: 'automation.porch'}]);
  });

  test('a missing configuration is null, so the caller falls back to the trace', async () => {
    const {hass, api} = setup();
    hass.replies.set('automation/config', () => null);
    expect((await api.automationConfig('automation.porch')).config).toBeNull();
  });

  test('a reply that is the bare configuration is read as the configuration', async () => {
    const {hass, api} = setup();
    hass.replies.set('automation/config', () => ({alias: 'Porch light', triggers: []}));
    expect(await api.automationConfig('automation.porch')).toEqual({config: {alias: 'Porch light', triggers: []}});
  });
});

describe('lovelace resources', () => {
  test('lists them', async () => {
    const {hass, api} = setup();
    const rs = [{id: 'x', url: '/hacsfiles/a/a.js', type: 'module'}];
    hass.replies.set('lovelace/resources', () => rs);
    expect(await api.lovelaceResources()).toEqual(rs);
    expect(hass.calls.ws).toEqual([{type: 'lovelace/resources'}]);
  });

  test('an answer that is not a list is an empty list', async () => {
    const {hass, api} = setup();
    hass.replies.set('lovelace/resources', () => ({}));
    expect(await api.lovelaceResources()).toEqual([]);
  });
});

describe('subscribeForecast', () => {
  const forecast: ForecastEntry[] = [{datetime: '2026-01-01T12:00:00+00:00', condition: 'sunny', temperature: 3}];

  test('sends the message, forwards the forecast and returns the unsubscribe function', async () => {
    const unsubscribe = vi.fn(() => Promise.resolve());
    const subscribeMessage = vi.fn((cb: (m: unknown) => void) => {
      cb({forecast});
      cb({});
      cb(null);
      return Promise.resolve(unsubscribe);
    });
    const {api} = setup({connection: {subscribeMessage}});
    const cb = vi.fn();
    const off = await api.subscribeForecast('weather.home', 'hourly', cb);
    expect(subscribeMessage).toHaveBeenCalledWith(expect.any(Function), {
      type: 'weather/subscribe_forecast',
      forecast_type: 'hourly',
      entity_id: 'weather.home',
    });
    expect(cb.mock.calls).toEqual([[forecast], [[]], [[]]]);
    off();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('rejects when the hass has no connection', async () => {
    const {api} = setup();
    await expect(api.subscribeForecast('weather.home', 'daily', vi.fn())).rejects.toThrow(/no live connection/);
  });
});

describe('runService', () => {
  test('forwards the domain, the service and the data', async () => {
    const {hass, api} = setup();
    await expect(api.runService('media_player', 'turn_on', {entity_id: 'media_player.tv'})).resolves.toBeUndefined();
    expect(hass.calls.service).toEqual([
      {domain: 'media_player', service: 'turn_on', data: {entity_id: 'media_player.tv'}},
    ]);
  });

  test('lets the error of Home Assistant through', async () => {
    const {api} = setup({callService: () => Promise.reject(new Error('Service not found'))});
    await expect(api.runService('light', 'turn_on')).rejects.toThrow('Service not found');
  });
});

describe('stale replies', () => {
  /** A reply the test resolves when it chooses, so the config can change while the call is in flight. */
  function held(type: string, value: unknown) {
    const ctx = setup();
    let release = () => {};
    ctx.hass.replies.set(
      type,
      () =>
        new Promise(resolve => {
          release = () => resolve(value);
        }),
    );
    return {...ctx, release: () => release()};
  }

  test('a read rejects with StaleReply, carrying both generations, when the config changed meanwhile', async () => {
    const {api, store, release} = held('recorder/statistics_during_period', {});
    const asked = api.statistics(['sensor.a'], 'hour', START, ['mean']);
    store.setPanelConfig({people: ['x']});
    release();
    const err = await asked.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StaleReply);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({name: 'StaleReply', requested: 0, current: 1});
    expect((err as Error).message).toMatch(/generation 0.*at 1/);
  });

  test.each([
    [
      'history',
      'history/history_during_period',
      (api: ReturnType<typeof setup>['api']) => api.history(['a.b'], START, {minimal: true, attributes: false}),
    ],
    [
      'getSystemData',
      'frontend/get_system_data',
      (api: ReturnType<typeof setup>['api']) => api.getSystemData('home_panel'),
    ],
    ['traceList', 'trace/list', (api: ReturnType<typeof setup>['api']) => api.traceList('automation')],
    ['traceGet', 'trace/get', (api: ReturnType<typeof setup>['api']) => api.traceGet('automation', 'a', 'b')],
    [
      'automationConfig',
      'automation/config',
      (api: ReturnType<typeof setup>['api']) => api.automationConfig('automation.a'),
    ],
    ['lovelaceResources', 'lovelace/resources', (api: ReturnType<typeof setup>['api']) => api.lovelaceResources()],
  ])('%s is a read too', async (_name, type, call) => {
    const {api, store, release} = held(type, {});
    const asked = call(api);
    store.setPanelConfig({people: ['x']});
    release();
    await expect(asked).rejects.toBeInstanceOf(StaleReply);
  });

  test('a network error is the error of Home Assistant, not a StaleReply, even when the config changed meanwhile', async () => {
    const ctx = setup();
    let fail: (e: Error) => void = () => {};
    ctx.hass.replies.set(
      'history/history_during_period',
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const asked = ctx.api.history(['a.b'], START, {minimal: true, attributes: false});
    ctx.store.setPanelConfig({people: ['x']});
    fail(new Error('connection lost'));
    const err = await asked.catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(StaleReply);
    expect(err).toMatchObject({message: 'connection lost'});
  });

  test('a read is not stale when the config is written again unchanged', async () => {
    const {api, store, release} = held('trace/list', []);
    store.setPanelConfig({people: ['x']});
    const asked = api.traceList('automation');
    store.setPanelConfig({people: ['x']});
    release();
    await expect(asked).resolves.toEqual([]);
  });

  test('setSystemData is a save: it resolves although the config changed meanwhile', async () => {
    const {api, store, release} = held('frontend/set_system_data', null);
    const saved = api.setSystemData('home_panel', {light_order: ['a']});
    store.setPanelConfig({people: ['x']});
    release();
    await expect(saved).resolves.toBeUndefined();
  });

  test('runService resolves although the config changed meanwhile', async () => {
    const ctx = setup();
    let release = () => {};
    ctx.hass.callService = () =>
      new Promise<void>(resolve => {
        release = resolve;
      });
    const called = ctx.api.runService('light', 'turn_off');
    ctx.store.setPanelConfig({people: ['x']});
    release();
    await expect(called).resolves.toBeUndefined();
  });

  test('a subscription is never stale: the forecast arrives after the config changed', async () => {
    const forecast = [{datetime: '2026-01-01T12:00:00+00:00'}];
    let push: (m: unknown) => void = () => {};
    const {api, store} = setup({
      connection: {
        subscribeMessage: ((cb: (m: unknown) => void) => {
          push = cb;
          return Promise.resolve(() => Promise.resolve());
        }) as never,
      },
    });
    const cb = vi.fn();
    await api.subscribeForecast('weather.home', 'daily', cb);
    store.setPanelConfig({people: ['x']});
    push({forecast});
    expect(cb).toHaveBeenCalledWith(forecast);
  });
});

describe('before Home Assistant has handed over a hass', () => {
  test('every method rejects instead of throwing', async () => {
    const api = createApi(createStore({defaultTimeZone: 'UTC', resolve: raw => raw}));
    await expect(api.traceList('automation')).rejects.toThrow('not connected');
    await expect(api.setSystemData('home_panel', {})).rejects.toThrow('not connected');
    await expect(api.runService('light', 'turn_on')).rejects.toThrow('not connected');
    await expect(api.subscribeForecast('weather.home', 'daily', vi.fn())).rejects.toThrow('not connected');
  });
});

describe('the fake hass router', () => {
  test('answers each message with its typed default and logs it', async () => {
    const hass = fakeHass();
    const asked = [
      'recorder/statistics_during_period',
      'history/history_during_period',
      'frontend/get_system_data',
      'frontend/set_system_data',
      'trace/list',
      'trace/get',
      'automation/config',
      'lovelace/resources',
      'something/else',
    ];
    const answers = await Promise.all(asked.map(type => hass.callWS({type})));
    expect(answers).toEqual([{}, {}, {value: null}, null, [], {}, {config: {}}, [], {}]);
    expect(hass.calls.ws).toHaveLength(asked.length);
  });

  test('a next hass shares the replies and the log', async () => {
    const hass = fakeHass();
    const next = hass.next({});
    next.replies.set('trace/list', () => ['x']);
    expect(await hass.callWS({type: 'trace/list'})).toEqual(['x']);
    expect(next.calls).toBe(hass.calls);
  });
});
