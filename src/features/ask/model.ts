// The model of the Ask sheet: one discriminated state, the reducer that moves it, and the texts the sheet shows for a state.
// Pattern: a reducer over a tagged union (Elm's update; Redux), so no impossible combination can be written (a failure with an answer, an
// answer with no plan); a reply is dropped unless it is for the request that is in flight (matched by id, not by the words), which is how a cancel is honoured without
// aborting anything here. `askView` is the humble element's only source of text (ADR 0005). Spec 29, "The model of the sheet".
// Must not: call a model, fetch, read the clock or the DOM, show a model's own words (the texts are the catalog's), or hold a timer (the timeout is the port's).
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {CatalogEntry} from './catalog.ts';
import type {EmptyAnswer, SeriesAnswer} from './evaluate.ts';
import {isPlanError, type Plan, type PlanError} from './plan.ts';

/** A plan the panel can run: everything but `unsupported`, which is a failure and never a plan to fetch for. */
export type AnswerablePlan = Exclude<Plan, {form: 'unsupported'}>;

/** What the sheet draws for a question that was answered; the moments and the total join this union with their slices. */
export type Answer = SeriesAnswer;

export type FailureReason = 'unsupported' | 'timeout' | 'unavailable' | 'empty';

export type AskState =
  | {at: 'idle'}
  | {at: 'planning'; id: number; question: string}
  | {at: 'fetching'; id: number; question: string; plan: AnswerablePlan}
  | {at: 'answered'; question: string; plan: AnswerablePlan; answer: Answer}
  | {at: 'failed'; question: string; reason: FailureReason};

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
        ? {at: 'failed', question: state.question, reason: 'empty'}
        : {at: 'answered', question: state.question, plan: state.plan, answer};
    }
    case 'failed':
      return isWaiting(state) && state.id === event.id
        ? {at: 'failed', question: state.question, reason: event.reason}
        : state;
  }
}

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
}

const NOTHING: AskView = {message: null, summary: null, mean: null, understood: null, coverage: null};

/** A figure as the sheet writes it: one decimal at most, the degree sign against the figure and any other unit after a space. */
export const figure = (fmt: Formatters, value: number, unit: string): string => {
  const text = fmt.number(value, 1);
  return unit === '°' ? `${text}°` : unit ? `${text} ${unit}` : text;
};

/** The words of a state, in the panel's language, from the catalog's messages and the store's formatters. `sensor` is the catalog's entry for the answered plan's sensor (the caller finds it once), if the catalog still lists it. */
export function askView(state: AskState, t: Translate, fmt: Formatters, sensor?: CatalogEntry): AskView {
  switch (state.at) {
    case 'idle':
      return NOTHING;
    case 'planning':
      return {...NOTHING, message: t('ask.state.planning')};
    case 'fetching':
      return {...NOTHING, message: t('ask.state.fetching')};
    case 'failed':
      return {...NOTHING, message: t(`ask.failed.${state.reason}`)};
    case 'answered': {
      const {plan, answer} = state;
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
        coverage:
          answer.coverage < 1
            ? t('ask.coverage', {percent: fmt.integer(answer.coverage * 100), date: fmt.date(answer.from)})
            : null,
      };
    }
  }
}
