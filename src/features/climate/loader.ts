// ClimateHistory: the controller that loads the Climate detail's history, one entry per range, through the panel's statistics cache when the detail is shown.
// Pattern: lazy load (Fowler, PoEAA) as a Lit reactive controller, after Energy's `EnergyHistory`: nothing is asked while the pane is hidden (ADR 0028), an entry
// younger than ten minutes is drawn from memory, and a reply for a range, a config or a visit that has gone since it was asked is dropped.
// Must not: call the API client (only the cache), draw or word anything, retry a failure more than once a minute, or keep what it derived from past a change of config.
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import {StaleReply} from '../../core/api.ts';
import {MINUTE_MS} from '../../core/figures.ts';
import type {HistoryPoint} from '../../core/ha.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import type {PanelStore} from '../../core/store.ts';
import type {Range} from '../../ui/ranges.ts';
import {climateWindow, deriveClimateHistory, type ClimateHistoryData} from './history.ts';

/** How long a range's entry is drawn from memory before the next update asks again. */
export const HISTORY_TTL_MS = 10 * MINUTE_MS;

/** How soon after a failure the next update asks again for the same range: a failed load must not turn every update into a request. */
export const RETRY_MS = MINUTE_MS;

/** What it asks of the panel and of the pane, read at each use: the cache is there once the pane connects, and the range follows the tabs. */
export interface ClimateHistoryDeps {
  cache: Pick<StatisticsCache, 'statistics' | 'history'> | undefined;
  store: Pick<PanelStore, 'generation' | 'config'>;
  /** The range the detail shows. */
  range: Range;
}

/** The request in flight: the range and the generation it was asked for. */
interface Request {
  range: Range;
  generation: number;
}

/** A range's entry and the generation of the config it was derived under. */
interface Entry {
  data: ClimateHistoryData;
  generation: number;
}

/** The last failure, for the range and the generation it was for. */
interface Failure extends Request {
  at: number;
}

/** What a failed read of the heat pump's history comes to: an empty one (the statistics are the charts'), but a StaleReply stays one, to ask again under the new config. */
const optional = (error: unknown): Record<string, readonly HistoryPoint[]> => {
  if (error instanceof StaleReply) throw error;
  return {};
};

/** The Climate pane mounts it (#246), for as long as the tab, or its sheet, is on screen. */
export class ClimateHistory implements ReactiveController {
  private readonly entries = new Map<Range, Entry>();
  private request: Request | null = null;
  private failure: Failure | null = null;

  constructor(
    private readonly host: ReactiveControllerHost,
    /** Null while no part of the pane is on screen (the tab, or the phone's sheet): nothing is asked of a hidden pane, nor is the store looked for. */
    private readonly deps: () => ClimateHistoryDeps | null,
  ) {
    host.addController(this);
  }

  /** The range's history, as loaded under the config of this generation; null before the load, or once it is another config's. */
  data(range: Range, generation: number): ClimateHistoryData | null {
    const entry = this.entries.get(range);
    return entry && entry.generation === generation ? entry.data : null;
  }

  /** The last read of the range failed, and nothing has been read since: the charts say the history is not available. */
  failed(range: Range, generation: number): boolean {
    return this.failure?.range === range && this.failure.generation === generation;
  }

  hostConnected(): void {
    void this.refresh();
  }

  hostUpdate(): void {
    void this.refresh();
  }

  /** A reply still on its way is let go: the pane is not on screen any more. Coming back asks again if the entry is old. */
  hostDisconnected(): void {
    this.request = null;
  }

  private async refresh(): Promise<void> {
    const deps = this.deps();
    if (!deps?.cache) return;
    const {cache, store, range} = deps;
    const {generation} = store;
    const now = Date.now();
    const entry = this.entries.get(range);
    if (entry && entry.generation === generation && now - entry.data.at < HISTORY_TTL_MS) return;
    const {request, failure} = this;
    if (request?.range === range && request.generation === generation) return;
    if (failure?.range === range && failure.generation === generation && now - failure.at < RETRY_MS) return;
    // asking for another range lets go of the one in flight: its reply would be for what is not shown
    const asked: Request = (this.request = {range, generation});
    try {
      const window = climateWindow(range, store.config, now);
      const hp = store.config.entities.hp;
      const ids = window.ids.filter(Boolean);
      const [statistics, history] = await Promise.all([
        ids.length ? cache.statistics(window.ids, window.period, window.start, window.types) : Promise.resolve({}),
        hp
          ? cache.history([hp], window.start, {minimal: false, attributes: true}).catch(optional)
          : Promise.resolve({}),
      ]);
      // the pane left, or another range or config was asked for meanwhile: this reply is let go
      if (this.request !== asked) return;
      const data = deriveClimateHistory({statistics, history}, range, store.config, now, window.start.getTime());
      this.entries.set(range, {data, generation});
      if (this.failure?.range === range) this.failure = null;
    } catch (error) {
      if (this.request !== asked) return;
      // a reply of a config that is gone is no failure: the next update asks again under the new one
      if (!(error instanceof StaleReply)) {
        console.error('home-panel climate history', error);
        this.failure = {...asked, at: now};
      }
    }
    this.request = null;
    this.host.requestUpdate();
  }
}
