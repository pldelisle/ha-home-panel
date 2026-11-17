// HomeHistory: what the Home pane's Energy and Water heater tiles read of the past, the meter's total for today and the water heater's
// last 25 hours, through the panel's statistics cache.
// Pattern: composition over the kit's `WindowedHistory` (lazy load, Fowler, PoEAA), as the stack's and Live's loaders are: the windows are
// the very ones Energy's card asks (`powerWindows()`'s `today`, `meter33` and `fiveMin25h`), so the panel-wide cache answers them (ADR 0028).
// Must not: call the API client (only the cache, through the kit), draw or word anything, or keep the replies it derived from.
import type {ReactiveController} from 'lit';
import type {ResolvedConfig} from '../core/config.ts';
import type {Formatters} from '../core/i18n/format.ts';
import {
  dayKeys,
  meterTotals,
  powerWindows,
  waterDay,
  type MeterTotals,
  type StatisticsWindow,
  type StatsReply,
} from '../providers/power-history.ts';
import {
  WindowedHistory,
  type WindowedHistoryDeps,
  type WindowedHistoryHost,
} from '../ui/controllers/windowed-history.ts';

/** The three windows: today's meter, the meter's last 33 days and the water heater's five-minute means. */
interface HomeWindows {
  today: StatisticsWindow;
  meter33: StatisticsWindow;
  fiveMin25h: StatisticsWindow;
}

/** What the tiles read: the shape of Energy's `totals` and `wh24`, with the time of the load. */
export interface HomeHistoryData {
  at: number;
  totals: MeterTotals;
  wh24: ReturnType<typeof waterDay>;
}

type Fmt = Pick<Formatters, 'hourNow' | 'isoDay'>;

function homeWindows(now: number, config: ResolvedConfig, fmt: Fmt): HomeWindows {
  const {today, meter33, fiveMin25h} = powerWindows(now, config, fmt);
  return {today, meter33, fiveMin25h};
}

function deriveHomeHistory(
  replies: Record<keyof HomeWindows, StatsReply>,
  config: ResolvedConfig,
  now: number,
  fmt: Fmt,
): HomeHistoryData {
  const {energy, whT, whP} = config.entities;
  return {
    at: now,
    totals: meterTotals(replies.meter33, replies.today, {energy}, dayKeys(now, fmt), fmt.isoDay),
    wh24: waterDay(replies.fiveMin25h, {temperature: whT, power: whP}),
  };
}

type HomeHistoryDeps = WindowedHistoryDeps<Fmt>;

export class HomeHistory implements ReactiveController {
  private readonly history: WindowedHistory<HomeWindows, HomeHistoryData, Fmt>;

  constructor(host: WindowedHistoryHost, deps: () => HomeHistoryDeps) {
    this.history = new WindowedHistory<HomeWindows, HomeHistoryData, Fmt>(host, deps, {
      windows: homeWindows,
      derive: deriveHomeHistory,
      tag: 'home-panel home history',
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
  get data(): HomeHistoryData | null {
    return this.history.data;
  }
}
