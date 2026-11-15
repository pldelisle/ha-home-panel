// EnergyHistory: the controller that loads Energy's history through the panel's statistics cache when its host is shown, and keeps it as long as the cache would.
// Pattern: lazy load (Fowler, PoEAA) as a Lit reactive controller; nothing is asked while the host is hidden (ADR 0028). The slices are those of
// history.ts; the windows are asked together, and a reply that arrives after the host left or the config changed is dropped.
// Must not: call the API client (only the cache), draw or word anything, retry a failure more than once a minute, or keep what it derived from.
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import {rejectionReason, StaleReply} from '../../core/api.ts';
import {STATISTICS_TTL_MS, type StatisticsCache} from '../../core/statistics-cache.ts';
import type {PanelStore} from '../../core/store.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import {deriveEnergyHistory, energyWindows, type EnergyHistoryData, type EnergyReplies} from './history.ts';
import type {StatisticsWindow} from '../../providers/power-history.ts';

/** How soon after a failure the next update asks again: a failed load must not turn every update into a request. */
export const RETRY_MS = 60_000;

/** What the controller needs of its host: Lit's, and whether the pane is shown. */
export type EnergyHistoryHost = ReactiveControllerHost & {active: boolean};

/** What it asks of the panel, read at each use: the store is there once the host connects, and the formats follow the language. */
export interface EnergyHistoryDeps {
  cache: Pick<StatisticsCache, 'statistics'>;
  store: Pick<PanelStore, 'generation' | 'config'>;
  fmt: Pick<Formatters, 'isoDay' | 'hourNow'>;
}

/** The request in flight: the generation it was asked under. */
interface Request {
  generation: number;
}

/** The Energy pane mounts it (#239), for as long as the tab, or one of its sheets, is on screen. */
export class EnergyHistory implements ReactiveController {
  data: EnergyHistoryData | null = null;
  /** Why the last load failed (the card words "History didn't load"); null when it did not. */
  error: string | null = null;
  /** The generation of the config `data` was derived under. */
  private generation = -1;
  private request: Request | null = null;
  private failedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly host: EnergyHistoryHost,
    private readonly deps: () => EnergyHistoryDeps,
  ) {
    host.addController(this);
  }

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
    if (now - this.failedAt < RETRY_MS) return;
    const request: Request = (this.request = {generation});
    try {
      const windows = energyWindows(now, store.config, fmt);
      const ask = ({ids, period, start, types}: StatisticsWindow) => cache.statistics(ids, period, start, types);
      const [hour7, today, meter33, fiveMin25h, day400] = await Promise.all([
        ask(windows.hour7),
        ask(windows.today),
        ask(windows.meter33),
        ask(windows.fiveMin25h),
        ask(windows.day400),
      ]);
      // the host left, or another request began (the config changed meanwhile): this one is let go
      if (this.request !== request) return;
      const replies: EnergyReplies = {hour7, today, meter33, fiveMin25h, day400};
      this.data = deriveEnergyHistory(replies, store.config, now, fmt);
      this.generation = generation;
      this.error = null;
    } catch (error) {
      if (this.request !== request) return;
      // a reply of a config that is gone is no failure: the next update asks again under the new one
      if (!(error instanceof StaleReply)) {
        console.error('home-panel energy history', error);
        this.error = rejectionReason(error);
        this.failedAt = now;
      }
    }
    this.request = null;
    this.host.requestUpdate();
  }
}
