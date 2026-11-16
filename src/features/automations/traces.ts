// Which stored runs the Automations tab shows: the noise it leaves out, the four runs its flow cards draw, today's runs, the
// fingerprint of the states that asks for a reload, and the running pill's elapsed time.
// Pattern: pure functions over Home Assistant's `trace/list` rows (Bernhardt, functional core), the rules of the legacy
// `auNoise()`, `auPicks()`, `renderAuto()`'s filters and `auElapsed()`.
// Must not: read the clock (`now` and `midnight` are passed in), word anything but the elapsed digits, or ask Home Assistant.
import type {AutomationConfig, TraceSummary} from '../../core/ha.ts';
import {asList, triggerKind, type Automation} from '../../providers/automations.ts';

/** What the person picked: an automation, and one of its runs or (no `run`) its latest. */
export interface Selection {
  item: string;
  run?: string;
}

/** A run's start, in milliseconds. */
const startOf = (s: TraceSummary): number => Date.parse(s.timestamp.start);
const latestFirst = (a: TraceSummary, b: TraceSummary): number => startOf(b) - startOf(a);

/**
 * A routine check rather than a decision: an automation whose every trigger is a `time_pattern` (a refresh every few
 * minutes), or a time-pattern run that found nothing to do.
 */
export function isNoise(summary: TraceSummary, config: AutomationConfig | null | undefined): boolean {
  const triggers = config ? (asList(config.triggers ?? config.trigger) as Record<string, unknown>[]) : [];
  if (triggers.length > 0 && triggers.every(t => triggerKind(t) === 'time_pattern')) return true;
  return /^time pattern/i.test(summary.trigger ?? '') && summary.script_execution === 'failed_conditions';
}

/** The noise rule with the configs bound, keyed by item id: the predicate `picks` and `todayRuns` take. */
export const noiseOf =
  (configs: Record<string, AutomationConfig | null | undefined>) =>
  (summary: TraceSummary): boolean =>
    isNoise(summary, configs[summary.item_id]);

/** The four runs the flow cards draw, each absent when there is none: what was picked, the latest running one, the last run stopped by a condition, the last finished one. */
export interface Picks {
  selected: TraceSummary | undefined;
  running: TraceSummary | undefined;
  decision: TraceSummary | undefined;
  completed: TraceSummary | undefined;
}

/**
 * The runs of the four flow cards. The last three leave the noise out; the selected run is found among every run, so a
 * routine check can still be drawn when it is picked.
 */
export function picks(list: TraceSummary[], selection: Selection | null, noise: (s: TraceSummary) => boolean): Picks {
  const kept = list.filter(s => !noise(s)).sort(latestFirst);
  const all = [...kept, ...list];
  const selected = !selection
    ? undefined
    : selection.run
      ? all.find(s => s.run_id === selection.run && s.item_id === selection.item)
      : all.filter(s => s.item_id === selection.item).sort(latestFirst)[0];
  return {
    selected,
    running: kept.find(s => s.state === 'running'),
    decision: kept.find(s => s.script_execution === 'failed_conditions'),
    completed: kept.find(s => s.state !== 'running' && s.script_execution !== 'failed_conditions'),
  };
}

/** One string that changes when an automation runs, starts, ends or is switched: a change asks for the runs again. */
export const fingerprint = (automations: Automation[]): string =>
  automations.map(a => `${a.entity}${a.last}${a.current}${a.on}`).join('|');

/** The runs since `midnight` that are not noise, the earliest first. */
export function todayRuns(list: TraceSummary[], midnight: number, noise: (s: TraceSummary) => boolean): TraceSummary[] {
  return list.filter(s => startOf(s) >= midnight && !noise(s)).sort((a, b) => startOf(a) - startOf(b));
}

/** How long a run has been going: `4:07` under an hour, `1 h 05` from an hour on; never negative. */
export function elapsedText(startMs: number, now: number): string {
  const s = Math.max(0, Math.round((now - startMs) / 1000));
  return s >= 3600
    ? `${Math.floor(s / 3600)} h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
