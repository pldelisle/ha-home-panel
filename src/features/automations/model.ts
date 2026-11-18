// automationsModel: what the Automations pane shows, from the automations' states and what the loader read: the line under the
// heading, the Today card (the timeline's dots and its tiles), the flow cards with their Mermaid definitions, and the list of every automation.
// Pattern: a view model (Fowler, Presentation Model) the pane places, the rules of the legacy `renderAuto()`, worded in the panel's
// language through the catalog, so French is the catalog's from the first paint.
// Must not: read the clock or the DOM (the time, the width and the theme's colours are passed in), load anything, or draw.
import type {AutomationConfig, Trace, TraceSummary} from '../../core/ha.ts';
import type {HassEntities} from '../../core/hass.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {Names} from '../../core/i18n/names.ts';
import {minutesOfDay, upcomingRuns, type Automation} from '../../providers/automations.ts';
import {sunNext} from '../../providers/sun.ts';
import {automationGraph} from './graph.ts';
import {toMermaid, type FlowTokens} from './mermaid-def.ts';
import {shortAlias} from './sentences.ts';
import {timelineLayout, isUp, type DotClass, type TimelineDot} from './timeline-layout.ts';
import {elapsedText, noiseOf, pickedRuns, todayRuns, type Selection, type TracesData} from './traces.ts';

export interface AutomationsInputs {
  automations: Automation[];
  states: HassEntities;
  now: number;
  /** The width the timeline is laid out for, in pixels. */
  width: number;
  /** The phone's layout: the flows run top to bottom. */
  compact: boolean;
  tokens: FlowTokens;
}

export interface AutomationsDeps {
  t: Translate;
  fmt: Formatters;
  names: Names;
}

/** One dot of the Today line, or several runs close together. */
export interface DotView {
  key: string;
  /** Its place on the line, in percent. */
  x: number;
  cls: DotClass;
  /** How many runs it stands for. */
  n: number;
  /** The label row, or -1 for none. */
  row: -1 | 0 | 1;
  label: string;
  description: string;
  /** The automation it selects, and the run (absent for one still to come). */
  item: string;
  run?: string;
}

export interface TileView {
  label: string;
  value: string;
  sub: string;
}

export interface TodayView {
  title: string;
  caption: string;
  status: string;
  nowPct: number;
  /** The hour marks of the line: where each sits (percent) and its label in the house's format. */
  hours: {pct: number; label: string}[];
  dots: DotView[];
  /** The four marks a dot takes, each with its words, drawn under the line as the flow's lines are. */
  legend: {mark: 'ran' | 'skip' | 'now' | 'up'; label: string}[];
  /** Ran today, Next, and Then: Then is left out when nothing follows Next. */
  tiles: TileView[];
}

export type CardKind = 'selected' | 'running' | 'decision' | 'completed';
export type StatusTone = 'plain' | 'warn' | 'bad' | 'ok';

export interface PickChip {
  run: string;
  label: string;
  sel: boolean;
  /** The colour token of its dot. */
  dot: 'warn' | 'crit' | 'ok';
}

export interface FlowCardView {
  /** The run's id, or `none:<item>` for an automation with no run stored. */
  key: string;
  kind: CardKind;
  item: string;
  /** The automation's name, which a sheet's heading says. */
  name: string;
  title: string;
  /** Null when its config could not be read: the card says so and draws nothing else. */
  flow: {
    sentence: string;
    status: {tone: StatusTone; text: string; since?: number};
    picker: PickChip[];
    def: string;
  } | null;
}

export interface AutomationRowView {
  item: string | undefined;
  name: string;
  sub: string;
  off: boolean;
  sel: boolean;
}

export interface AutomationsViewModel {
  sub: string;
  /** Nothing read yet: the loading line. */
  loading: boolean;
  /** Home Assistant refused the runs and none are held: the refusal's line. */
  refused: string | null;
  today: TodayView;
  cards: FlowCardView[];
  /** The line when no card has anything to draw. */
  empty: string | null;
  rows: AutomationRowView[];
}

const KIND: Record<CardKind, MessageKey> = {
  selected: 'automations.card.selected',
  running: 'automations.card.running',
  decision: 'automations.card.decision',
  completed: 'automations.card.completed',
};

/** The hours the Today line marks. */
const TIMELINE_HOURS = [0, 6, 12, 18];

const startOf = (s: TraceSummary): number => Date.parse(s.timestamp.start);

/** The running status's words: what the flow card writes again each second. */
export const runningText = (since: number, now: number, t: Translate): string =>
  t('automations.status.running', {elapsed: elapsedText(since, now, t)});

/** The line under the heading: what runs now, today's runs and how many are enabled. */
function subLine(
  automations: Automation[],
  list: TraceSummary[],
  runs: number,
  noise: (s: TraceSummary) => boolean,
  t: Translate,
): string {
  const running = list.filter(s => s.state === 'running' && !noise(s)).length;
  const off = automations.filter(a => !a.on).length;
  return [
    running ? t('automations.sub.running', {n: running}) : t('automations.sub.idle'),
    t('automations.sub.runsToday', {n: runs}),
    t('automations.sub.enabled', {n: automations.length - off}),
    ...(off ? [t('automations.sub.off', {n: off})] : []),
  ].join(' · ');
}

/** The word under a section in the phone's More list: how many run now, else how many there are. */
export function automationsBrief(automations: Automation[], t: Translate): string | null {
  const running = automations.filter(a => a.current).length;
  return running
    ? t('automations.sub.running', {n: running})
    : automations.length
      ? t('automations.count', {n: automations.length})
      : null;
}

function statusOf(
  run: TraceSummary | undefined,
  now: number,
  deps: AutomationsDeps,
): {tone: StatusTone; text: string; since?: number} {
  const {t, fmt} = deps;
  if (!run) return {tone: 'plain', text: t('automations.status.none')};
  const start = startOf(run);
  if (run.state === 'running') return {tone: 'warn', text: runningText(start, now, t), since: start};
  if (run.script_execution === 'failed_conditions')
    return {tone: 'bad', text: t('automations.status.stopped', {time: fmt.time(new Date(start))})};
  if (run.script_execution === 'error')
    return {tone: 'bad', text: t('automations.status.error', {time: fmt.time(new Date(start))})};
  const finish = run.timestamp.finish;
  return {
    tone: 'ok',
    text: t('automations.status.done', {time: finish ? fmt.timeSeconds(new Date(finish)) : fmt.time(new Date(start))}),
  };
}

export function automationsModel(
  inputs: AutomationsInputs,
  data: TracesData,
  selection: Selection | null,
  deps: AutomationsDeps,
): AutomationsViewModel {
  const {automations, states, now} = inputs;
  const {t, fmt} = deps;
  const list = (data.list ?? []).slice().sort((a, b) => startOf(a) - startOf(b));
  const noise = noiseOf(data.configs);
  const midnight = now - minutesOfDay(now, fmt) * 60000 - new Date(now).getSeconds() * 1000;
  const today = todayRuns(list, midnight, noise);
  const runs = today.filter(s => s.script_execution !== 'failed_conditions' && s.script_execution !== 'failed_single');
  const byItem = new Map(automations.filter(a => a.item).map(a => [a.item as string, a]));
  const loading = !data.list && !data.error;

  // the Today line: runs closer together than a dot is wide share one dot, with the count on it
  const up = upcomingRuns(data.configs, automations, now, sunNext(states), fmt);
  const dots: TimelineDot[] = [
    ...today.map(summary => ({
      summary,
      mins: minutesOfDay(summary.timestamp.start, fmt),
      item: summary.item_id,
      name: byItem.get(summary.item_id)?.name || summary.item_id,
    })),
    ...up.map(u => ({up: true as const, ...u})),
  ].sort((a, b) => a.mins - b.mins);
  const layout = timelineLayout(dots, inputs.width || 800, now, {t, fmt});
  const skipped = today.filter(s => s.script_execution === 'failed_conditions').length;
  const [next, then] = up;
  const todayView: TodayView = {
    title: t('automations.today.title'),
    caption: t('automations.today.caption'),
    status: `${fmt.dateWeekday(new Date(now))} · ${fmt.time(now)}`,
    nowPct: layout.nowPct,
    hours: TIMELINE_HOURS.map(h => ({pct: (h / 24) * 100, label: fmt.hourOfDay(h)})),
    dots: layout.groups.map((g, i) => {
      const d = g.dots[0];
      return {
        key: isUp(d) ? `up:${d.item}:${d.t}` : `${d.summary.run_id}:${i}`,
        x: g.x,
        cls: g.cls,
        n: g.dots.length,
        row: g.row,
        label: g.label,
        description: g.description,
        item: d.item,
        run: isUp(d) ? undefined : d.summary.run_id,
      };
    }),
    legend: [
      {mark: 'ran', label: t('automations.dots.ran')},
      {mark: 'skip', label: t('automations.dots.skipped')},
      {mark: 'now', label: t('automations.dots.now')},
      {mark: 'up', label: t('automations.dots.up')},
    ],
    tiles: [
      {
        label: t('automations.tile.ranToday'),
        value: String(runs.length),
        sub: skipped ? t('automations.tile.skipped', {n: skipped}) : t('automations.tile.allPassed'),
      },
      {
        label: t('automations.tile.next'),
        value: next ? fmt.time(new Date(next.t)) : t('automations.tile.none'),
        sub: next ? shortAlias(next.name) : t('automations.tile.nothingElse'),
      },
      ...(then
        ? [{label: t('automations.tile.then'), value: fmt.time(new Date(then.t)), sub: shortAlias(then.name)}]
        : []),
    ],
  };

  // the flow cards: the selected run (or the selected automation's shape), then running now, the last decision, the last completed
  const [sel, running, decision, completed] = pickedRuns(data, selection);
  const seen = new Set<string>();
  const cards: FlowCardView[] = [];
  const card = (run: TraceSummary | undefined, kind: CardKind, item?: string) => {
    const it = run ? run.item_id : item;
    if (!it) return;
    const key = run ? run.run_id : `none:${it}`;
    if (seen.has(key)) return;
    seen.add(key);
    const name = byItem.get(it)?.name ?? it;
    const title = `${t(KIND[kind])} · ${name}`;
    const trace: Trace | undefined = run && data.traces[`${it}/${run.run_id}`];
    // a trace carries the config it ran with, for an automation whose own could not be read
    const config = data.configs[it] || (trace?.config as AutomationConfig | undefined) || null;
    if (!config) {
      cards.push({key, kind, item: it, name, title, flow: null});
      return;
    }
    const graph = automationGraph(config, trace ?? null, run ?? null, {t, fmt, states, names: deps.names});
    const runsOf =
      kind === 'selected'
        ? (data.list ?? [])
            .filter(x => x.item_id === it)
            .sort((x, y) => startOf(y) - startOf(x))
            .slice(0, 8)
        : [];
    const day = fmt.isoDay(now);
    cards.push({
      key,
      kind,
      item: it,
      name,
      title,
      flow: {
        sentence: graph.sentence || (run ? '' : t('automations.card.shapeOnly')),
        status: statusOf(run, now, deps),
        picker:
          runsOf.length > 1
            ? runsOf.map(x => ({
                run: x.run_id,
                sel: !!run && x.run_id === run.run_id,
                dot:
                  x.state === 'running'
                    ? 'warn'
                    : x.script_execution === 'failed_conditions' || x.script_execution === 'error'
                      ? 'crit'
                      : 'ok',
                label: `${fmt.isoDay(startOf(x)) === day ? '' : `${fmt.date(new Date(x.timestamp.start))} `}${fmt.time(new Date(x.timestamp.start))}`,
              }))
            : [],
        def: toMermaid(graph, inputs.tokens, inputs.compact),
      },
    });
  };
  if (sel || selection) card(sel, 'selected', selection?.item);
  card(running, 'running');
  card(decision, 'decision');
  card(completed, 'completed');

  // every automation, the latest first
  const lastOf = (a: Automation) => (a.last ? Date.parse(a.last) : 0);
  const day = fmt.isoDay(now);
  const rows = automations
    .slice()
    .sort((x, y) => lastOf(y) - lastOf(x))
    .map(a => ({
      item: a.item,
      name: a.name,
      off: !a.on,
      sel: !!selection && selection.item === a.item,
      sub: !a.on
        ? t('automations.chip.off')
        : a.current
          ? t('automations.chip.running')
          : a.last
            ? fmt.isoDay(lastOf(a)) === day
              ? fmt.time(new Date(a.last))
              : fmt.date(new Date(a.last))
            : t('automations.chip.never'),
    }));

  return {
    sub: loading ? t('automations.count', {n: automations.length}) : subLine(automations, list, runs.length, noise, t),
    loading,
    refused: data.error && !data.list ? t('automations.refused', {error: data.error}) : null,
    today: todayView,
    cards,
    empty: cards.length ? null : t('automations.noRuns'),
    rows,
  };
}
