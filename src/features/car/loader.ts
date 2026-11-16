// CarHistory: the Car's two windows through the panel's statistics cache when its host is shown, kept as long as the cache would.
// Pattern: composition over the kit's `WindowedHistory` (lazy load, Fowler, PoEAA), which Energy's `EnergyHistory` is given the same way: this says which windows and what derives them, the kit
// says when to ask (nothing while the host is hidden, ADR 0028, a late reply dropped, a failure retried at most once a minute). The Car pane (#251) will mount it, and the detail (#252) read the same one through its parent.
// Must not: call the API client (only the cache, through the kit), draw or word anything, or keep the replies it derived from.
import type {ReactiveController} from 'lit';
import type {Formatters} from '../../core/i18n/format.ts';
import {
  WindowedHistory,
  type WindowedHistoryDeps,
  type WindowedHistoryHost,
} from '../../ui/controllers/windowed-history.ts';
import {carWindows, deriveCarHistory, type CarHistoryData, type CarWindows} from './history.ts';

/** What the controller needs of its host: Lit's, and whether the pane is shown. */
export type CarHistoryHost = WindowedHistoryHost;

/** What it asks of the panel, read at each use: the store is there once the host connects, and the formats follow the language. */
export type CarHistoryDeps = WindowedHistoryDeps<Pick<Formatters, 'isoDay' | 'hourNow'>>;

export class CarHistory implements ReactiveController {
  private readonly history: WindowedHistory<CarWindows, CarHistoryData, CarHistoryDeps['fmt']>;

  constructor(host: CarHistoryHost, deps: () => CarHistoryDeps) {
    this.history = new WindowedHistory<CarWindows, CarHistoryData, CarHistoryDeps['fmt']>(host, deps, {
      windows: carWindows,
      derive: deriveCarHistory,
      tag: 'home-panel car history',
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
  get data(): CarHistoryData | null {
    return this.history.data;
  }

  /** Why the last load failed (the card words "History didn't load"); null when it did not. */
  get error(): string | null {
    return this.history.error;
  }
}
