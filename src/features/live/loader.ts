// LiveHistory: what the live activities read of the past, the water heater's last 25 hours and the Wallbox's charging sessions, through the panel's statistics cache.
// Pattern: composition over the kit's `WindowedHistory` (lazy load, Fowler, PoEAA), as Car's and Energy's loaders are: the windows are the very ones Energy's water card
// (`powerWindows().fiveMin25h`) and Car's history (`sessionsWindow`) ask, so the panel-wide cache answers the pill from what they loaded (ADR 0028).
// Must not: call the API client (only the cache, through the kit), draw or word anything, or keep the replies it derived from.
import type {ReactiveController} from 'lit';
import type {ResolvedConfig} from '../../core/config.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import {
  powerWindows,
  rowsOf,
  sessionsWindow,
  waterDay,
  type StatisticsWindow,
  type StatsReply,
} from '../../providers/power-history.ts';
import {chargingSessions} from '../../providers/wallbox.ts';
import {
  WindowedHistory,
  type WindowedHistoryDeps,
  type WindowedHistoryHost,
} from '../../ui/controllers/windowed-history.ts';
import type {LiveHistoryData} from './activities.ts';

/** The two windows: the water heater's five-minute means, and the charger's hours. */
interface LiveWindows {
  fiveMin25h: StatisticsWindow;
  hours: StatisticsWindow;
}

type Fmt = Pick<Formatters, 'hourNow'>;

export function liveWindows(now: number, config: ResolvedConfig, fmt: Fmt): LiveWindows {
  return {fiveMin25h: powerWindows(now, config, fmt).fiveMin25h, hours: sessionsWindow(now, config.entities.evP)};
}

/** The water heater's day and the charging sessions, from the two replies. */
function deriveLiveHistory(
  replies: Record<keyof LiveWindows, StatsReply>,
  config: ResolvedConfig,
  now: number,
): LiveHistoryData {
  const {whT, whP, evP} = config.entities;
  return {
    at: now,
    wh24: waterDay(replies.fiveMin25h, {temperature: whT, power: whP}),
    sessions: chargingSessions(rowsOf(replies.hours, evP)),
  };
}

export type LiveHistoryDeps = WindowedHistoryDeps<Fmt>;

export class LiveHistory implements ReactiveController {
  private readonly history: WindowedHistory<LiveWindows, LiveHistoryData, Fmt>;

  constructor(host: WindowedHistoryHost, deps: () => LiveHistoryDeps) {
    this.history = new WindowedHistory<LiveWindows, LiveHistoryData, Fmt>(host, deps, {
      windows: liveWindows,
      derive: deriveLiveHistory,
      tag: 'home-panel live history',
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
  get data(): LiveHistoryData | null {
    return this.history.data;
  }
}
