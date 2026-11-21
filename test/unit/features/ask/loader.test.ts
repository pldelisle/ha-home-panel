// AskLoader at the controller seam (ADR 0005): the real store over the full test house, a fake API client, a fake cache and a fake host. What a question does to the
// sheet's state, step by step; that a reply of a question that was replaced, cancelled or closed is dropped; and what is asked of the AI Task and of the recorder.
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {Cancelled, StaleReply} from '../../../../src/core/api.ts';
import {resolveConfig} from '../../../../src/core/config.ts';
import {createStore} from '../../../../src/core/store.ts';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import type {AskReads} from '../../../../src/features/ask/catalog.ts';
import {ASK_TIMEOUT_MS, AskLoader, type AskDeps} from '../../../../src/features/ask/loader.ts';
import {registriesOf} from '../../../../src/core/registry.ts';
import {powerNow} from '../../../../src/providers/power.ts';
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
const QUESTION = 'how warm was the office yesterday?';

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
  const host = {addController: vi.fn(), requestUpdate: vi.fn()};
  const deps: AskDeps = {
    api: {generateData},
    cache: {statistics},
    store,
    weekStart: 0,
    now: () => new Date(NOW),
    ...extra,
  };
  const loader = new AskLoader(host as never, () => deps);
  return {loader, generateData, statistics, host, replies};
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
    };
    const rooms = Array.from({length: 70}, (_, i) => ({
      ...store.config.rooms[0],
      climate: `climate.r${i}`,
      temp: `sensor.r${i}`,
    }));
    const crowdedStore = {...store, config: {...store.config, rooms}} as unknown as AskDeps['store'];
    const {loader} = setup(config, {reads: () => crowded, store: crowdedStore});
    expect(loader.catalog.entries).toHaveLength(60);
    expect(loader.catalog.omitted).toBe(13);
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
