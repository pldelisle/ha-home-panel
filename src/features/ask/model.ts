// The model of the Ask sheet: one discriminated state, the reducer that moves it, and the texts the sheet shows for a state.
// Pattern: a reducer over a tagged union (Elm's update; Redux), so no impossible combination can be written (a failure with an answer, an
// answer with no plan); a reply is dropped unless it is for the request that is in flight (matched by id, not by the words), which is how a cancel is honoured without
// aborting anything here. `askView` is the humble element's only source of text (ADR 0005). Spec 29, "The model of the sheet".
// Must not: call a model, fetch, read the clock or the DOM, show a model's own words (the texts are the catalog's), or hold a timer (the timeout is the port's).
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {Catalog, CatalogEntry} from './catalog.ts';
import type {EmptyAnswer, Moment, MomentsAnswer, SeriesAnswer} from './evaluate.ts';
import type {Period} from './period.ts';
import {isPlanError, type Plan, type PlanError} from './plan.ts';

/** A plan the panel can run: everything but `unsupported`, which is a failure and never a plan to fetch for. */
export type AnswerablePlan = Exclude<Plan, {form: 'unsupported'}>;

/** What the sheet draws for a question that was answered; the total joins this union with its slice. */
export type Answer = SeriesAnswer | MomentsAnswer;

export type FailureReason = 'unsupported' | 'timeout' | 'unavailable' | 'empty';

export type AskState =
  | {at: 'idle'}
  | {at: 'planning'; id: number; question: string}
  | {at: 'fetching'; id: number; question: string; plan: AnswerablePlan}
  | {at: 'answered'; question: string; plan: AnswerablePlan; answer: Answer}
  // an empty failure keeps the plan, so its line can name the sensor and the period it found nothing for; no other failure has one
  | {at: 'failed'; question: string; reason: 'empty'; plan: AnswerablePlan}
  | {at: 'failed'; question: string; reason: Exclude<FailureReason, 'empty'>};

/**
 * What happens to the sheet. A question carries a request id, a number the caller counts up, and every reply names the id it is for, so a late
 * reply is told from a current one even when the same words were asked again after a cancel.
 */
export type AskEvent =
  | {type: 'asked'; id: number; question: string}
  | {type: 'planned'; id: number; plan: Plan | PlanError}
  | {type: 'answered'; id: number; answer: Answer | EmptyAnswer}
  | {type: 'failed'; id: number; reason: 'timeout' | 'unavailable'}
  | {type: 'cancelled'}
  | {type: 'closed'};

export const IDLE: AskState = {at: 'idle'};

const isWaiting = (state: AskState): state is Extract<AskState, {at: 'planning' | 'fetching'}> =>
  state.at === 'planning' || state.at === 'fetching';

/** The next state. A reply that is not for the request in flight returns the state it was given, the very same object. */
export function askReducer(state: AskState, event: AskEvent): AskState {
  switch (event.type) {
    case 'asked': {
      const question = event.question.trim();
      return question ? {at: 'planning', id: event.id, question} : state;
    }
    case 'cancelled':
      return isWaiting(state) ? IDLE : state;
    case 'closed':
      return IDLE;
    case 'planned': {
      if (state.at !== 'planning' || state.id !== event.id) return state;
      const {plan} = event;
      return isPlanError(plan) || plan.form === 'unsupported'
        ? {at: 'failed', question: state.question, reason: 'unsupported'}
        : {at: 'fetching', id: state.id, question: state.question, plan};
    }
    case 'answered': {
      if (state.at !== 'fetching' || state.id !== event.id) return state;
      const {answer} = event;
      return answer.kind === 'empty'
        ? {at: 'failed', question: state.question, reason: 'empty', plan: state.plan}
        : {at: 'answered', question: state.question, plan: state.plan, answer};
    }
    case 'failed':
      return isWaiting(state) && state.id === event.id
        ? {at: 'failed', question: state.question, reason: event.reason}
        : state;
  }
}

/** The failures a second try can change: the model was slow or away. A question the panel cannot place, or a period with no history, answers the same again. */
export const canRetry = (state: AskState): boolean =>
  state.at === 'failed' && (state.reason === 'timeout' || state.reason === 'unavailable');

/** The catalog's entry for the sensor a state is about (an answer's, or an empty failure's), if the catalog still lists it: the caller finds it once and hands it to `askView` and the chart. */
export const sensorOf = (state: AskState, catalog: Pick<Catalog, 'entries'>): CatalogEntry | undefined =>
  state.at === 'answered' || (state.at === 'failed' && state.reason === 'empty')
    ? catalog.entries.find(entry => entry.key === state.plan.sensor)
    : undefined;

/** The texts the sheet shows for a state; a null is a line it does not draw. */
export interface AskView {
  /** What stands in place of an answer: the progress of a question, or the reason it has none. */
  message: string | null;
  /** "Office · yesterday · 18.2° to 21.4°", the answer in a line, which the chart's summary also reads. */
  summary: string | null;
  /** "Mean 19.8°". */
  mean: string | null;
  /** "Office · over time · yesterday": what the panel understood, so a wrong plan shows as a wrong plan and not as a wrong fact. */
  understood: string | null;
  /** The note under an answer whose history covers only part of the period. */
  coverage: string | null;
  /** The spans of a moments answer, the first `MOMENTS_SHOWN` of them; absent for any other state, and for a moments answer with no span. */
  moments?: MomentLine[];
  /** "and 14 more", when the spans were more than are shown. */
  more?: string;
}

/** One span of a moments answer: "Tue 10:07 am – 10:32 am", "25 min"; `ongoing` when its end reads "still". */
export interface MomentLine {
  when: string;
  length: string;
  ongoing: boolean;
}

/** How many spans the list shows before it says how many more there are (spec 29, "The elements"). */
export const MOMENTS_SHOWN = 20;

type MomentsPlan = Extract<Plan, {form: 'moments'}>;

const NOTHING: AskView = {message: null, summary: null, mean: null, understood: null, coverage: null};

/** A figure as the sheet writes it: one decimal at most, the degree sign against the figure and any other unit after a space. */
export const figure = (fmt: Formatters, value: number, unit: string): string => {
  const text = fmt.number(value, 1);
  return unit === '°' ? `${text}°` : unit ? `${text} ${unit}` : text;
};

/** The periods of a month's length, whose spans are told apart by their date, not by the weekday alone. */
const LONG_PERIODS: readonly Period[] = ['this_month', 'last_month', 'last_30_days'];

/** The line of a span: its start and its end (or "still") as the house writes them, the day named where the day is not plain. */
function momentLine(span: Moment, period: Period, t: Translate, fmt: Formatters): MomentLine {
  const day = (instant: number) =>
    LONG_PERIODS.includes(period) ? fmt.dateWeekday(instant) : fmt.weekday(instant, 'short');
  const start = `${day(span.start)} ${fmt.time(span.start)}`;
  const end = span.ongoing
    ? t('ask.moment.still')
    : fmt.isoDay(span.end) === fmt.isoDay(span.start)
      ? fmt.time(span.end)
      : `${day(span.end)} ${fmt.time(span.end)}`;
  return {when: `${start} – ${end}`, length: fmt.durationShort(span.end - span.start), ongoing: span.ongoing};
}

/** What the panel understood of a moments plan: the sensor's word for the state, or the threshold, then the shortest length asked for. */
function testWords(plan: MomentsPlan, t: Translate, fmt: Formatters, sensor?: CatalogEntry): string {
  const {test} = plan;
  const unit = sensor?.unit ?? '';
  const words = sensor?.words ?? {on: 'ask.words.on', off: 'ask.words.off'};
  const said =
    'on' in test
      ? t(test.on ? words.on : words.off)
      : 'above' in test
        ? t('ask.test.above', {value: figure(fmt, test.above, unit)})
        : t('ask.test.below', {value: figure(fmt, test.below, unit)});
  return plan.longerThanMin === null ? said : t('ask.test.longer', {test: said, n: fmt.number(plan.longerThanMin)});
}

/** The view of a moments answer: the count and the total (or "no moments"), the list, what was understood and the coverage note. */
function momentsView(
  plan: MomentsPlan,
  answer: MomentsAnswer,
  t: Translate,
  fmt: Formatters,
  sensor?: CatalogEntry,
): AskView {
  const period = t(`ask.period.${plan.period}`);
  const view: AskView = {
    message: null,
    summary:
      answer.count === 0
        ? t('ask.summary.none', {period})
        : t('ask.summary.moments', {count: answer.count, total: fmt.durationShort(answer.totalMs)}),
    mean: null,
    understood: t('ask.understood.moments', {
      name: sensor?.name ?? plan.sensor,
      test: testWords(plan, t, fmt, sensor),
      period,
    }),
    coverage: answer.coverage < 1 ? t('ask.coverage', {date: fmt.date(answer.from)}) : null,
  };
  if (answer.count > 0)
    view.moments = answer.spans.slice(0, MOMENTS_SHOWN).map(span => momentLine(span, plan.period, t, fmt));
  if (answer.count > MOMENTS_SHOWN) view.more = t('ask.more', {count: answer.count - MOMENTS_SHOWN});
  return view;
}

/** The words of a state, in the panel's language, from the catalog's messages and the store's formatters. `sensor` is what `sensorOf` found. */
export function askView(state: AskState, t: Translate, fmt: Formatters, sensor?: CatalogEntry): AskView {
  switch (state.at) {
    case 'idle':
      return NOTHING;
    case 'planning':
      return {...NOTHING, message: t('ask.state.planning')};
    case 'fetching':
      return {...NOTHING, message: t('ask.state.fetching')};
    case 'failed':
      return {
        ...NOTHING,
        message:
          state.reason === 'empty'
            ? t('ask.failed.empty', {
                name: sensor?.name ?? state.plan.sensor,
                period: t(`ask.period.${state.plan.period}`),
              })
            : t(`ask.failed.${state.reason}`),
      };
    case 'answered': {
      const {plan, answer} = state;
      // a moments answer is only ever of a moments plan: the loader runs the one the plan names
      if (answer.kind === 'moments') return momentsView(plan as MomentsPlan, answer, t, fmt, sensor);
      const name = sensor?.name ?? plan.sensor;
      const unit = sensor?.unit ?? '';
      const period = t(`ask.period.${plan.period}`);
      return {
        message: null,
        summary: t('ask.summary.series', {
          name,
          period,
          low: figure(fmt, answer.low, unit),
          high: figure(fmt, answer.high, unit),
        }),
        mean: t('ask.mean', {mean: figure(fmt, answer.mean, unit)}),
        understood: t('ask.understood.series', {name, period}),
        coverage: answer.coverage < 1 ? t('ask.coverage', {date: fmt.date(answer.from)}) : null,
      };
    }
  }
}
