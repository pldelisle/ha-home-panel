// AskLoader at the controller seam (ADR 0005): the real store over the full test house, a fake API client, a fake cache and a fake host. What a question does to the
// sheet's state, step by step; that a reply of a question that was replaced, cancelled or closed is dropped; and what is asked of the AI Task and of the recorder.
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {Cancelled, StaleReply} from '../../../../src/core/api.ts';
import {resolveConfig} from '../../../../src/core/config.ts';
import type {StatisticsCache} from '../../../../src/core/statistics-cache.ts';
import {createStore} from '../../../../src/core/store.ts';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import type {AskReads} from '../../../../src/features/ask/catalog.ts';
import {ASK_TIMEOUT_MS, AskLoader, type AskDeps} from '../../../../src/features/ask/loader.ts';
import {registriesOf} from '../../../../src/core/registry.ts';
import {powerNow} from '../../../../src/providers/power.ts';
import {dailyPowerWindow, powerWindows} from '../../../../src/providers/power-history.ts';
import {entity} from '../../fake-hass.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {fullHouse, NOW, storeOf} from '../media/support.ts';

const HOUR = 36e5;
const PLAN = {
  form: 'series',
  sensor: 'temp.office',
  period: 'yesterday',
  test: 'none',
  value: null,
  longer_than_min: null,
};
const DOOR_PLAN = {...PLAN, form: 'moments', sensor: 'door.living_room', test: 'on', longer_than_min: 10};
const OFFICE_ABOVE = {...PLAN, form: 'moments', test: 'above', value: 19, longer_than_min: null};
const QUESTION = 'how warm was the office yesterday?';

/** The door's states from the day before the test house's clock, as the recorder's history gives them. */
const point = (time: number, state: string) => ({state, lastUpdated: time, lastChanged: time});
const DOOR_POINTS = [point(NOW - 30 * HOUR, 'off')];

const config = {...FULL_CFG, ask: {entity: 'ai_task.local_model'}};
const row = (start: number, mean: number): StatisticRow => ({
  start,
  end: start + 300_000,
  mean,
  min: mean - 1,
  max: mean + 1,
});

/** What a promise settles to, so a test holds a reply back and lets it go when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}

function setup(panelConfig: unknown = config, extra: Partial<AskDeps> = {}) {
  const store = storeOf(fullHouse, panelConfig);
  const replies: Array<(options: {signal: AbortSignal}) => Promise<unknown>> = [];
  const generateData = vi.fn(
    (_entity: string, _instructions: string, _structure: object, options?: {signal?: AbortSignal}) =>
      (replies.shift() ?? (() => Promise.resolve(PLAN)))({signal: options?.signal as AbortSignal}),
  );
  const statistics = vi.fn((_ids: readonly (string | null | undefined)[], _period: string, start: Date) =>
    Promise.resolve({'sensor.office_temperature': [row(start.getTime(), 18), row(start.getTime() + 300_000, 21)]}),
  );
  // the front door's history: closed since before the window, until a test says otherwise
  const history = vi.fn<StatisticsCache['history']>(() => Promise.resolve({'binary_sensor.front_door': DOOR_POINTS}));
  const host = {addController: vi.fn(), requestUpdate: vi.fn()};
  const deps: AskDeps = {
    api: {generateData},
    cache: {statistics, history},
    store,
    weekStart: 0,
    now: () => new Date(NOW),
    ...extra,
  };
  const loader = new AskLoader(host as never, () => deps);
  return {loader, generateData, statistics, history, host, replies};
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a question that is answered', () => {
  test('goes from planning to fetching to the answer, and asks the AI Task and then the recorder for the sensor behind the handle', async () => {
    const {loader, generateData, statistics} = setup();
    loader.open();
    loader.ask(`  ${QUESTION} `);
    expect(loader.state).toMatchObject({at: 'planning', question: QUESTION});
    await settle();

    expect(loader.state).toMatchObject({
      at: 'answered',
      question: QUESTION,
      plan: {form: 'series', sensor: 'temp.office', period: 'yesterday'},
      answer: {kind: 'series', low: 17, high: 22, mean: 19.5},
    });
    const [entity, instructions, structure, options] = generateData.mock.calls[0];
    expect(entity).toBe('ai_task.local_model');
    expect(instructions).toContain(JSON.stringify(QUESTION));
    expect(Object.keys(structure)).toEqual(['form', 'sensor', 'period', 'test', 'value', 'longer_than_min']);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    // yesterday of the test house's clock, in five-minute means, of the office's sensor and not of its handle
    const [ids, period, start, types, end] = statistics.mock.calls[0] as unknown as [
      string[],
      string,
      Date,
      string[],
      Date,
    ];
    expect({ids, period, types}).toEqual({
      ids: ['sensor.office_temperature'],
      period: '5minute',
      types: ['mean', 'min', 'max'],
    });
    expect(end.getTime() - start.getTime()).toBeGreaterThan(0);
    expect(end.getTime()).toBeLessThanOrEqual(NOW);
  });

  test('tells the AI Task the panel language and the date of the house', async () => {
    const {loader, generateData} = setup();
    loader.ask(QUESTION);
    await settle();
    expect(generateData.mock.calls[0][1]).toMatch(/Today is \w+day \d{4}-\d\d-\d\d\./);
    expect(generateData.mock.calls[0][1]).toContain('Names are in English');
  });

  test('asks nothing for an empty question, and keeps the answer it has', async () => {
    const {loader, generateData} = setup();
    loader.ask(QUESTION);
    await settle();
    const answered = loader.state;
    loader.ask('   ');
    expect(loader.state).toBe(answered);
    expect(generateData).toHaveBeenCalledTimes(1);
  });
});

describe('a question about moments', () => {
  // a door the model plans over: the history of its entity, in minimal states, from the window's start to its end (a window that ended is not "now")
  test('over a binary sensor reads its state history, by the entity behind the handle, and answers with the spans', async () => {
    const {loader, replies, history, statistics} = setup();
    replies.push(() => Promise.resolve({...DOOR_PLAN, period: 'last_24h'}));
    history.mockResolvedValueOnce({
      'binary_sensor.front_door': [point(NOW - 5 * HOUR, 'on'), point(NOW - 4 * HOUR, 'off')],
    });
    loader.ask('was the front door open?');
    await settle();
    expect(loader.state).toMatchObject({
      at: 'answered',
      plan: {form: 'moments', sensor: 'door.living_room', test: {on: true}, longerThanMin: 10},
      answer: {kind: 'moments', count: 1, totalMs: HOUR},
    });
    const [ids, start, options] = history.mock.calls[0] as unknown as [string[], Date, {minimal: boolean; end: Date}];
    expect(ids).toEqual(['binary_sensor.front_door']);
    expect(options).toMatchObject({minimal: true, attributes: false});
    expect(options.end.getTime() - start.getTime()).toBeGreaterThan(0);
    expect(statistics).not.toHaveBeenCalled();
  });

  test('over a measure reads the statistics of its sensor and answers with the buckets that meet the threshold', async () => {
    const {loader, replies, history, statistics} = setup();
    replies.push(() => Promise.resolve(OFFICE_ABOVE));
    loader.ask('when was the office above 19?');
    await settle();
    // the two buckets are 18 and 21: only the second is above 19
    expect(loader.state).toMatchObject({
      at: 'answered',
      answer: {kind: 'moments', count: 1, totalMs: 300_000},
    });
    expect(statistics.mock.calls[0][0]).toEqual(['sensor.office_temperature']);
    expect(history).not.toHaveBeenCalled();
  });

  test('a span still going when the period reaches now is marked so', async () => {
    const {loader, replies, history} = setup();
    replies.push(() => Promise.resolve({...DOOR_PLAN, period: 'today', longer_than_min: null}));
    history.mockResolvedValueOnce({'binary_sensor.front_door': [point(NOW - HOUR, 'on')]});
    loader.ask('is the front door open?');
    await settle();
    expect(loader.state).toMatchObject({at: 'answered', answer: {spans: [{ongoing: true}]}});
  });

  test('reads the clock once for a question: a clock that moves while the history is fetched does not take the "still" away', async () => {
    let ticks = 0;
    const {loader, replies, history} = setup(config, {now: () => new Date(NOW + 1000 * ticks++)});
    replies.push(() => Promise.resolve({...DOOR_PLAN, period: 'today', longer_than_min: null}));
    history.mockResolvedValueOnce({'binary_sensor.front_door': [point(NOW - HOUR, 'on')]});
    loader.ask('is the front door open?');
    await settle();
    expect(loader.state).toMatchObject({at: 'answered', answer: {spans: [{ongoing: true}]}});
  });

  test('a month over a measure is read by the hour, never by the day', async () => {
    const {loader, replies, statistics} = setup();
    replies.push(() => Promise.resolve({...OFFICE_ABOVE, period: 'this_month'}));
    loader.ask('when was the office above 19 this month?');
    await settle();
    expect(statistics.mock.calls[0][1]).toBe('hour');
    expect(loader.state).toMatchObject({at: 'answered', answer: {kind: 'moments'}});
  });

  test('a series over a month still reads daily statistics', async () => {
    const {loader, replies, statistics} = setup();
    replies.push(() => Promise.resolve({...PLAN, period: 'this_month'}));
    loader.ask('how warm was the office this month?');
    await settle();
    expect(statistics.mock.calls[0][1]).toBe('day');
  });

  test('a recorder with no state for the sensor fails as empty, and a door never opened is an answer of no moments', async () => {
    const {loader, replies, history} = setup();
    replies.push(
      () => Promise.resolve(DOOR_PLAN),
      () => Promise.resolve(DOOR_PLAN),
    );
    history.mockResolvedValueOnce({});
    loader.ask('was the front door open?');
    await settle();
    expect(loader.state).toMatchObject({at: 'failed', reason: 'empty', plan: {form: 'moments'}});
    loader.ask('was the front door open, again?');
    await settle();
    expect(loader.state).toMatchObject({at: 'answered', answer: {kind: 'moments', count: 0}});
  });
});

describe('a question about how much', () => {
  // the house's energy total and the water heater's, which the Energy card reads too
  const METERS = {
    ...config,
    entities: {...config.entities, energy_total: 'sensor.mains_energy', water_heater_energy: 'sensor.tank_energy'},
  };
  const metered = storeOf(
    {
      ...fullHouse,
      states: {
        ...fullHouse.states,
        'sensor.mains_energy': entity('sensor.mains_energy', '9000', {unit_of_measurement: 'Wh'}),
        'sensor.tank_energy': entity('sensor.tank_energy', '300', {unit_of_measurement: 'kWh'}),
      },
    },
    METERS,
  );
  const TOTAL_PLAN = {...PLAN, form: 'total', sensor: 'energy.house', period: 'last_7_days'};
  // the recorder's daily rows, which start at a local midnight (5:00 UTC in November, 4:00 on the first, when the clocks went back)
  const day = (n: number): StatisticRow => ({
    start: Date.UTC(2026, 10, n, n === 1 ? 4 : 5),
    end: Date.UTC(2026, 10, n + 1, 5),
    change: n,
  });
  const ask = async (plan: object, rows: Record<string, StatisticRow[]> = {}) => {
    const made = setup(METERS, {store: metered as unknown as AskDeps['store']});
    made.replies.push(() => Promise.resolve(plan));
    made.statistics.mockResolvedValueOnce(rows);
    made.loader.ask('how much did the house use?');
    await settle();
    const [ids, period, start, types, end] = made.statistics.mock.calls[0] as unknown as [
      string[],
      string,
      Date,
      string[],
      Date | undefined,
    ];
    return {...made, call: {ids, period, start, types, end}};
  };

  test('is answered from the change of the meter behind the handle, and the other meter of the same reply is not read', async () => {
    const {loader, call} = await ask(TOTAL_PLAN, {
      'sensor.mains_energy': [day(1), day(2), day(3)],
      'sensor.tank_energy': [{...day(1), change: 100}],
    });
    expect(loader.state).toMatchObject({
      at: 'answered',
      plan: {form: 'total', sensor: 'energy.house', period: 'last_7_days'},
      answer: {kind: 'total', total: 6, unit: 'kWh', bucket: 'day'},
    });
    // the three days of the week the recorder has no row for keep their place, as gaps
    expect((loader.state as {answer: {bars: {value: number | null}[]}}).answer.bars.map(bar => bar.value)).toEqual([
      1,
      2,
      3,
      null,
      null,
      null,
    ]);
    expect(call.types).toEqual(['change']);
  });

  test('a week or a month in daily buckets asks what the Energy card asked: the same ids, period and stable start, with no end, so the cache answers', async () => {
    const {call} = await ask(TOTAL_PLAN, {});
    const shared = powerWindows(NOW, metered.config, metered.fmt).meter33;
    expect(call).toEqual({
      ids: ['sensor.mains_energy', 'sensor.tank_energy'],
      period: 'day',
      start: shared.start,
      types: ['change'],
      end: undefined,
    });
  });

  test('today of the house meter is the Energy card’s hourly window since midnight', async () => {
    const {call} = await ask({...TOTAL_PLAN, period: 'today'}, {});
    const shared = powerWindows(NOW, metered.config, metered.fmt).today;
    expect(call).toEqual({
      ids: ['sensor.mains_energy'],
      period: 'hour',
      start: shared.start,
      types: ['change'],
      end: undefined,
    });
  });

  test('a period the Energy card does not hold is asked for itself, on its own stable instants, and closed when it has ended', async () => {
    const yesterday = await ask({...TOTAL_PLAN, sensor: 'energy.water_heater', period: 'yesterday'}, {});
    expect(yesterday.call).toMatchObject({ids: ['sensor.tank_energy'], period: 'hour', types: ['change']});
    expect(yesterday.call.start.toISOString()).toBe('2026-11-06T05:00:00.000Z');
    expect(yesterday.call.end?.toISOString()).toBe('2026-11-07T05:00:00.000Z');
    // a period that reaches now has no end to give
    const today = await ask({...TOTAL_PLAN, sensor: 'energy.water_heater', period: 'today'}, {});
    expect(today.call).toMatchObject({ids: ['sensor.tank_energy'], period: 'hour', end: undefined});
    // last month began before the 33 days of the Energy card's window
    const month = await ask({...TOTAL_PLAN, period: 'last_month'}, {});
    expect(month.call).toMatchObject({ids: ['sensor.mains_energy'], period: 'day'});
    expect(month.call.start.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(month.call.end?.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  test('the last bar of a period that includes today is the partial day, and a zero total is an answer', async () => {
    const {loader} = await ask(TOTAL_PLAN, {
      'sensor.mains_energy': [
        {...day(1), change: 0},
        {...day(7), change: 0},
      ],
    });
    expect(loader.state).toMatchObject({
      at: 'answered',
      answer: {kind: 'total', total: 0},
    });
    const {bars} = (loader.state as {answer: {bars: {value: number | null; partial: boolean}[]}}).answer;
    expect([bars[0], bars[bars.length - 1]]).toMatchObject([
      {value: 0, partial: false},
      {value: 0, partial: true},
    ]);
  });

  describe('of the car and the heating, which are power sensors', () => {
    const rooms = metered.config.rooms.map(room => room.power);
    // a daily row of mean kW, starting at a local midnight; a row of an hour starts on the hour
    const kw = (start: number, mean: number, length = 864e5): StatisticRow => ({start, end: start + length, mean});
    const midnight = (n: number) => Date.UTC(2026, 10, n, n === 1 ? 4 : 5);

    test('a week reads the Energy card’s 400 daily means, and a day of mean kW is 24 hours of it, today only the hours so far', async () => {
      const {loader, call} = await ask(
        {...TOTAL_PLAN, sensor: 'energy.car'},
        {
          'sensor.charger_power': [kw(midnight(1), 1), kw(midnight(2), 2), kw(midnight(7), 1)],
          [rooms[0]]: [kw(midnight(1), 9)],
        },
      );
      expect(call).toEqual({
        ids: dailyPowerWindow(NOW, metered.config).ids,
        period: 'day',
        start: dailyPowerWindow(NOW, metered.config).start,
        types: ['mean'],
        end: undefined,
      });
      // the test house's clock is 2 pm: 14 hours of today
      expect(loader.state).toMatchObject({
        at: 'answered',
        plan: {form: 'total', sensor: 'energy.car'},
        answer: {kind: 'total', unit: 'kWh', bucket: 'day', total: 24 + 48 + 14},
      });
    });

    test('the heating adds up the rooms’ power sensors, bucket by bucket', async () => {
      const {loader} = await ask(
        {...TOTAL_PLAN, sensor: 'energy.heating'},
        {
          [rooms[0]]: [kw(midnight(2), 1)],
          [rooms[1]]: [kw(midnight(2), 2), kw(midnight(3), 0.5)],
          'sensor.charger_power': [kw(midnight(2), 9)],
        },
      );
      expect(loader.state).toMatchObject({
        at: 'answered',
        answer: {total: 72 + 12},
      });
      expect((loader.state as {answer: {bars: {value: number | null}[]}}).answer.bars.slice(0, 2)).toMatchObject([
        {value: 72},
        {value: 12},
      ]);
    });

    test('a day or less reads the Energy card’s hourly week, where an hour of mean kW is its kWh', async () => {
      const hours = Array.from({length: 24}, (_, i) => kw(Date.UTC(2026, 10, 6, 5 + i), 3, 36e5));
      const {loader, call} = await ask(
        {...TOTAL_PLAN, sensor: 'energy.car', period: 'yesterday'},
        {'sensor.charger_power': hours},
      );
      const week = powerWindows(NOW, metered.config, metered.fmt).hour7;
      expect(call).toEqual({ids: week.ids, period: 'hour', start: week.start, types: ['mean'], end: undefined});
      expect(loader.state).toMatchObject({at: 'answered', answer: {bucket: 'hour', total: 72, coverage: 1}});
    });

    test('a sensor the recorder has no row for fails as empty', async () => {
      const {loader} = await ask({...TOTAL_PLAN, sensor: 'energy.car'}, {});
      expect(loader.state).toMatchObject({at: 'failed', reason: 'empty'});
    });
  });

  test('a recorder with no row of the meter fails as empty, and the failure keeps the plan to name the meter', async () => {
    const {loader} = await ask(TOTAL_PLAN, {});
    expect(loader.state).toMatchObject({at: 'failed', reason: 'empty', plan: {form: 'total'}});
  });
});

describe('a suggestion', () => {
  const SUGGESTION = {
    text: 'Office: how warm was it yesterday?',
    plan: {form: 'series', sensor: 'temp.office', period: 'yesterday'},
  } as const;

  test('is answered from its own plan: the recorder is read and the AI Task is never called', async () => {
    const {loader, generateData, statistics} = setup();
    loader.open();
    loader.suggest(SUGGESTION);
    // no planning step: it is fetching the moment it is tapped
    expect(loader.state).toMatchObject({at: 'fetching', question: SUGGESTION.text, plan: SUGGESTION.plan});
    await settle();
    expect(loader.state).toMatchObject({at: 'answered', question: SUGGESTION.text, answer: {kind: 'series'}});
    expect(generateData).not.toHaveBeenCalled();
    expect(statistics).toHaveBeenCalledTimes(1);
    expect(statistics.mock.calls[0][0]).toEqual(['sensor.office_temperature']);
  });

  test('is answered when the model is away: an unavailable AI Task does not stop it', async () => {
    const away = {
      ...fullHouse.states['sensor.office_temperature'],
      entity_id: 'ai_task.local_model',
      state: 'unavailable',
    };
    const store = storeOf({...fullHouse, states: {...fullHouse.states, 'ai_task.local_model': away}}, config);
    const {loader, generateData} = setup(config, {store});
    loader.suggest(SUGGESTION);
    await settle();
    expect(loader.state).toMatchObject({at: 'answered'});
    expect(generateData).not.toHaveBeenCalled();
  });

  test('a door is read as a typed question of the same plan is', async () => {
    const {loader, history} = setup();
    loader.suggest({
      text: 'Front door: opened this week?',
      plan: {form: 'moments', sensor: 'door.living_room', period: 'this_week', test: {on: true}, longerThanMin: null},
    });
    await settle();
    expect(history).toHaveBeenCalledTimes(1);
    expect(loader.state).toMatchObject({at: 'answered', answer: {kind: 'moments'}});
  });

  test('a tap replaces a question in flight, whose late reply is dropped', async () => {
    const {loader, replies} = setup();
    const first = deferred<unknown>();
    replies.push(() => first.promise);
    loader.ask('the first question');
    loader.suggest(SUGGESTION);
    await settle();
    const answered = loader.state;
    expect(answered).toMatchObject({at: 'answered', question: SUGGESTION.text});
    first.resolve({...PLAN, period: 'today'});
    await settle();
    expect(loader.state).toBe(answered);
  });

  test('Cancel lets a suggestion go, and a failed read is said as a failure', async () => {
    const {loader, statistics} = setup();
    const read = deferred<Record<string, StatisticRow[]>>();
    statistics.mockImplementationOnce(() => read.promise);
    loader.suggest(SUGGESTION);
    loader.cancel();
    expect(loader.state).toEqual({at: 'idle'});
    read.resolve({});
    await settle();
    expect(loader.state).toEqual({at: 'idle'});

    statistics.mockImplementationOnce(() => Promise.reject(new Error('recorder down')));
    loader.suggest(SUGGESTION);
    await settle();
    expect(loader.state).toMatchObject({at: 'failed', reason: 'unavailable', plan: SUGGESTION.plan});
  });

  test('Try again after a failed read reads again with the plan it has: its words never go to the model', async () => {
    const {loader, generateData, statistics} = setup();
    statistics.mockImplementationOnce(() => Promise.reject(new Error('recorder down')));
    loader.suggest(SUGGESTION);
    await settle();
    expect(loader.state).toMatchObject({at: 'failed', reason: 'unavailable'});
    loader.retry();
    await settle();
    expect(loader.state).toMatchObject({at: 'answered', question: SUGGESTION.text, answer: {kind: 'series'}});
    expect(generateData).not.toHaveBeenCalled();
  });

  test('a typed question whose read failed is retried from its plan too, and one that failed at the model is asked again', async () => {
    const {loader, generateData, statistics, replies} = setup();
    statistics.mockImplementationOnce(() => Promise.reject(new Error('recorder down')));
    loader.ask(QUESTION);
    await settle();
    expect(generateData).toHaveBeenCalledTimes(1);
    loader.retry();
    await settle();
    expect(loader.state).toMatchObject({at: 'answered', question: QUESTION});
    expect(generateData).toHaveBeenCalledTimes(1);

    replies.push(() => Promise.reject(new Error('model down')));
    loader.ask(QUESTION);
    await settle();
    expect(loader.state).toMatchObject({at: 'failed', reason: 'unavailable'});
    loader.retry();
    await settle();
    expect(generateData).toHaveBeenCalledTimes(3);
  });
});

describe('a question that has no answer', () => {
  test('an unsupported plan fails as unsupported and never reads the history', async () => {
    const {loader, statistics, replies} = setup();
    replies.push(() => Promise.resolve({form: 'unsupported'}));
    loader.ask('open the garage');
    await settle();
    expect(loader.state).toEqual({at: 'failed', question: 'open the garage', reason: 'unsupported'});
    expect(statistics).not.toHaveBeenCalled();
  });

  test('a reply that names a sensor the catalog does not have is refused as unsupported, its reason in the console and not on the screen', async () => {
    const {loader, statistics, replies} = setup();
    replies.push(() => Promise.resolve({...PLAN, sensor: 'temp.attic'}));
    loader.ask(QUESTION);
    await settle();
    expect(loader.state).toMatchObject({at: 'failed', reason: 'unsupported'});
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('refused'), 'unknown_sensor');
    expect(statistics).not.toHaveBeenCalled();
  });

  test('an empty reply (nothing) is the same refusal', async () => {
    const {loader, replies} = setup();
    replies.push(() => Promise.resolve(undefined));
    loader.ask(QUESTION);
    await settle();
    expect(loader.state).toMatchObject({at: 'failed', reason: 'unsupported'});
  });

  test('a recorder with no row for the window fails as empty', async () => {
    const {loader, statistics} = setup();
    statistics.mockResolvedValueOnce({});
    loader.ask(QUESTION);
    await settle();
    expect(loader.state).toMatchObject({
      at: 'failed',
      reason: 'empty',
      plan: {sensor: 'temp.office', period: 'yesterday'},
    });
  });

  test('an AI Task that fails is unavailable, and the cause is logged', async () => {
    const {loader, replies} = setup();
    replies.push(() => Promise.reject(new Error('the model is down')));
    loader.ask(QUESTION);
    await settle();
    expect(loader.state).toMatchObject({at: 'failed', reason: 'unavailable'});
    expect(console.error).toHaveBeenCalled();
  });

  test('a house whose config has no ask block cannot ask', async () => {
    const {loader, generateData} = setup(FULL_CFG);
    loader.ask(QUESTION);
    await settle();
    expect(loader.state).toMatchObject({at: 'failed', reason: 'unavailable'});
    expect(generateData).not.toHaveBeenCalled();
  });

  test('an AI Task that never answers gives up after thirty seconds, and aborts the call', async () => {
    vi.useFakeTimers();
    const {loader, replies} = setup();
    let signal!: AbortSignal;
    replies.push(options => {
      signal = options.signal;
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Cancelled())));
    });
    loader.ask(QUESTION);
    await vi.advanceTimersByTimeAsync(ASK_TIMEOUT_MS - 1);
    expect(loader.state.at).toBe('planning');
    await vi.advanceTimersByTimeAsync(1);
    expect(loader.state).toEqual({at: 'failed', question: QUESTION, reason: 'timeout'});
    expect(signal.aborted).toBe(true);
  });
});

describe('a question the model cannot be asked', () => {
  const unavailable = fullHouse.next({'ai_task.local_model': {state: 'unavailable'}});

  test('an AI Task entity whose state is unavailable fails as unavailable without a call, so there is nothing to wait for', async () => {
    const {generateData, loader} = setup(config, {store: storeOf(unavailable, config)});
    loader.ask(QUESTION);
    await settle();
    expect(loader.state).toEqual({at: 'failed', question: QUESTION, reason: 'unavailable'});
    expect(generateData).not.toHaveBeenCalled();
  });

  test('and asking again once the entity is back is a new question', async () => {
    const made = setup(config, {store: storeOf(unavailable, config)});
    made.loader.ask(QUESTION);
    expect(made.loader.state).toMatchObject({at: 'failed'});
    const back = setup();
    back.loader.ask(QUESTION);
    await settle();
    expect(back.loader.state.at).toBe('answered');
  });
});

describe('cancel', () => {
  test('while the model works returns to idle, aborts the call and drops what the model says later', async () => {
    const {loader, replies, statistics} = setup();
    const late = deferred<unknown>();
    let signal!: AbortSignal;
    replies.push(options => {
      signal = options.signal;
      return late.promise;
    });
    loader.ask(QUESTION);
    loader.cancel();
    expect(loader.state).toEqual({at: 'idle'});
    expect(signal.aborted).toBe(true);
    late.resolve(PLAN);
    await settle();
    expect(loader.state).toEqual({at: 'idle'});
    expect(statistics).not.toHaveBeenCalled();
  });

  test('a call that rejects as Cancelled on the abort is no failure: nothing is logged and nothing is shown', async () => {
    vi.useFakeTimers();
    const {loader, replies} = setup();
    replies.push(
      options => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Cancelled()))),
    );
    loader.ask(QUESTION);
    loader.cancel();
    await vi.advanceTimersByTimeAsync(ASK_TIMEOUT_MS + 1);
    expect(loader.state).toEqual({at: 'idle'});
    expect(console.error).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('while the history is read drops the rows when they come', async () => {
    const {loader, statistics} = setup();
    const rows = deferred<Record<string, StatisticRow[]>>();
    statistics.mockReturnValueOnce(rows.promise);
    loader.ask(QUESTION);
    await settle();
    expect(loader.state.at).toBe('fetching');
    loader.cancel();
    expect(loader.state).toEqual({at: 'idle'});
    rows.resolve({'sensor.office_temperature': [row(NOW - HOUR, 20)]});
    await settle();
    expect(loader.state).toEqual({at: 'idle'});
  });

  test('then asking again is a new request, whose answer is taken', async () => {
    const {loader, replies} = setup();
    replies.push(() => new Promise(() => undefined));
    loader.ask(QUESTION);
    loader.cancel();
    loader.ask(QUESTION);
    await settle();
    expect(loader.state).toMatchObject({at: 'answered', question: QUESTION});
  });

  test('leaves an answer, a failure and an idle sheet as they are', async () => {
    const {loader} = setup();
    loader.cancel();
    expect(loader.state).toEqual({at: 'idle'});
    loader.ask(QUESTION);
    await settle();
    const answered = loader.state;
    loader.cancel();
    expect(loader.state).toBe(answered);
  });
});

describe('a timeout, then the same question again', () => {
  test('goes through, since the timer and the signal are the question’s own', async () => {
    vi.useFakeTimers();
    const {loader, replies} = setup();
    replies.push(
      options => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Cancelled()))),
    );
    loader.ask(QUESTION);
    await vi.advanceTimersByTimeAsync(ASK_TIMEOUT_MS);
    expect(loader.state).toMatchObject({at: 'failed', reason: 'timeout'});
    loader.ask(QUESTION);
    await vi.advanceTimersByTimeAsync(1);
    expect(loader.state).toMatchObject({at: 'answered'});
  });
});

describe('the thirty seconds are the AI Task’s', () => {
  test('a history read that is slower than that is not a timeout: the cache has its own rules, and the answer arrives', async () => {
    vi.useFakeTimers();
    const {loader, statistics, generateData} = setup();
    const rows = deferred<Record<string, StatisticRow[]>>();
    statistics.mockReturnValueOnce(rows.promise);
    loader.ask(QUESTION);
    await vi.advanceTimersByTimeAsync(1);
    expect(loader.state.at).toBe('fetching');
    await vi.advanceTimersByTimeAsync(ASK_TIMEOUT_MS + 5_000);
    expect(loader.state.at).toBe('fetching');
    // the signal has done its job with the plan: the cache takes none, so the timer is not left to abort a call that is over
    expect(generateData.mock.calls[0][3]?.signal?.aborted).toBe(false);
    rows.resolve({'sensor.office_temperature': [row(NOW - 20 * HOUR, 20)]});
    await vi.advanceTimersByTimeAsync(1);
    expect(loader.state).toMatchObject({at: 'answered'});
  });
});

describe('a reply that is no longer wanted is dropped', () => {
  test('a new question replaces the one in flight, whose late reply changes nothing', async () => {
    const {loader, replies} = setup();
    const first = deferred<unknown>();
    replies.push(() => first.promise);
    loader.ask('the first question');
    loader.ask(QUESTION); // answered at once, by the default reply
    await settle();
    const answered = loader.state;
    expect(answered).toMatchObject({at: 'answered', question: QUESTION});
    first.resolve({...PLAN, period: 'today'});
    await settle();
    expect(loader.state).toBe(answered);
  });

  test('the same words asked again after a cancel are the new request, not the old one', async () => {
    const {loader, replies, generateData} = setup();
    const first = deferred<unknown>();
    replies.push(() => first.promise);
    loader.ask(QUESTION);
    loader.ask(QUESTION);
    await settle();
    first.resolve({...PLAN, period: 'today'});
    await settle();
    expect(generateData).toHaveBeenCalledTimes(2);
    expect(loader.state).toMatchObject({at: 'answered', plan: {period: 'yesterday'}});
  });

  test('a reply that rejects as Cancelled after a newer question began changes nothing', async () => {
    const {loader, replies} = setup();
    replies.push(
      options => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Cancelled()))),
    );
    loader.ask('the first question');
    loader.ask(QUESTION);
    await settle();
    expect(loader.state).toMatchObject({at: 'answered', question: QUESTION});
  });

  test('closing the sheet lets the question go: the state is idle and the late reply is dropped', async () => {
    const {loader, replies, statistics} = setup();
    const late = deferred<unknown>();
    replies.push(() => late.promise);
    loader.open();
    loader.ask(QUESTION);
    loader.close();
    expect(loader.state).toEqual({at: 'idle'});
    late.resolve(PLAN);
    await settle();
    expect(loader.state).toEqual({at: 'idle'});
    expect(statistics).not.toHaveBeenCalled();
  });

  test('a question closed while the history loads is dropped too', async () => {
    const {loader, statistics} = setup();
    const rows = deferred<Record<string, StatisticRow[]>>();
    statistics.mockReturnValueOnce(rows.promise);
    loader.ask(QUESTION);
    await settle();
    expect(loader.state.at).toBe('fetching');
    loader.close();
    rows.resolve({'sensor.office_temperature': [row(NOW - HOUR, 20)]});
    await settle();
    expect(loader.state).toEqual({at: 'idle'});
  });

  // the shell's `resetFrame()` forgets the sheet when the config generation changes, so the loader leaves the state alone and the sheet is not left spinning
  test('a reply of a config that is gone is no answer: the loader says nothing, and the shell’s reset of the frame forgets the sheet', async () => {
    const {loader, replies} = setup();
    replies.push(() => Promise.reject(new StaleReply(1, 2)));
    loader.ask(QUESTION);
    await settle();
    expect(loader.state.at).toBe('planning');
    expect(console.error).not.toHaveBeenCalled();
  });

  test('a host that leaves lets the question go', () => {
    const {loader, replies} = setup();
    replies.push(() => new Promise(() => undefined));
    loader.ask(QUESTION);
    loader.hostDisconnected();
    expect(loader.state).toEqual({at: 'idle'});
  });
});

describe('the catalog', () => {
  test('is built when the sheet opens, and not before: asking for the state reads no house', () => {
    const reads = vi.fn((): AskReads => ({
      power: powerNow(fullHouse.states, storeOf(fullHouse, config).config),
      states: fullHouse.states,
      registries: registriesOf(fullHouse),
      sensors: [],
      people: [],
    }));
    const {loader, host} = setup(config, {reads});
    expect(reads).not.toHaveBeenCalled();
    loader.open();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(host.requestUpdate).toHaveBeenCalled();
    expect(loader.catalog.entries.map(entry => entry.key)).toContain('temp.office');
    expect(reads).toHaveBeenCalledTimes(1);
  });

  test('is built on the first question when nothing opened the sheet, and from the house as it is', () => {
    const {loader} = setup();
    expect(loader.catalog.entries.map(entry => entry.key)).toEqual(
      expect.arrayContaining(['temp.office', 'power.grid']),
    );
    expect(loader.catalog.omitted).toBe(0);
  });

  test('a house the cap cuts keeps the first 60 sensors and counts what it left out, which the sheet tells an admin (askNotes)', () => {
    const store = storeOf(fullHouse, config);
    const power = powerNow(fullHouse.states, store.config);
    const room = power.rooms[0];
    const crowded: AskReads = {
      power: {
        ...power,
        rooms: Array.from({length: 70}, (_, i) => ({
          ...room,
          key: `r${i}`,
          thermostatName: '',
          climate: `climate.r${i}`,
        })),
      },
      states: fullHouse.states,
      registries: registriesOf(fullHouse),
      sensors: [],
      people: [],
    };
    const rooms = Array.from({length: 70}, (_, i) => ({
      ...store.config.rooms[0],
      climate: `climate.r${i}`,
      temp: `sensor.r${i}`,
    }));
    const crowdedStore = {...store, config: {...store.config, rooms}} as unknown as AskDeps['store'];
    const {loader} = setup(config, {reads: () => crowded, store: crowdedStore});
    expect(loader.catalog.entries).toHaveLength(60);
    expect(loader.catalog.omitted).toBe(15);
  });

  test('before Home Assistant has sent a state is empty', () => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    const {loader} = setup(config, {store});
    expect(loader.catalog.entries).toEqual([]);
  });

  test('has no state to carry from one opening to the next', async () => {
    const {loader} = setup();
    loader.ask(QUESTION);
    await settle();
    expect(loader.state.at).toBe('answered');
    loader.open();
    expect(loader.state).toEqual({at: 'idle'});
  });
});
