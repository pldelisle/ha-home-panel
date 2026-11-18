// WindowedHistory: the controller that loads a feature's statistics windows through the panel's statistics cache when its host is shown, and keeps what it derived as long as the cache would.
// Pattern: lazy load (Fowler, PoEAA) as a Lit reactive controller, built once from the Car's and Energy's identical loaders (the rule of three, with Climate's, which keeps one entry per range and stays its own):
// composition, not a base class: it does not register itself with the host, its owner (a feature's `CarHistory`,
// `EnergyHistory`) does and hands it the host's three hooks; a feature gives it the function that names its windows, the one
// that derives its data from the replies, and a log tag (ADR 0028). Nothing is asked while the host is hidden,
// the windows are asked together, and a reply that arrives after the host left or the config changed is dropped.
// Must not: call the API client (only the cache), draw or word anything, know what a window is for, retry a failure more than once a minute, or keep the replies it derived from.
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import {rejectionReason, StaleReply} from '../../core/api.ts';
import type {ResolvedConfig} from '../../core/config.ts';
import type {StatisticRow} from '../../core/ha.ts';
import {HISTORY_RETRY_MS, STATISTICS_TTL_MS, type StatisticsCache} from '../../core/statistics-cache.ts';
import type {PanelStore} from '../../core/store.ts';

/** What the controller needs of its host: Lit's, and whether the pane is shown. */
export type WindowedHistoryHost = ReactiveControllerHost & {active: boolean};

/** One call to the cache: the shape of a provider's `StatisticsWindow`, which the kit may not import. */
export interface WindowRequest {
  start: Date;
  period: 'hour' | 'day' | '5minute';
  ids: readonly (string | null)[];
  types: readonly string[];
}

/** The windows a feature asks, each under its own name: an interface of `WindowRequest`s, which is what `W` stands for. */
export type Windows<W> = Record<keyof W, WindowRequest>;

/** The recorder's reply to each window, under the window's name. */
export type Replies<W extends Windows<W>> = {[name in keyof W]: Readonly<Record<string, readonly StatisticRow[]>>};

/** What a feature gives: its windows, what it derives from the replies, and the tag its failures are logged under. `F` is what it needs of the panel's formats. */
export interface WindowedHistorySpec<W extends Windows<W>, D extends {at: number}, F> {
  windows(now: number, config: ResolvedConfig, fmt: F): W;
  derive(replies: Replies<W>, config: ResolvedConfig, now: number, fmt: F): D;
  /** `home-panel car history`: the prefix of the console line of a failed load. */
  tag: string;
}

/** What it asks of the panel, read at each use: the store is there once the host connects, and the formats follow the language. */
export interface WindowedHistoryDeps<F> {
  cache: Pick<StatisticsCache, 'statistics'>;
  store: Pick<PanelStore, 'generation' | 'config'>;
  fmt: F;
}

/** The request in flight: the generation it was asked under. */
interface Request {
  generation: number;
}

export class WindowedHistory<W extends Windows<W>, D extends {at: number}, F> implements ReactiveController {
  data: D | null = null;
  /** Why the last load failed (the card words "History didn't load"); null when it did not. */
  error: string | null = null;
  /** The generation of the config `data` was derived under. */
  private generation = -1;
  private request: Request | null = null;
  private failedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly host: WindowedHistoryHost,
    private readonly deps: () => WindowedHistoryDeps<F>,
    private readonly spec: WindowedHistorySpec<W, D, F>,
  ) {}

  hostConnected(): void {
    if (this.host.active) void this.refresh();
  }

  hostUpdate(): void {
    if (this.host.active) void this.refresh();
  }

  /** A reply still on its way is let go: the host is not shown any more. */
  hostDisconnected(): void {
    this.request = null;
  }

  private async refresh(): Promise<void> {
    const {cache, store, fmt} = this.deps();
    const {generation} = store;
    const now = Date.now();
    if (this.data && generation === this.generation && now - this.data.at < STATISTICS_TTL_MS) return;
    if (this.request?.generation === generation) return;
    if (now - this.failedAt < HISTORY_RETRY_MS) return;
    const request: Request = (this.request = {generation});
    try {
      const windows = this.spec.windows(now, store.config, fmt);
      const names = Object.keys(windows) as (keyof W)[];
      const answers = await Promise.all(
        names.map(name => {
          const {ids, period, start, types} = windows[name];
          return cache.statistics(ids, period, start, types);
        }),
      );
      // the host left, or another request began (the config changed meanwhile): this one is let go
      if (this.request !== request) return;
      const replies = Object.fromEntries(names.map((name, index) => [name, answers[index]])) as unknown as Replies<W>;
      this.data = this.spec.derive(replies, store.config, now, fmt);
      this.generation = generation;
      this.error = null;
    } catch (error) {
      if (this.request !== request) return;
      // a reply of a config that is gone is no failure: the next update asks again under the new one
      if (!(error instanceof StaleReply)) {
        console.error(this.spec.tag, error);
        this.error = rejectionReason(error);
        this.failedAt = now;
      }
    }
    this.request = null;
    this.host.requestUpdate();
  }
}
