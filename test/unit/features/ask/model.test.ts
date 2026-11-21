// The sheet's model: the reducer over one discriminated state, and the texts the sheet shows for a state. Every transition, a reply for a
// request that was cancelled or replaced, even when the same words were asked again, and the view in both languages over the real formatters of a store.
import {describe, expect, test} from 'vitest';
import type {Catalog} from '../../../../src/features/ask/catalog.ts';
import type {EmptyAnswer, MomentsAnswer, SeriesAnswer, TotalAnswer} from '../../../../src/features/ask/evaluate.ts';
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

  test('a suggestion goes from idle, or from an unsupported answer, straight to fetching with its plan: no planning step', () => {
    const tap: AskEvent = {type: 'suggested', id: 3, question: 'Office: how warm was it yesterday?', plan: SERIES};
    const fetched = {at: 'fetching', id: 3, question: 'Office: how warm was it yesterday?', plan: SERIES};
    expect(run([tap])).toEqual(fetched);
    expect(run([tap], {at: 'failed', question: 'q', reason: 'unsupported'})).toEqual(fetched);
    // like a typed question, it replaces anything else and its answer is matched by its id
    expect(run([tap], planning('old', 2))).toEqual(fetched);
    expect(run([{type: 'answered', id: 3, answer: ANSWER}], run([tap]))).toMatchObject({at: 'answered', plan: SERIES});
    expect(run([{type: 'answered', id: 2, answer: ANSWER}], run([tap]))).toEqual(fetched);
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

  test('an unsupported line points at the suggestions only when there are some to point at', () => {
    const state: AskState = {at: 'failed', question: 'q', reason: 'unsupported'};
    const {t, fmt} = depsOf(fullHouse, 'en');
    expect(askView(state, t, fmt, undefined, true).message).toBe(
      'The panel has no sensor for that, or cannot look that up yet. Try one of the suggestions.',
    );
    expect(askView(state, t, fmt, undefined, false).message).toBe(
      'The panel has no sensor for that, or cannot look that up yet.',
    );
    const french = depsOf(fullHouse, 'fr');
    expect(askView(state, french.t, french.fmt, undefined, true).message).toContain('Essayez une des suggestions.');
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

describe('askView of moments', () => {
  const WORDS = {on: 'ask.words.open', off: 'ask.words.closed'};
  const catalog: Catalog = {
    entries: [
      {key: 'door.patio', name: 'Patio door', kind: 'binary', unit: '', words: WORDS},
      {key: 'home.alex', name: 'Alex', kind: 'binary', unit: '', words: {on: 'ask.words.home', off: 'ask.words.away'}},
      {key: 'temp.office', name: 'Office', kind: 'measure', unit: '°'},
    ],
    entityOf: new Map(),
    omitted: 0,
  };
  const MIN = 6e4;
  // 10:07 am Toronto time, Tuesday the 17th
  const at = (hour: number, minute: number) => Date.UTC(2026, 10, 17, hour + 5, minute);
  const span = (from: [number, number], to: [number, number], ongoing = false) => ({
    start: at(...from),
    end: at(...to),
    ongoing,
  });
  const SPANS = [span([10, 7], [10, 32]), span([14, 10], [14, 22])];
  const MOMENTS: MomentsAnswer = {
    kind: 'moments',
    spans: SPANS,
    count: 2,
    totalMs: 37 * MIN,
    coverage: 1,
    from: at(0, 0),
  };
  const planOf = (over: Record<string, unknown> = {}): AnswerablePlan => ({
    form: 'moments',
    sensor: 'door.patio',
    period: 'this_week',
    test: {on: true},
    longerThanMin: null,
    ...over,
  });
  const view = (answer: MomentsAnswer, plan: AnswerablePlan, language: 'en' | 'fr' = 'en', c = catalog) => {
    const {t, fmt} = depsOf(fullHouse, language);
    const state: AskState = {at: 'answered', question: 'q', plan, answer};
    return askView(state, t, fmt, sensorOf(state, c));
  };

  test('says the count and the total as the summary, the spans with their start, end and length, and what it understood', () => {
    expect(view(MOMENTS, planOf({longerThanMin: 10}))).toEqual({
      message: null,
      summary: '2 times, 37 min',
      mean: null,
      understood: 'Patio door · open longer than 10 min · this week',
      coverage: null,
      moments: [
        {when: 'Tue 10:07 am – 10:32 am', length: '25 min', ongoing: false},
        {when: 'Tue 2:10 pm – 2:22 pm', length: '12 min', ongoing: false},
      ],
    });
  });

  test('says it in French, with the plural of a single time', () => {
    const one: MomentsAnswer = {...MOMENTS, spans: [SPANS[1]], count: 1, totalMs: 12 * MIN};
    const french = view(one, planOf({test: {on: false}, longerThanMin: 5}), 'fr');
    expect(french.summary).toBe('1 fois, 12 min');
    expect(french.understood).toBe('Patio door · fermé plus de 5 min · cette semaine');
    expect(french.moments?.[0]).toEqual({when: 'mar. 14 h 10 – 14 h 22', length: '12 min', ongoing: false});
    expect(view(MOMENTS, planOf()).summary).toBe('2 times, 37 min');
    expect(view({...MOMENTS, count: 1, spans: [SPANS[0]]}, planOf()).summary).toBe('1 time, 37 min');
  });

  test('a span that is still going says "still" where its end would be', () => {
    const going: MomentsAnswer = {...MOMENTS, spans: [span([16, 0], [16, 40], true)], count: 1, totalMs: 40 * MIN};
    expect(view(going, planOf()).moments).toEqual([{when: 'Tue 4:00 pm – still', length: '40 min', ongoing: true}]);
    expect(view(going, planOf(), 'fr').moments?.[0].when).toBe('mar. 16 h – en cours');
  });

  test('a span that ends another day names that day, and a month-long period names the date of each start', () => {
    const across: MomentsAnswer = {
      ...MOMENTS,
      spans: [{start: at(22, 0), end: at(26, 0), ongoing: false}],
      count: 1,
      totalMs: 4 * 60 * MIN,
    };
    expect(view(across, planOf()).moments?.[0].when).toBe('Tue 10:00 pm – Wed 2:00 am');
    expect(view(across, planOf({period: 'last_30_days'})).moments?.[0].when).toBe(
      'Tue, Nov 17 10:00 pm – Wed, Nov 18 2:00 am',
    );
  });

  test('shows at most 20 spans and says how many more there are', () => {
    const many: MomentsAnswer = {
      ...MOMENTS,
      spans: Array.from({length: 34}, (_, i) => span([0, i], [0, i + 1])),
      count: 34,
      totalMs: 34 * MIN,
    };
    const shown = view(many, planOf());
    expect(shown.moments).toHaveLength(20);
    expect(shown.more).toBe('and 14 more');
    expect(view(many, planOf(), 'fr').more).toBe('et 14 de plus');
    expect(view({...many, spans: many.spans.slice(0, 20), count: 20}, planOf()).more).toBeUndefined();
  });

  test('nothing matched is said plainly, with no list, and the understood line still says what was asked', () => {
    const none: MomentsAnswer = {...MOMENTS, spans: [], count: 0, totalMs: 0};
    expect(view(none, planOf())).toEqual({
      message: null,
      summary: 'No moments this week',
      mean: null,
      understood: 'Patio door · open · this week',
      coverage: null,
    });
    expect(view(none, planOf(), 'fr').summary).toBe('Aucun moment cette semaine');
  });

  test('a measure says its threshold in its unit, above or below', () => {
    const above = view(MOMENTS, planOf({sensor: 'temp.office', test: {above: 23}, period: 'yesterday'}));
    expect(above.understood).toBe('Office · above 23° · yesterday');
    expect(view(MOMENTS, planOf({sensor: 'temp.office', test: {below: 18.5}, longerThanMin: 30})).understood).toBe(
      'Office · below 18.5° longer than 30 min · this week',
    );
    expect(view(MOMENTS, planOf({sensor: 'temp.office', test: {above: 23}}), 'fr').understood).toBe(
      'Office · au-dessus de 23° · cette semaine',
    );
    expect(view(MOMENTS, planOf({sensor: 'temp.office', test: {below: 18.5}}), 'fr').understood).toContain(
      'sous 18,5°',
    );
  });

  test('each pair of words, and the plain on and off for a sensor the catalog no longer lists', () => {
    expect(view(MOMENTS, planOf({sensor: 'home.alex'})).understood).toBe('Alex · home · this week');
    expect(view(MOMENTS, planOf({sensor: 'home.alex', test: {on: false}})).understood).toBe('Alex · away · this week');
    const gone = {...catalog, entries: []};
    expect(view(MOMENTS, planOf(), 'en', gone).understood).toBe('door.patio · on · this week');
    expect(view(MOMENTS, planOf({test: {on: false}}), 'en', gone).understood).toBe('door.patio · off · this week');
  });

  test('a moments answer of a plan that is not for moments has no words, and no wrong ones', () => {
    const series: AnswerablePlan = {form: 'series', sensor: 'temp.office', period: 'yesterday'};
    expect(view(MOMENTS, series)).toEqual({message: null, summary: null, mean: null, understood: null, coverage: null});
  });

  test('partial coverage adds the note saying where the history starts', () => {
    expect(view({...MOMENTS, coverage: 0.4}, planOf()).coverage).toBe('History starts Nov 17');
  });
});

describe('askView of a total', () => {
  const catalog: Catalog = {
    entries: [{key: 'energy.house', name: 'House energy', kind: 'meter', unit: 'kWh'}],
    entityOf: new Map(),
    omitted: 0,
  };
  const day = (n: number) => Date.UTC(2026, 10, 9 + n, 5);
  const TOTAL: TotalAnswer = {
    kind: 'total',
    total: 42.34,
    unit: 'kWh',
    bucket: 'day',
    bars: [
      {at: day(0), value: 20.1, partial: false},
      {at: day(1), value: 22.24, partial: false},
    ],
    coverage: 1,
    from: day(0),
  };
  const plan = (period: 'last_week' | 'today' = 'last_week'): AnswerablePlan => ({
    form: 'total',
    sensor: 'energy.house',
    period,
  });
  const view = (answer: TotalAnswer, p: AnswerablePlan = plan(), language: 'en' | 'fr' = 'en', c = catalog) => {
    const {t, fmt} = depsOf(fullHouse, language);
    const state: AskState = {at: 'answered', question: 'q', plan: p, answer};
    return askView(state, t, fmt, sensorOf(state, c));
  };

  test('says the figure with its unit, what the panel understood and, for the bars, a description a screen reader can read', () => {
    expect(view(TOTAL)).toEqual({
      message: null,
      summary: 'House energy · last week',
      mean: null,
      understood: 'House energy · total · last week',
      coverage: null,
      total: {value: '42.3', unit: 'kWh'},
      bars: 'House energy by day, last week',
    });
  });

  test('says it in French, with the decimal comma, and says the bars are by the hour for a day', () => {
    const named: Catalog = {...catalog, entries: [{...catalog.entries[0], name: 'Énergie de la maison'}]};
    expect(view(TOTAL, plan(), 'fr', named)).toMatchObject({
      summary: 'Énergie de la maison · la semaine dernière',
      understood: 'Énergie de la maison · total · la semaine dernière',
      total: {value: '42,3', unit: 'kWh'},
      bars: 'Énergie de la maison par jour, la semaine dernière',
    });
    expect(view({...TOTAL, bucket: 'hour'}, plan('today'))).toMatchObject({bars: 'House energy by hour, today'});
  });

  test('a zero total is a figure, not no history', () => {
    expect(view({...TOTAL, total: 0, bars: [{at: day(0), value: 0, partial: false}]})).toMatchObject({
      summary: 'House energy · last week',
      total: {value: '0', unit: 'kWh'},
    });
  });

  test('names the meter by its handle when the catalog no longer lists it, and notes partial coverage', () => {
    expect(view({...TOTAL, coverage: 0.5}, plan(), 'en', {...catalog, entries: []})).toMatchObject({
      summary: 'energy.house · last week',
      coverage: 'History starts Nov 9',
    });
  });

  test('a total answer of a plan that is not a total has no words, and no wrong ones', () => {
    const series: AnswerablePlan = {form: 'series', sensor: 'energy.house', period: 'last_week'};
    expect(view(TOTAL, series)).toEqual({message: null, summary: null, mean: null, understood: null, coverage: null});
  });
});
