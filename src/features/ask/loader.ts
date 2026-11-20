// AskLoader: the controller that runs one question of the Ask sheet: the catalog, the AI Task's plan, the history window and the answer, each step a dispatch into the sheet's reducer.
// Pattern: a Lit reactive controller (Lit docs, Reactive Controllers) over a reducer (Elm's update) with an async effect; every reply is matched to the request that asked it by id,
// so a cancelled or replaced question's late reply is dropped by the reducer, and the one `AbortSignal` of a question is also its thirty-second timeout (ADR 0040, "The model plans, the panel computes").
// The catalog is built when the sheet opens, from the providers' reads (ADR 0025), and never before; the window goes through the panel's statistics cache (ADR 0028), never the API client.
// Must not: import the shell or another feature, draw or word anything (the model's `askView` does), keep the model's reply, retry, or subscribe to an entity.
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import {Cancelled, StaleReply, type PanelApi} from '../../core/api.ts';
import type {ConfigProblem} from '../../core/config.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import type {PanelStore} from '../../core/store.ts';
import {registriesOf} from '../../core/registry.ts';
import {powerNow} from '../../providers/power.ts';
import {askCatalog, type AskReads, type Catalog} from './catalog.ts';
import {askChecks} from './checks.ts';
import {evaluateSeries} from './evaluate.ts';
import {askInstructions, askStructure} from './instructions.ts';
import {askReducer, IDLE, type AskEvent, type AskState} from './model.ts';
import {resolvePeriod, type WeekStart} from './period.ts';
import {isPlanError, parsePlan} from './plan.ts';

/** How long a question may wait for the AI Task: a local model takes a few seconds, and the sheet never spins forever (spec 29, story 16). */
export const ASK_TIMEOUT_MS = 30_000;

/** The statistics a series is drawn from: the mean of each bucket, and its extremes for the low and the high. */
const STATISTIC_TYPES = ['mean', 'min', 'max'] as const;

/** What the loader asks of the panel, read at each use: the stores follow the language and the config. */
export interface AskDeps {
  api: Pick<PanelApi, 'generateData'>;
  cache: Pick<StatisticsCache, 'statistics'>;
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

  /** What the catalog says against the config (it was cut at its cap): the sheet shows it to an admin, as the config card would. */
  get problems(): ConfigProblem[] {
    return askChecks(this.catalog);
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

  /** Asks a question, which replaces the one in flight. An empty one asks nothing. */
  ask(question: string): void {
    if (!question.trim()) return;
    this.abort?.abort();
    const id = ++this.last;
    this.dispatch({type: 'asked', id, question});
    const abort = (this.abort = new AbortController());
    void this.run(id, question.trim(), abort);
  }

  private build(): Catalog {
    const {store} = this.deps();
    const {hass, config} = store;
    const states = hass?.states ?? {};
    const reads = this.deps().reads?.() ?? {
      power: powerNow(states, config),
      states,
      registries: registriesOf(hass ?? {entities: {}, devices: {}, areas: {}}),
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

  private async run(id: number, question: string, abort: AbortController): Promise<void> {
    const {api, cache, store, weekStart, now, timeoutMs = ASK_TIMEOUT_MS} = this.deps();
    const entity = store.config.ask?.entity;
    if (entity === undefined) return this.dispatch({type: 'failed', id, reason: 'unavailable'});
    const catalog = this.catalog;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, timeoutMs);
    try {
      const instructions = askInstructions(question, now(), catalog, store.isFrench ? 'fr' : 'en', store.fmt);
      const reply = await api.generateData(entity, instructions, askStructure(catalog), {signal: abort.signal});
      const plan = parsePlan(reply, catalog);
      // the reason goes to the console, never to the screen (spec 29, "The plan")
      if (isPlanError(plan)) console.warn('home-panel ask: the reply was refused:', plan.error);
      this.dispatch({type: 'planned', id, plan});
      if (!this.waiting(id, 'fetching') || isPlanError(plan) || plan.form === 'unsupported') return;
      const window = resolvePeriod(plan.period, now(), store.fmt, weekStart);
      const sensor = catalog.entityOf.get(plan.sensor) as string;
      const rows = await cache.statistics([sensor], window.statistic, window.start, STATISTIC_TYPES, window.end);
      this.dispatch({type: 'answered', id, answer: evaluateSeries(rows[sensor] ?? [], window)});
    } catch (error) {
      if (error instanceof Cancelled && timedOut) this.dispatch({type: 'failed', id, reason: 'timeout'});
      // a close or a newer question let this one go (its state is theirs now), and a reply of a config that is gone is no answer: the frame starts over
      else if (error instanceof Cancelled || error instanceof StaleReply) return;
      else {
        console.error('home-panel ask', error);
        this.dispatch({type: 'failed', id, reason: 'unavailable'});
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
