// StackHistory: what the smart stack's Energy-today filler reads of the past, today's hours of the flow and the meter's total for today,
// through the panel's statistics cache.
// Pattern: composition over the kit's `WindowedHistory` (lazy load, Fowler, PoEAA), as Live's, Car's and Energy's loaders are: the three
// windows are the very ones Energy's card asks (`powerWindows()`'s `hour7`, `today` and `meter33`), so the panel-wide cache answers
// the stack from what they loaded (ADR 0028).
// Must not: call the API client (only the cache, through the kit), draw or word anything, or keep the replies it derived from.
import type {ReactiveController} from 'lit';
import type {ResolvedConfig} from '../../core/config.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import {
  dayKeys,
  flowIds,
  hourlyFlow,
  meterTotals,
  powerWindows,
  type StatisticsWindow,
  type StatsReply,
} from '../../providers/power-history.ts';
import {
  WindowedHistory,
  type WindowedHistoryDeps,
  type WindowedHistoryHost,
} from '../../ui/controllers/windowed-history.ts';
import type {StackHistoryData} from './inputs.ts';

/** The three windows: the hourly flow of the last week, today's meter and the meter's last 33 days. */
interface StackWindows {
  hour7: StatisticsWindow;
  today: StatisticsWindow;
  meter33: StatisticsWindow;
}

type Fmt = Pick<Formatters, 'hourNow' | 'isoDay'>;

export function stackWindows(now: number, config: ResolvedConfig, fmt: Fmt): StackWindows {
  const {hour7, today, meter33} = powerWindows(now, config, fmt);
  return {hour7, today, meter33};
}

/** Today's hours of the flow and the meter's totals, from the three replies. */
function deriveStackHistory(
  replies: Record<keyof StackWindows, StatsReply>,
  config: ResolvedConfig,
  now: number,
  fmt: Fmt,
): StackHistoryData {
  return {
    at: now,
    flow: hourlyFlow(replies.hour7, flowIds(config)),
    totals: meterTotals(
      replies.meter33,
      replies.today,
      {energy: config.entities.energy},
      dayKeys(now, fmt),
      fmt.isoDay,
    ),
  };
}

export type StackHistoryDeps = WindowedHistoryDeps<Fmt>;

export class StackHistory implements ReactiveController {
  private readonly history: WindowedHistory<StackWindows, StackHistoryData, Fmt>;

  constructor(host: WindowedHistoryHost, deps: () => StackHistoryDeps) {
    this.history = new WindowedHistory<StackWindows, StackHistoryData, Fmt>(host, deps, {
      windows: stackWindows,
      derive: deriveStackHistory,
      tag: 'home-panel stack history',
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
  get data(): StackHistoryData | null {
    return this.history.data;
  }
}
