// AskLoader: the controller that runs one question of the Ask sheet: the catalog, the AI Task's plan, the history window and the answer, each step a dispatch into the sheet's reducer.
// Pattern: a Lit reactive controller (Lit docs, Reactive Controllers) over a reducer (Elm's update) with an async effect; every reply is matched to the request that asked it by id,
// so a cancelled or replaced question's late reply is dropped by the reducer, and the one `AbortSignal` of a question is also the thirty-second timeout of the call to the AI Task (the cache takes no signal) (ADR 0040, "The model plans, the panel computes").
// The catalog is built when the sheet opens, from the providers' reads (ADR 0025), and never before; the window goes through the panel's statistics cache (ADR 0028), never the API client.
// Must not: import the shell or another feature, draw or word anything (the model's `askView` does), keep the model's reply, retry, or subscribe to an entity.
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import {Cancelled, StaleReply, type PanelApi} from '../../core/api.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import type {PanelStore} from '../../core/store.ts';
import {registriesOf} from '../../core/registry.ts';
import {doorMotionSensors} from '../../providers/door-motion.ts';
import {personEntities} from '../../providers/people.ts';
import {powerNow} from '../../providers/power.ts';
import {dailyPowerWindow, dayKeys, kwhOfMeans, powerWindows, rowsOf} from '../../providers/power-history.ts';
import {askCatalog, type AskReads, type Catalog} from './catalog.ts';
import {
  evaluateMoments,
  evaluateSeries,
  evaluateTotal,
  type EmptyAnswer,
  type MomentsAnswer,
  type TotalAnswer,
} from './evaluate.ts';
import {askInstructions, askStructure} from './instructions.ts';
import {
  askReducer,
  IDLE,
  type Answer,
  type AnswerablePlan,
  type MomentsPlan,
  type TotalPlan,
  type AskEvent,
  type AskState,
} from './model.ts';
import {momentsWindow, resolvePeriod, totalWindow, type PeriodWindow, type WeekStart} from './period.ts';
import {isPlanError, parsePlan} from './plan.ts';
import type {Suggestion} from './suggestions.ts';

/** How long a question may wait for the AI Task: a local model takes a few seconds, and the sheet never spins forever (spec 29, story 16). */
export const ASK_TIMEOUT_MS = 30_000;

/** The statistics a series is drawn from: the mean of each bucket, and its extremes for the low and the high. */
const STATISTIC_TYPES = ['mean', 'min', 'max'] as const;

/** What the loader asks of the panel, read at each use: the stores follow the language and the config. */
export interface AskDeps {
  api: Pick<PanelApi, 'generateData'>;
  cache: Pick<StatisticsCache, 'statistics' | 'history'>;
  store: Pick<PanelStore, 'hass' | 'config' | 'names' | 't' | 'language' | 'isFrench' | 'fmt'>;
  /** The first day of the week in the panel's locale, which the element reads (`weekStartOf`). */
  weekStart: WeekStart;
  /** The clock; the element passes `() => new Date()`, a test its own. */
  now: () => Date;
  /** What the catalog reads of the house; left out, the providers' own reads of the store's hass. A test hands a crowded house here. */
  reads?: () => AskReads;
  /** How long to wait for the AI Task, in milliseconds (default `ASK_TIMEOUT_MS`). */
  timeoutMs?: number;
}

export class AskLoader implements ReactiveController {
  state: AskState = IDLE;
  private built: Catalog | null = null;
  private last = 0;
  private abort: AbortController | null = null;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly deps: () => AskDeps,
  ) {
    host.addController(this);
  }

  hostDisconnected(): void {
    this.close();
  }

  /** The sensors a question may name, as they were when the sheet opened; built on first use when nothing opened the sheet. */
  get catalog(): Catalog {
    return (this.built ??= this.build());
  }

  /** The sheet opened: the catalog is built now, from the house as it is, and nothing is asked. */
  open(): void {
    this.close();
    this.built = this.build();
    this.host.requestUpdate();
  }

  /** The sheet closed: a question in flight is let go, and the next opening starts empty. */
  close(): void {
    this.abort?.abort();
    this.abort = null;
    this.built = null;
    this.dispatch({type: 'closed'});
  }

  /** The button of the progress row: the question in flight is let go, and the sheet goes back to its field, which still holds the words. Nothing is shown for it. */
  cancel(): void {
    this.abort?.abort();
    this.abort = null;
    this.dispatch({type: 'cancelled'});
  }

  /** Asks a question, which replaces the one in flight. An empty one asks nothing. */
  ask(question: string): void {
    if (!question.trim()) return;
    this.abort?.abort();
    const id = ++this.last;
    this.dispatch({type: 'asked', id, question});
    const abort = (this.abort = new AbortController());
    void this.run(id, question.trim(), abort);
  }

  /** Asks a suggestion: its plan is the panel's own, so the AI Task is not called and the question goes straight to reading the history. It replaces the question in flight. */
  suggest({text, plan}: Suggestion): void {
    this.abort?.abort();
    const id = ++this.last;
    this.dispatch({type: 'suggested', id, question: text, plan});
    const abort = (this.abort = new AbortController());
    void this.fetchFor(id, plan, this.deps().now(), abort);
  }

  /** The sheet's Try again: a question that failed after its plan was known reads again from that plan, whoever made it, and the model is asked again only when it was the model that failed. */
  retry(): void {
    const {state} = this;
    if (state.at !== 'failed') return;
    if (state.reason !== 'empty' && state.reason !== 'unsupported' && state.plan)
      this.suggest({text: state.question, plan: state.plan});
    else this.ask(state.question);
  }

  private build(): Catalog {
    const {store} = this.deps();
    const {hass, config} = store;
    const states = hass?.states ?? {};
    const registries = registriesOf(hass ?? {entities: {}, devices: {}, areas: {}});
    const reads = this.deps().reads?.() ?? {
      power: powerNow(states, config),
      states,
      registries,
      sensors: doorMotionSensors(states, registries, store.names),
      people: personEntities(states, config.people),
    };
    return askCatalog(reads, {names: store.names, t: store.t, language: store.language}, config);
  }

  private dispatch(event: AskEvent): void {
    const next = askReducer(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.host.requestUpdate();
  }

  /** True while `id` is the request the state is waiting on, in the step named. */
  private waiting(id: number, step: 'planning' | 'fetching'): boolean {
    return this.state.at === step && this.state.id === id;
  }

  /** A binary sensor's moments: its state history from the window's start (the first point is the state then) to its end. */
  private async stated(
    plan: MomentsPlan,
    cache: AskDeps['cache'],
    sensor: string,
    window: PeriodWindow,
    now: number,
  ): Promise<MomentsAnswer | EmptyAnswer> {
    const points = await cache.history([sensor], window.start, {minimal: true, attributes: false, end: window.end});
    return evaluateMoments({history: points[sensor] ?? []}, plan, window, now);
  }

  /** A measure's statistics for the window: drawn as a series (the window's own bucket), or, for moments, read by the hour or finer, never by the day. */
  private async measured(
    plan: Exclude<AnswerablePlan, TotalPlan>,
    cache: AskDeps['cache'],
    sensor: string,
    window: PeriodWindow,
    now: number,
  ): Promise<Answer | EmptyAnswer> {
    const read = plan.form === 'moments' ? momentsWindow(window) : window;
    const rows =
      (await cache.statistics([sensor], read.statistic, read.start, STATISTIC_TYPES, read.end))[sensor] ?? [];
    return plan.form === 'moments' ? evaluateMoments({statistics: rows}, plan, read, now) : evaluateSeries(rows, read);
  }

  /**
   * A meter's total. An energy total is read by its `change` (a meter's resets are the recorder's to absorb); where the Energy card already asked a window that holds ours (its hourly `today`
   * of the house meter, its 33 daily buckets of the house and the water heater), the very same call is made, so the cache answers it (ADR 0028), and any other period asks for itself, on its own
   * stable start and, once it has ended, its end. A power sensor (the car, the heating: the rooms added up) is read from the Energy card's own hourly week or 400 daily means, and each bucket's
   * mean kW becomes kWh by the rule the card uses (`kwhOfMeans`), so the evaluation is the same for both.
   */
  private async metered(
    cache: AskDeps['cache'],
    store: AskDeps['store'],
    sensors: readonly string[],
    power: boolean,
    plan: TotalPlan,
    window: PeriodWindow,
    now: number,
  ): Promise<TotalAnswer | EmptyAnswer> {
    const read = totalWindow(plan.period, window);
    const hourly = read.statistic === 'hour';
    if (power) {
      const shared = hourly ? powerWindows(now, store.config, store.fmt).hour7 : dailyPowerWindow(now, store.config);
      const stats = await cache.statistics(shared.ids, shared.period, shared.start, shared.types);
      const rows = kwhOfMeans(
        sensors.map(id => rowsOf(stats, id)),
        hourly ? 'hour' : 'day',
        dayKeys(now, store.fmt),
        instant => store.fmt.isoDay(instant),
      );
      return evaluateTotal(rows, read, store.fmt);
    }
    const [sensor] = sensors;
    const {today, meter33} = powerWindows(now, store.config, store.fmt);
    const shared = [today, meter33].find(
      candidate =>
        candidate.period === read.statistic &&
        candidate.ids.includes(sensor) &&
        candidate.start.getTime() <= read.start.getTime(),
    );
    const rows = shared
      ? await cache.statistics(shared.ids, shared.period, shared.start, shared.types)
      : await cache.statistics(
          [sensor],
          read.statistic,
          read.start,
          ['change'],
          read.end.getTime() < now ? read.end : undefined,
        );
    return evaluateTotal(rows[sensor] ?? [], read, store.fmt);
  }

  private async run(id: number, question: string, abort: AbortController): Promise<void> {
    const {api, store, now, timeoutMs = ASK_TIMEOUT_MS} = this.deps();
    const entity = store.config.ask?.entity;
    if (entity === undefined) return this.dispatch({type: 'failed', id, reason: 'unavailable'});
    // the entity's own state says so before any call is made: nothing to wait thirty seconds for (the other source is a call that rejects, below)
    if (store.hass?.states[entity]?.state === 'unavailable')
      return this.dispatch({type: 'failed', id, reason: 'unavailable'});
    const catalog = this.catalog;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, timeoutMs);
    try {
      // the clock is read once for the question: the window and the "still" of a span are judged against the same instant, whatever the fetch took
      const asked = now();
      const instructions = askInstructions(question, asked, catalog, store.isFrench ? 'fr' : 'en', store.fmt);
      const reply = await api.generateData(entity, instructions, askStructure(catalog), {signal: abort.signal});
      // the thirty seconds are the AI Task's: the statistics cache takes no signal and has its own failure and retry rules (ADR 0028)
      clearTimeout(timer);
      const plan = parsePlan(reply, catalog);
      // the reason goes to the console, never to the screen (spec 29, "The plan")
      if (isPlanError(plan)) console.warn('home-panel ask: the reply was refused:', plan.error);
      this.dispatch({type: 'planned', id, plan});
      if (!this.waiting(id, 'fetching') || isPlanError(plan) || plan.form === 'unsupported') return;
      await this.read(id, plan, asked);
    } catch (error) {
      if (error instanceof Cancelled && timedOut) this.dispatch({type: 'failed', id, reason: 'timeout'});
      else this.fail(id, error);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The reading half of a question, for a plan the panel has (a suggestion's, or the model's once parsed): the window, the recorder and the evaluation. A failure here is the recorder's, not the model's. */
  private async fetchFor(id: number, plan: AnswerablePlan, asked: Date, abort: AbortController): Promise<void> {
    try {
      await this.read(id, plan, asked);
    } catch (error) {
      this.fail(id, error);
    }
    if (this.abort === abort) this.abort = null;
  }

  private async read(id: number, plan: AnswerablePlan, asked: Date): Promise<void> {
    const {cache, store, weekStart} = this.deps();
    const catalog = this.catalog;
    const window = resolvePeriod(plan.period, asked, store.fmt, weekStart);
    const sensors = catalog.entityOf.get(plan.sensor) as readonly string[];
    const [sensor] = sensors;
    const answer =
      plan.form === 'total'
        ? await this.metered(
            cache,
            store,
            sensors,
            catalog.fromPower?.has(plan.sensor) === true,
            plan,
            window,
            asked.getTime(),
          )
        : plan.form === 'moments' && 'on' in plan.test
          ? await this.stated(plan, cache, sensor, window, asked.getTime())
          : await this.measured(plan, cache, sensor, window, asked.getTime());
    this.dispatch({type: 'answered', id, answer});
  }

  /** A close or a newer question let this one go (its state is theirs now), and a reply of a config that is gone is no answer: the frame starts over; anything else is said as a failure. */
  private fail(id: number, error: unknown): void {
    if (error instanceof Cancelled || error instanceof StaleReply) return;
    console.error('home-panel ask', error);
    this.dispatch({type: 'failed', id, reason: 'unavailable'});
  }
}
