// The sheet's model: the reducer over one discriminated state, and the texts the sheet shows for a state. Every transition, a reply for a
// request that was cancelled or replaced, even when the same words were asked again, and the view in both languages over the real formatters of a store.
import {describe, expect, test} from 'vitest';
import type {Catalog} from '../../../../src/features/ask/catalog.ts';
import type {EmptyAnswer, SeriesAnswer} from '../../../../src/features/ask/evaluate.ts';
import {
  askReducer,
  askView,
  canRetry,
  IDLE,
  type AnswerablePlan,
  type AskEvent,
  sensorOf,
  type AskState,
} from '../../../../src/features/ask/model.ts';
import type {PlanError} from '../../../../src/features/ask/plan.ts';
import {fullHouse, depsOf} from '../media/support.ts';

const SERIES: AnswerablePlan = {form: 'series', sensor: 'temp.office', period: 'yesterday'};
const ANSWER: SeriesAnswer = {
  kind: 'series',
  points: [
    {at: Date.UTC(2026, 10, 17, 5), value: 18.2},
    {at: Date.UTC(2026, 10, 17, 6), value: 21.4},
  ],
  low: 18.2,
  high: 21.4,
  mean: 19.8,
  coverage: 1,
  from: Date.UTC(2026, 10, 17, 5),
};
const EMPTY: EmptyAnswer = {kind: 'empty'};

const run = (events: AskEvent[], from: AskState = IDLE): AskState => events.reduce(askReducer, from);
const ask = (question: string, id = 1): AskEvent => ({type: 'asked', id, question});
const planning = (question = 'how warm was the office yesterday?', id = 1): AskState => ({
  at: 'planning',
  id,
  question,
});
const fetching = (question = 'how warm was the office yesterday?', id = 1): AskState => ({
  at: 'fetching',
  id,
  question,
  plan: SERIES,
});

describe('the reducer', () => {
  test('starts idle, and a question puts it to planning, under its request id', () => {
    expect(IDLE).toEqual({at: 'idle'});
    expect(run([ask('how warm was the office yesterday?')])).toEqual(planning());
  });

  test('a question is trimmed, and a blank one asks nothing', () => {
    expect(run([ask('  hello  ', 4)])).toEqual({at: 'planning', id: 4, question: 'hello'});
    expect(run([ask('   ')])).toBe(IDLE);
    const state = planning();
    expect(askReducer(state, ask(''))).toBe(state);
  });

  test('a plan to run moves planning to fetching, with the plan', () => {
    expect(run([{type: 'planned', id: 1, plan: SERIES}], planning('q'))).toEqual({
      at: 'fetching',
      id: 1,
      question: 'q',
      plan: SERIES,
    });
  });

  test('an unsupported plan, or a PlanError, is a failure with the reason unsupported', () => {
    const unsupported = {at: 'failed', question: 'q', reason: 'unsupported'};
    expect(run([{type: 'planned', id: 1, plan: {form: 'unsupported'}}], planning('q'))).toEqual(unsupported);
    const error: PlanError = {error: 'unknown_sensor'};
    expect(run([{type: 'planned', id: 1, plan: error}], planning('q'))).toEqual(unsupported);
  });

  test('an answer moves fetching to answered, and no rows at all is the failure empty', () => {
    expect(run([{type: 'answered', id: 1, answer: ANSWER}], fetching('q'))).toEqual({
      at: 'answered',
      question: 'q',
      plan: SERIES,
      answer: ANSWER,
    });
    // the empty failure keeps the plan, so its line can name the sensor and the period
    expect(run([{type: 'answered', id: 1, answer: EMPTY}], fetching('q'))).toEqual({
      at: 'failed',
      question: 'q',
      reason: 'empty',
      plan: SERIES,
    });
  });

  test('a timeout or an unavailable model fails the question in either waiting state', () => {
    for (const reason of ['timeout', 'unavailable'] as const) {
      expect(run([{type: 'failed', id: 1, reason}], planning('q'))).toEqual({at: 'failed', question: 'q', reason});
      expect(run([{type: 'failed', id: 1, reason}], fetching('q'))).toEqual({at: 'failed', question: 'q', reason});
    }
  });

  test('a new question from any state replaces what is there and cancels the one in flight', () => {
    const states: AskState[] = [
      IDLE,
      planning('old'),
      fetching('old'),
      {at: 'answered', question: 'old', plan: SERIES, answer: ANSWER},
      {at: 'failed', question: 'old', reason: 'timeout'},
    ];
    for (const from of states) expect(run([ask('new', 2)], from)).toEqual(planning('new', 2));
  });

  test('cancel goes back to idle from a waiting state and leaves the others alone', () => {
    expect(run([{type: 'cancelled'}], planning())).toBe(IDLE);
    expect(run([{type: 'cancelled'}], fetching())).toBe(IDLE);
    const answered: AskState = {at: 'answered', question: 'q', plan: SERIES, answer: ANSWER};
    expect(run([{type: 'cancelled'}], answered)).toBe(answered);
    expect(run([{type: 'cancelled'}])).toBe(IDLE);
  });

  test('a failed question asked again with the same words is a new request under a new id', () => {
    const failed = run([ask('q', 1), {type: 'failed', id: 1, reason: 'timeout'}]);
    expect(failed).toEqual({at: 'failed', question: 'q', reason: 'timeout'});
    expect(run([ask((failed as {question: string}).question, 2)], failed)).toEqual(planning('q', 2));
  });

  test('only a timeout and an unavailable model offer to try again', () => {
    const failed = (reason: 'unsupported' | 'timeout' | 'unavailable' | 'empty'): AskState => ({
      at: 'failed',
      question: 'q',
      reason,
    });
    expect(canRetry(failed('timeout'))).toBe(true);
    expect(canRetry(failed('unavailable'))).toBe(true);
    expect(canRetry(failed('unsupported'))).toBe(false);
    expect(canRetry(failed('empty'))).toBe(false);
    expect(canRetry(planning())).toBe(false);
    expect(canRetry(IDLE)).toBe(false);
  });

  test('closing the sheet forgets the question and the answer', () => {
    expect(run([{type: 'closed'}], {at: 'answered', question: 'q', plan: SERIES, answer: ANSWER})).toBe(IDLE);
  });
});

describe('a reply that is late is dropped', () => {
  const replies = (id: number): AskEvent[] => [
    {type: 'planned', id, plan: SERIES},
    {type: 'answered', id, answer: ANSWER},
    {type: 'failed', id, reason: 'timeout'},
  ];

  test('a plan, an answer or a failure that arrives after a cancel changes nothing', () => {
    const cancelled = run([ask('q', 1), {type: 'cancelled'}]);
    expect(cancelled).toBe(IDLE);
    for (const late of replies(1)) expect(askReducer(cancelled, late)).toBe(cancelled);
  });

  test("the same words asked again after a cancel are a new request: the first one's late reply is dropped", () => {
    const again = run([ask('q', 1), {type: 'cancelled'}, ask('q', 2)]);
    expect(again).toEqual({at: 'planning', id: 2, question: 'q'});
    for (const late of replies(1)) expect(askReducer(again, late)).toBe(again);
    // and the current request's own reply is taken
    expect(askReducer(again, {type: 'planned', id: 2, plan: SERIES})).toMatchObject({at: 'fetching', id: 2});
  });

  test('the same holds in the fetching state, and the words need not match to the letter', () => {
    const reading = run([
      ask(' q ', 1),
      {type: 'planned', id: 1, plan: SERIES},
      {type: 'cancelled'},
      ask('q', 2),
      {type: 'planned', id: 2, plan: SERIES},
    ]);
    expect(reading).toMatchObject({at: 'fetching', id: 2});
    for (const late of replies(1)) expect(askReducer(reading, late)).toBe(reading);
  });

  test('a reply for the request that was replaced is dropped, in either waiting state', () => {
    const replaced = run([ask('old', 1), ask('new', 2)]);
    for (const late of replies(1)) expect(askReducer(replaced, late)).toBe(replaced);
    const reading = fetching('new', 2);
    for (const late of replies(1)) expect(askReducer(reading, late)).toBe(reading);
  });

  test('a reply for a question already answered does not move an answer or a failure', () => {
    const answered: AskState = {at: 'answered', question: 'q', plan: SERIES, answer: ANSWER};
    const failed: AskState = {at: 'failed', question: 'q', reason: 'timeout'};
    for (const from of [answered, failed]) for (const late of replies(1)) expect(askReducer(from, late)).toBe(from);
  });
});

describe('askView', () => {
  const catalog: Catalog = {
    entries: [{key: 'temp.office', name: 'Office', kind: 'measure', unit: '°'}],
    entityOf: new Map(),
    omitted: 0,
  };
  const answered = (answer: SeriesAnswer = ANSWER, plan: AnswerablePlan = SERIES): AskState => ({
    at: 'answered',
    question: 'q',
    plan,
    answer,
  });
  const view = (state: AskState, language: 'en' | 'fr' = 'en', c = catalog) => {
    const {t, fmt} = depsOf(fullHouse, language);
    // the sheet finds the state's sensor entry once and hands it over
    return askView(state, t, fmt, sensorOf(state, c));
  };

  test('idle says nothing', () => {
    expect(view(IDLE)).toEqual({message: null, summary: null, mean: null, understood: null, coverage: null});
  });

  test('planning and fetching say what the panel is doing', () => {
    expect(view(planning()).message).toBe('Working out what you asked…');
    expect(view(fetching()).message).toBe('Reading the history…');
  });

  test('each failure says its reason in plain words', () => {
    const failed = (reason: 'unsupported' | 'timeout' | 'unavailable' | 'empty'): AskState => ({
      at: 'failed',
      question: 'q',
      reason,
      ...(reason === 'empty' ? {plan: SERIES} : {}),
    });
    expect(view(failed('timeout')).message).toBe('That took too long. Try again or ask something simpler.');
    expect(view(failed('unavailable')).message).toBe("The house's model isn't answering right now.");
    expect(view(failed('empty')).message).toBe('No history for Office yesterday.');
    expect(view(failed('unsupported')).message).toBe('The panel has no sensor for that, or cannot look that up yet.');
    expect(view(failed('empty'), 'fr').message).toBe("Pas d'historique pour Office hier.");
    expect(view(failed('timeout'), 'fr').message).toContain('trop de temps');
    expect(view(failed('unavailable'), 'fr').message).toContain('modèle de la maison');
  });

  test('an empty failure names the sensor by its handle when the catalog no longer lists it', () => {
    const state: AskState = {at: 'failed', question: 'q', reason: 'empty', plan: SERIES};
    expect(askView(state, depsOf(fullHouse, 'en').t, depsOf(fullHouse, 'en').fmt).message).toBe(
      'No history for temp.office yesterday.',
    );
  });

  test('a series says its summary, its mean and what the panel understood, in English', () => {
    expect(view(answered())).toEqual({
      message: null,
      summary: 'Office · yesterday · 18.2° to 21.4°',
      mean: 'Mean 19.8°',
      understood: 'Office · over time · yesterday',
      coverage: null,
    });
  });

  test('and in French, with the French decimal comma and period', () => {
    const named: Catalog = {...catalog, entries: [{...catalog.entries[0], name: 'Bureau'}]};
    expect(view(answered(), 'fr', named)).toEqual({
      message: null,
      summary: 'Bureau · hier · 18,2° à 21,4°',
      mean: 'Moyenne 19,8°',
      understood: 'Bureau · au fil du temps · hier',
      coverage: null,
    });
  });

  test('every period has its words, in both languages', () => {
    for (const language of ['en', 'fr'] as const)
      for (const period of [
        'today',
        'yesterday',
        'last_24h',
        'this_week',
        'last_week',
        'last_7_days',
        'this_month',
        'last_month',
        'last_30_days',
      ] as const) {
        const text = view(answered(ANSWER, {form: 'series', sensor: 'temp.office', period}), language).summary;
        expect(text, `${language} ${period}`).not.toContain('ask.');
        expect(text!.split(' · ')[1].length).toBeGreaterThan(3);
      }
  });

  test('a unit other than the degree follows the figure, and a figure has at most one decimal', () => {
    const power: Catalog = {...catalog, entries: [{key: 'temp.office', name: 'Grid', kind: 'measure', unit: 'kW'}]};
    expect(view(answered({...ANSWER, low: 0.84, high: 7.1, mean: 3}), 'en', power)).toMatchObject({
      summary: 'Grid · yesterday · 0.8 kW to 7.1 kW',
      mean: 'Mean 3 kW',
    });
  });

  test('partial coverage adds a note saying where the history starts', () => {
    expect(view(answered({...ANSWER, coverage: 0.5})).coverage).toBe('History starts Nov 17');
    expect(view(answered({...ANSWER, coverage: 0.5}), 'fr').coverage).toBe("L'historique commence le 17 nov.");
  });

  test('a sensor the catalog no longer lists is named by its handle, not left blank', () => {
    expect(view(answered(), 'en', {...catalog, entries: []}).summary).toBe('temp.office · yesterday · 18.2 to 21.4');
  });
});
