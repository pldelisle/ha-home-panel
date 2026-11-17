// An automation's flow as a graph: its config's triggers, conditions and actions folded with one run's trace into nodes
// and edges, each marked with what the run did there (taken, not taken, failed, waiting, stopped), and the run in a sentence.
// Pattern: a pure fold over Home Assistant's config and trace (Bernhardt, functional core), the legacy `auGraph()`; nodes are
// keyed by the trace's paths (`action/2/choose/0/sequence/1`), as the _Automation trace_ docs name them; a step's words come
// from sentences.ts, the gates' and the run's from `automations.graph.*` and `automations.sentence.*`.
// Must not: read the clock or the DOM, change the trace it is given, or write Mermaid (mermaid-def.ts does).
import {capitalWords} from '../../core/figures.ts';
import type {AutomationConfig, Trace, TraceStep, TraceSummary} from '../../core/ha.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {asList} from '../../providers/automations.ts';
import {
  actionText,
  conditionText,
  cut,
  durationText,
  joined,
  triggerText,
  type Sentence,
  type SentenceDeps,
} from './sentences.ts';

/** How a node is drawn: a trigger's stadium, a gate's circle, a decision's hexagon, a script's subroutine, the stop. */
export type NodeShape = 'round' | 'stadium' | 'circle' | 'diamond' | 'sub' | 'stop';
/** What the run did at a node: taken, not taken, failed, waiting there, and the stop node itself. */
export type NodeClass = 'hit' | 'off' | 'no' | 'run' | 'stopn';
/** What the run did along an edge. */
export type EdgeClass = 'on' | 'run' | 'stop' | 'off';

export interface GraphNode {
  id: string;
  /** The trace's path of the step, or `gate` and `stop` for the two nodes the panel adds. */
  path: string;
  /** The key of the small-caps word, null when there is none or the domain has no word. */
  kind: MessageKey | null;
  /** The small-caps word; empty for a gate or the stop. */
  k: string;
  /** The step's sentence. */
  label: string;
  /** The line under it: the time it ran, yes or no, an error, or that the run waits there; empty when there is none. */
  sub: string;
  shape: NodeShape;
  cls: NodeClass;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** A branch's word (`yes`, a choice's name, `again`); empty when there is none. */
  label: string;
  cls: EdgeClass;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The run in one sentence; empty when there is no run. */
  sentence: string;
  /** The run stopped at a check. */
  failed: boolean;
  /** The run waits at a step. */
  waiting: boolean;
}

type Config = Record<string, unknown>;
/** A step's result as the trace records it: a check's `result`, a choice's `choice`, a wait's `wait`. */
interface StepResult {
  result?: unknown;
  choice?: unknown;
  wait?: {completed?: unknown; trigger?: unknown};
}
/** A node while it is folded: what the edges and the stop still need to know of it. */
interface Folding extends GraphNode {
  visited: boolean;
  result: StepResult | null;
}
/** Where a path leaves a node: the node, the edge's label, and the branch it takes (`[node, choice]`, a loop or the stop). */
interface Exit {
  id: string;
  label?: string;
  when?: [string, string | number] | 'loop' | 'stop';
}
interface Link {
  a: string;
  b: string;
  label: string;
  when?: Exit['when'];
}

/** A node id Mermaid accepts, from a trace path: `action/0/choose/1` is `naction_0_choose_1`. */
const nodeId = (path: string): string => `n${path.replace(/[^a-z0-9]+/gi, '_')}`;

/**
 * The graph of `config` with the run `trace` (and its row of the list, `summary`) laid over it; with no trace, every step
 * is drawn as not taken and the sentence is empty.
 */
export function automationGraph(
  config: AutomationConfig,
  trace: Trace | null,
  summary: TraceSummary | null,
  deps: SentenceDeps,
): Graph {
  const {t, fmt} = deps;
  // a copy: the gate and a trigger the trace records only by index are added to it, and the caller's trace stays as it came
  const T: Record<string, TraceStep[]> = {...(trace?.trace ?? {})};
  const nodes: Folding[] = [],
    links: Link[] = [],
    byId: Record<string, Folding> = {};
  const hasStep = (p: string) => Object.hasOwn(T, p);
  const lastOf = (p: string): TraceStep | null => {
    const steps = T[p];
    return steps?.length ? steps[steps.length - 1] : null;
  };
  const running = summary?.state === 'running',
    lastStep = summary ? summary.last_step || trace?.last_step : undefined;

  const add = (path: string, words: Pick<Sentence, 'kind' | 'k' | 't'>, shape: NodeShape = 'round'): string => {
    const id = nodeId(path),
      step = lastOf(path),
      result = (step?.result ?? null) as StepResult | null,
      visited = hasStep(path);
    let cls: NodeClass = visited ? 'hit' : 'off',
      sub = '';
    if (visited && step?.timestamp) sub = fmt.timeSeconds(new Date(step.timestamp));
    if (visited && result?.result === false) {
      cls = 'no';
      sub = t('automations.graph.no');
    } else if (visited && result?.result === true) sub = t('automations.graph.yes');
    if (visited && step?.error) {
      cls = 'no';
      sub = cut(step.error, 40);
    }
    if (visited && result?.wait)
      sub =
        result.wait.completed === false || (result.wait.trigger === null && !result.wait.completed)
          ? t('automations.graph.timedOut')
          : t('automations.graph.done');
    if (running && lastStep === path) {
      cls = 'run';
      sub = step?.timestamp
        ? t('automations.graph.waitingSince', {time: fmt.time(new Date(step.timestamp))})
        : t('automations.graph.waiting');
    }
    const node: Folding = {id, path, kind: words.kind, k: words.k, label: words.t, sub, shape, cls, visited, result};
    byId[id] = node;
    nodes.push(node);
    return id;
  };
  const gateWords = (key: MessageKey) => ({kind: null, k: '', t: t(key)});
  const link = (a: string, b: string, label = '', when?: Exit['when']) => links.push({a, b, label, when});
  const chain = (from: Exit[], to: string) => {
    for (const x of from) link(x.id, to, x.label, x.when);
  };

  // the triggers, and the gate that joins them when there are several
  const triggers = asList(config.triggers || config.trigger) as Config[];
  let fired = Object.keys(T)
    .map(k => /^trigger\/(\d+)$/.exec(k))
    .filter(m => m !== null)
    .map(m => Number(m[1]));
  // an older trace keeps the trigger under `trigger` with its index in the variables
  const variables = T.trigger?.[0]?.changed_variables as {trigger?: {idx?: unknown}} | undefined;
  if (!fired.length && variables?.trigger?.idx != null) fired = [Number(variables.trigger.idx)];
  triggers.forEach((tr, i) => {
    const p = `trigger/${i}`;
    if (fired.includes(i) && !hasStep(p)) T[p] = [{timestamp: trace?.timestamp?.start}];
    add(p, triggerText(tr, deps), 'stadium');
  });
  let exits: Exit[];
  if (triggers.length > 1) {
    const gate = add('gate', gateWords('automations.graph.any'), 'circle');
    if (fired.length) {
      byId[gate].cls = 'hit';
      byId[gate].visited = true;
    }
    triggers.forEach((_, i) => link(nodeId(`trigger/${i}`), gate));
    exits = [{id: gate}];
  } else exits = triggers.length ? [{id: nodeId('trigger/0')}] : [];

  // the conditions: a chain, all must pass; an `or` of several splits and joins again, an `and` of several is a chain
  const conditionTree = (c: Config | string, path: string, from: Exit[]): Exit[] => {
    if (
      typeof c === 'object' &&
      (c.condition === 'or' || c.condition === 'and') &&
      !c.alias &&
      asList(c.conditions).length > 1
    ) {
      const parts = asList(c.conditions) as (Config | string)[];
      if (c.condition === 'and')
        return parts.reduce((prev, x, j) => conditionTree(x, `${path}/conditions/${j}`, prev), from);
      const gate = add(path, gateWords('automations.graph.anyOf'), 'circle');
      chain(from, gate);
      return parts.flatMap((x, j) => conditionTree(x, `${path}/conditions/${j}`, [{id: gate}]));
    }
    const id = add(path, conditionText(c, deps));
    chain(from, id);
    return [{id}];
  };
  (asList(config.conditions || config.condition) as (Config | string)[]).forEach((c, i) => {
    exits = conditionTree(c, `condition/${i}`, exits);
  });

  // the actions: a sequence; an `if` and a `choose` branch and join, a `repeat` loops back
  const sequence = (list: unknown, path: string, from: Exit[]): Exit[] =>
    (asList(list) as Config[]).reduce((prev, a, j) => step(a, `${path}/${j}`, prev), from);
  const checks = (list: unknown) =>
    joined(
      (asList(list) as (Config | string)[]).map(c => conditionText(c, deps).t),
      'automations.list.and',
      t,
    );
  const step = (a: Config, path: string, from: Exit[]): Exit[] => {
    if (a.if) {
      const id = add(
        path,
        {
          kind: 'automations.kind.if',
          k: t('automations.kind.if'),
          t: t('automations.graph.ifQuestion', {checks: checks(a.if)}),
        },
        'diamond',
      );
      chain(from, id);
      const then = sequence(a.then, `${path}/then`, [{id, label: t('automations.graph.yes'), when: [id, 'then']}]);
      const otherwise: Exit[] = a.else
        ? sequence(a.else, `${path}/else`, [{id, label: t('automations.graph.no'), when: [id, 'else']}])
        : [{id, label: t('automations.graph.no'), when: [id, 'else']}];
      // a visited `if` whose `then` never ran took its `else`, whether or not the trace says so
      if (byId[id].visited && byId[id].result?.choice == null && !hasStep(`${path}/then/0`))
        byId[id].result = {...byId[id].result, choice: 'else'};
      return [...then, ...otherwise];
    }
    if (a.choose) {
      const id = add(
        path,
        {kind: 'automations.kind.choose', k: t('automations.kind.choose'), t: t('automations.graph.whichCase')},
        'diamond',
      );
      chain(from, id);
      const outs = (asList(a.choose) as Config[]).flatMap((o, k) =>
        sequence(o.sequence, `${path}/choose/${k}/sequence`, [
          {id, label: cut(o.alias ? o.alias : checks(o.conditions), 34), when: [id, k]},
        ]),
      );
      outs.push(
        ...(a.default
          ? sequence(a.default, `${path}/default`, [
              {id, label: t('automations.graph.otherwise'), when: [id, 'default']},
            ])
          : [{id, label: t('automations.graph.none'), when: [id, 'default'] as Exit['when']}]),
      );
      return outs;
    }
    if (a.repeat) {
      const id = add(path, actionText(a, deps));
      chain(from, id);
      const body = sequence((a.repeat as Config).sequence, `${path}/repeat/sequence`, [{id}]);
      for (const x of body) link(x.id, id, t('automations.graph.again'), 'loop');
      return [{id}];
    }
    if (a.sequence && !a.action) return sequence(a.sequence, `${path}/sequence`, from);
    const words = actionText(a, deps);
    const id = add(path, words, words.shape ?? 'round');
    chain(from, id);
    return [{id}];
  };
  exits = sequence(config.actions || config.action, 'action', exits);

  // a failed check ends the run: the last one to fail, its own deepest, gets a STOP node after it
  const timeOf = (n: Folding) => {
    const s = lastOf(n.path);
    return s?.timestamp ? Date.parse(s.timestamp) : 0;
  };
  const failedCheck = nodes
    .filter(
      n =>
        n.cls === 'no' &&
        n.path.startsWith('condition') &&
        n.result?.result === false &&
        !nodes.some(m => m.path.startsWith(`${n.path}/`) && m.cls === 'no'),
    )
    .sort((x, y) => timeOf(y) - timeOf(x) || y.path.length - x.path.length)[0];
  const exec = summary?.script_execution;
  // the run ended at that check
  const stopped = !!failedCheck && exec === 'failed_conditions';
  if (stopped) {
    const stop = add('stop', gateWords('automations.graph.stop'), 'stop');
    byId[stop].cls = 'stopn';
    byId[stop].visited = true;
    link(failedCheck.id, stop, '', 'stop');
  }

  // what the run did along each edge: a branch is taken when its node chose it
  const taken = (when: Exit['when']): boolean => {
    if (!when || when === 'loop' || when === 'stop') return true;
    const [id, v] = when,
      c = byId[id].result?.choice;
    return v === 'default' || v === 'else'
      ? (c === v || c === 'default' || c === 'else' || c == null) &&
          byId[id].visited &&
          !(typeof c === 'number' || c === 'then')
      : String(c) === String(v);
  };
  const edges: GraphEdge[] = links.map(e => {
    const A = byId[e.a],
      B = byId[e.b];
    const cls: EdgeClass =
      e.when === 'stop'
        ? 'stop'
        : B.cls === 'run' && A.visited
          ? 'run'
          : A.visited && B.visited && A.cls !== 'no' && taken(e.when)
            ? 'on'
            : 'off';
    return {from: e.a, to: e.b, label: e.label, cls};
  });

  // the decision in one sentence
  const firedNode = nodes.find(n => n.path.startsWith('trigger/') && n.visited),
    waitNode = nodes.find(n => n.cls === 'run');
  const started = trace?.timestamp ? trace.timestamp.start : summary?.timestamp?.start;
  const ranSteps = nodes.filter(n => n.path.startsWith('action/') && n.visited && n.shape !== 'diamond').length;
  const parts: string[] = [];
  if (trace || summary) {
    const at = started ? fmt.time(new Date(started)) : '';
    if (firedNode?.kind === 'automations.kind.every')
      parts.push(
        at
          ? t('automations.sentence.everyAt', {what: firedNode.label, time: at})
          : t('automations.sentence.every', {what: firedNode.label}),
      );
    else if (firedNode?.kind === 'automations.kind.time')
      parts.push(t('automations.sentence.at', {what: firedNode.label}));
    else {
      const what = firedNode
        ? firedNode.label
        : summary?.trigger
          ? capitalWords(summary.trigger)
          : t('automations.sentence.started');
      parts.push(at ? t('automations.sentence.startedAt', {what, time: at}) : what);
    }
    if (stopped && failedCheck) parts.push(t('automations.sentence.stoppedAt', {check: cut(failedCheck.label, 60)}));
    else if (exec === 'failed_single' || exec === 'failed_max_runs') parts.push(t('automations.sentence.skipped'));
    else if (nodes.some(n => n.path.startsWith('condition/'))) parts.push(t('automations.sentence.checksPassed'));
    if (waitNode)
      parts.push(
        waitNode.kind === 'automations.kind.delay'
          ? t('automations.sentence.inDelay', {delay: waitNode.label.toLowerCase()})
          : t('automations.sentence.waiting', {step: cut(waitNode.label, 60).toLowerCase()}),
      );
    else if (exec === 'error')
      parts.push(
        summary?.error
          ? t('automations.sentence.errorWith', {message: cut(summary.error, 60)})
          : t('automations.sentence.error'),
      );
    else if (exec === 'finished' || exec === 'aborted' || exec === 'cancelled') {
      const finish = summary?.timestamp?.finish,
        d = finish && started ? (Date.parse(finish) - Date.parse(started)) / 1000 : null;
      const ran =
        d == null
          ? t('automations.sentence.ran', {n: ranSteps})
          : d < 1
            ? t('automations.sentence.ranAtOnce', {n: ranSteps})
            : t('automations.sentence.ranIn', {
                n: ranSteps,
                duration:
                  d < 60
                    ? t('automations.duration', {unit: 'seconds', n: fmt.integer(Math.round(d))})
                    : durationText(Math.round(d), deps),
              });
      parts.push(exec === 'finished' ? ran : t('automations.sentence.ended', {text: ran, how: exec}));
    }
  }
  return {
    nodes: nodes.map(({id, path, kind, k, label, sub, shape, cls}) => ({id, path, kind, k, label, sub, shape, cls})),
    edges,
    sentence: joined(parts, 'automations.list.then', t),
    failed: stopped,
    waiting: !!waitNode,
  };
}
