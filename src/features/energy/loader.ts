// EnergyHistory: the controller that loads Energy's history through the panel's statistics cache when its host is shown, and keeps it as long as the cache would.
// Pattern: composition over the kit's `WindowedHistory` (lazy load, Fowler, PoEAA): this says which windows and what derives them (the slices are those of history.ts), the kit says when to ask
// (nothing while the host is hidden, ADR 0028, a late reply dropped, a failure retried at most once a minute).
// Must not: call the API client (only the cache, through the kit), draw or word anything, or keep what it derived from.
import type {ReactiveController} from 'lit';
import type {Formatters} from '../../core/i18n/format.ts';
import {
  WindowedHistory,
  type WindowedHistoryDeps,
  type WindowedHistoryHost,
} from '../../ui/controllers/windowed-history.ts';
import {deriveEnergyHistory, energyWindows, type EnergyHistoryData, type EnergyWindows} from './history.ts';

/** What the controller needs of its host: Lit's, and whether the pane is shown. */
export type EnergyHistoryHost = WindowedHistoryHost;

/** What it asks of the panel, read at each use: the store is there once the host connects, and the formats follow the language. */
export type EnergyHistoryDeps = WindowedHistoryDeps<Pick<Formatters, 'isoDay' | 'hourNow'>>;

/** The Energy pane mounts it (#239), for as long as the tab, or one of its sheets, is on screen. */
export class EnergyHistory implements ReactiveController {
  private readonly history: WindowedHistory<EnergyWindows, EnergyHistoryData, EnergyHistoryDeps['fmt']>;

  constructor(host: EnergyHistoryHost, deps: () => EnergyHistoryDeps) {
    this.history = new WindowedHistory<EnergyWindows, EnergyHistoryData, EnergyHistoryDeps['fmt']>(host, deps, {
      windows: energyWindows,
      derive: deriveEnergyHistory,
      tag: 'home-panel energy history',
    });
    // last: Lit connects a controller added to a connected host at once
    host.addController(this);
  }

  hostConnected(): void {
    this.history.hostConnected();
  }

  hostUpdate(): void {
    this.history.hostUpdate();
  }

  hostDisconnected(): void {
    this.history.hostDisconnected();
  }

  /** What the last load derived; null before it, or once it is another config's. */
  get data(): EnergyHistoryData | null {
    return this.history.data;
  }

  /** Why the last load failed (the card words "History didn't load"); null when it did not. */
  get error(): string | null {
    return this.history.error;
  }
}
