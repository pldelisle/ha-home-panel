// An automation's flow as a graph: every run of the trace fixtures folded over its config (the node classes, the subs, the
// edges and the sentence, checked against the legacy `auGraph` before #272 deleted it), and the shapes the fixtures do not
// have: the gates, an `if`, a `choose`, a `repeat`, a nested sequence, the stop, an older trace and each way a run ends.
// Pattern: example tests at the pure function over recorded shapes (ADR 0005; Meszaros, xUnit Test Patterns).
// Must not: read the clock, mount an element, or hold a real name (the made-up house and the made-up traces only).
import {readdirSync, readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import type {AutomationConfig, Trace, TraceSummary} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {automationGraph, type Graph} from '../../../../src/features/automations/graph.ts';
import type {SentenceDeps} from '../../../../src/features/automations/sentences.ts';
import * as full from '../../../houses/full.mjs';
import {fakeHass} from '../../fake-hass.ts';

const STATES = fakeHass.fromHouse(full).states;
const depsOf = (language: 'en' | 'fr'): SentenceDeps => ({
  t: createMessages({language, tag: `${language}-CA`}).t,
  fmt: createFormatters({
    ...englishLocale('America/Toronto'),
    hour12: language === 'en' ? true : undefined,
    language,
    tag: `${language}-CA`,
    numberLocale: `${language}-CA`,
  }),
  states: STATES,
  names: {name: key => String(STATES[key]?.attributes.friendly_name ?? key)},
});
const EN = depsOf('en');

/** A graph in one line per node (`id class sub`) and per edge (`from class to label`). */
const lines = (g: Graph) => ({
  sentence: g.sentence,
  failed: g.failed,
  waiting: g.waiting,
  nodes: g.nodes.map(n => `${n.id} ${n.cls} ${n.sub}`),
  edges: g.edges.map(e => `${e.from} ${e.cls} ${e.to}${e.label ? ` ${e.label}` : ''}`),
});

interface Fixture {
  config: AutomationConfig;
  list: TraceSummary[];
  traces: Record<string, Trace>;
}
const folder = new URL('../../fixtures/traces/', import.meta.url);
const FIXTURES = readdirSync(folder)
  .filter(f => f.endsWith('.json'))
  .map(f => [f, JSON.parse(readFileSync(new URL(f, folder), 'utf8')) as Fixture] as const);

const RUNS: Record<string, ReturnType<typeof lines>> = {
  'entrance_light_until_closed.json run_004': {
    sentence: 'Front opened at 1:47 pm → checks passed → now waiting: front closed, up to 10 min',
    failed: false,
    waiting: true,
    nodes: [
      'ntrigger_0 hit 1:47:31 pm',
      'ncondition_0 hit yes',
      'naction_0 hit 1:47:31 pm',
      'naction_1 run waiting here since 1:47 pm',
      'naction_2 off ',
    ],
    edges: [
      'ntrigger_0 on ncondition_0',
      'ncondition_0 on naction_0',
      'naction_0 run naction_1',
      'naction_1 off naction_2',
    ],
  },
  'heating_evening.json run_002': {
    sentence: 'At 6:00 pm → checks passed → 1 step ran at once',
    failed: false,
    waiting: false,
    nodes: ['ntrigger_0 hit 6:00:00 pm', 'ncondition_0 hit yes', 'naction_0 hit 6:00:00 pm'],
    edges: ['ntrigger_0 on ncondition_0', 'ncondition_0 on naction_0'],
  },
  'heating_evening.json run_003': {
    sentence: 'At 6:00 pm → stopped at “Heating away is off”',
    failed: true,
    waiting: false,
    nodes: ['ntrigger_0 hit 6:00:00 pm', 'ncondition_0 no no', 'naction_0 off ', 'nstop stopn '],
    edges: ['ntrigger_0 on ncondition_0', 'ncondition_0 off naction_0', 'ncondition_0 stop nstop'],
  },
  'heating_morning.json run_005': {
    sentence: 'At 6:00 am → 1 step ran at once',
    failed: false,
    waiting: false,
    nodes: [
      'ntrigger_0 hit 6:00:00 am',
      'ntrigger_1 off ',
      'ngate hit ',
      'naction_0 hit 6:00:00 am',
      'naction_0_choose_0_sequence_0 off ',
      'naction_0_choose_1_sequence_0 off ',
      'naction_0_default_0 hit 6:00:00 am',
    ],
    edges: [
      'ntrigger_0 on ngate',
      'ntrigger_1 off ngate',
      'ngate on naction_0',
      'naction_0 off naction_0_choose_0_sequence_0 Away',
      'naction_0 off naction_0_choose_1_sequence_0 Weekend',
      'naction_0 on naction_0_default_0 otherwise',
    ],
  },
  'lights_off_at_sunrise.json run_001': {
    sentence: 'Sunrise at 6:52 am → 1 step ran at once',
    failed: false,
    waiting: false,
    nodes: ['ntrigger_0 hit 6:52:04 am', 'naction_0 hit 6:52:04 am'],
    edges: ['ntrigger_0 on naction_0'],
  },
  'office_light_blink.json run_006': {
    sentence: 'Hall detects motion at 10:20 am → 3 steps ran in 4 s',
    failed: false,
    waiting: false,
    nodes: [
      'ntrigger_0 hit 10:20:44 am',
      'naction_0 hit 10:20:44 am',
      'naction_0_repeat_sequence_0 hit 10:20:48 am',
      'naction_0_repeat_sequence_1 hit 10:20:48 am',
    ],
    edges: [
      'ntrigger_0 on naction_0',
      'naction_0 on naction_0_repeat_sequence_0',
      'naction_0_repeat_sequence_0 on naction_0_repeat_sequence_1',
      'naction_0_repeat_sequence_1 on naction_0 again',
    ],
  },
  'purifier_night_speed.json run_007': {
    sentence: 'At 10:00 pm → error: Entity fan.office_purifier is unavailable',
    failed: false,
    waiting: false,
    nodes: ['ntrigger_0 hit 10:00:00 pm', 'naction_0 no Entity fan.office_purifier is unavailab…', 'naction_1 off '],
    edges: ['ntrigger_0 on naction_0', 'naction_0 off naction_1'],
  },
};

describe('every run of the trace fixtures', () => {
  const cases = FIXTURES.flatMap(([f, d]) => d.list.map(s => [`${f} ${s.run_id}`, d, s] as const));
  test('each run has its expected graph', () => expect(cases.map(([name]) => name)).toEqual(Object.keys(RUNS)));
  test.each(cases)('%s', (name, d, summary) => {
    const trace = d.traces[summary.run_id];
    const before = JSON.stringify(trace);
    expect(lines(automationGraph(d.config, trace, summary, EN))).toEqual(RUNS[name]);
    // the trace it is given stays as it came
    expect(JSON.stringify(trace)).toBe(before);
  });
  test('with no run, every step is not taken and there is no sentence', () => {
    const [, d] = FIXTURES[0];
    const g = automationGraph(d.config, null, null, EN);
    expect(g.sentence).toBe('');
    expect(g.nodes.every(n => n.cls === 'off' && n.sub === '')).toBe(true);
    expect(g.edges.every(e => e.cls === 'off')).toBe(true);
  });
});

// a config with every shape the fixtures lack: two triggers and their gate, an `or` and an `and` of checks, an `if` with and
// without `else`, a `choose` with and without `default`, a `repeat`, a nested `sequence`
const CONFIG: AutomationConfig = {
  triggers: [
    {trigger: 'state', entity_id: 'binary_sensor.front_door', to: 'on'},
    {trigger: 'time_pattern', minutes: '/5'},
  ],
  conditions: [
    {condition: 'or', conditions: [{condition: 'state', entity_id: 'light.kitchen_sink', state: 'on'}, '{{ x }}']},
    {condition: 'and', conditions: [{condition: 'state', entity_id: 'light.kitchen_island', state: 'on'}, '{{ y }}']},
  ],
  actions: [
    {if: [{condition: 'state', entity_id: 'light.kitchen_sink', state: 'on'}], then: [{delay: 5}], else: [{delay: 10}]},
    {if: '{{ z }}', then: [{delay: 5}]},
    {
      choose: [
        {alias: 'Evening', conditions: [], sequence: [{action: 'script.bed'}]},
        {conditions: [{condition: 'state', entity_id: 'light.kitchen_sink', state: 'on'}], sequence: [{delay: 1}]},
      ],
      default: [{stop: 'Done'}],
    },
    {choose: [{conditions: '{{ w }}', sequence: []}]},
    {repeat: {count: 3, sequence: [{wait_template: '{{ v }}', timeout: 30}]}},
    {sequence: [{event: 'x'}]},
  ],
};
const at = (s: number) => `2026-11-07T12:00:${String(s).padStart(2, '0')}Z`;
const TRACE: Trace = {
  timestamp: {start: at(0)},
  trace: {
    'trigger/1': [{timestamp: at(0)}],
    'condition/0': [{timestamp: at(1), result: {result: true}}],
    'condition/0/conditions/0': [{timestamp: at(1), result: {result: true}}],
    'condition/1': [{timestamp: at(1), result: {result: true}}],
    'action/0': [{timestamp: at(2), result: {choice: 'then'}}],
    'action/0/then/0': [{timestamp: at(2)}],
    'action/1': [{timestamp: at(3), result: {result: false}}],
    'action/2': [{timestamp: at(4), result: {choice: 0}}],
    'action/2/choose/0/sequence/0': [{timestamp: at(4)}],
    'action/3': [{timestamp: at(5)}],
    'action/4': [{timestamp: at(6)}],
    'action/4/repeat/sequence/0': [{timestamp: at(7), result: {wait: {completed: true}}}],
    'action/5/sequence/0': [{timestamp: at(8)}],
  },
};
const SUMMARY: TraceSummary = {
  item_id: 'x',
  run_id: 'y',
  state: 'stopped',
  script_execution: 'finished',
  trigger: 'time pattern',
  timestamp: {start: at(0), finish: '2026-11-07T12:01:30Z'},
};
const FAILED: Trace = {
  timestamp: {start: at(0)},
  trace: {
    'trigger/0': [{timestamp: at(0)}],
    'condition/0': [{timestamp: at(1), result: {result: false}}],
    'condition/0/conditions/0': [{timestamp: at(1), result: {result: false}}],
    'condition/0/conditions/1': [{timestamp: at(1), result: {result: false}}],
  },
};
const WAITING: Trace = {
  timestamp: {start: at(0)},
  trace: {...TRACE.trace, 'action/4/repeat/sequence/0': [{timestamp: at(7), result: {wait: {completed: false}}}]},
  last_step: 'action/4/repeat/sequence/0',
};
const SHAPES: [string, AutomationConfig, Trace | null, TraceSummary | null][] = [
  ['a run through every shape', CONFIG, TRACE, SUMMARY],
  ['a run stopped by its first check', CONFIG, FAILED, {...SUMMARY, script_execution: 'failed_conditions'}],
  [
    'a run waiting in its repeat',
    CONFIG,
    WAITING,
    {...SUMMARY, state: 'running', script_execution: 'running', last_step: undefined},
  ],
  [
    'a run in a delay',
    {triggers: [{trigger: 'time', at: '07:00:00'}], actions: [{delay: {minutes: 5}}]},
    {timestamp: {start: at(0)}, trace: {'trigger/0': [{timestamp: at(0)}], 'action/0': [{}]}},
    {...SUMMARY, state: 'running', script_execution: 'running', last_step: 'action/0'},
  ],
  [
    'an older trace, its trigger by index',
    {
      triggers: [
        {trigger: 'sun', event: 'sunset'},
        {trigger: 'time', at: '10:00'},
      ],
      actions: [{delay: 5}],
    },
    {
      timestamp: {start: at(0)},
      trace: {trigger: [{changed_variables: {trigger: {idx: '1'}}}], 'action/0': [{timestamp: at(2)}]},
    },
    null,
  ],
  ['a run skipped', CONFIG, {trace: {}}, {...SUMMARY, script_execution: 'failed_single', timestamp: {start: at(0)}}],
  [
    'a run with an error and no message',
    {triggers: [], actions: [{delay: 5}]},
    null,
    {...SUMMARY, script_execution: 'error', trigger: undefined, timestamp: undefined},
  ],
  [
    'an aborted run of 2 minutes',
    {triggers: [{trigger: 'state', entity_id: 'light.kitchen_sink'}], actions: [{delay: 5}]},
    {
      timestamp: {start: at(0)},
      trace: {'trigger/0': [{timestamp: at(0)}], 'action/0': [{timestamp: at(1), error: 'Lost'}]},
    },
    {...SUMMARY, script_execution: 'aborted', timestamp: {start: at(0), finish: '2026-11-07T12:02:00Z'}},
  ],
  [
    'a cancelled run with no finish',
    {triggers: [{trigger: 'state', entity_id: 'light.kitchen_sink'}], actions: [{delay: 5}]},
    null,
    {...SUMMARY, script_execution: 'cancelled', trigger: 'state of x', timestamp: {start: at(0)}},
  ],
];

const SHAPED: Record<string, ReturnType<typeof lines>> = {
  'a run through every shape': {
    sentence: 'Every 5 min, at 7:00 am → checks passed → 5 steps ran in 2 min',
    failed: false,
    waiting: false,
    nodes: [
      'ntrigger_0 off ',
      'ntrigger_1 hit 7:00:00 am',
      'ngate hit ',
      'ncondition_0 hit yes',
      'ncondition_0_conditions_0 hit yes',
      'ncondition_0_conditions_1 off ',
      'ncondition_1_conditions_0 off ',
      'ncondition_1_conditions_1 off ',
      'naction_0 hit 7:00:02 am',
      'naction_0_then_0 hit 7:00:02 am',
      'naction_0_else_0 off ',
      'naction_1 no no',
      'naction_1_then_0 off ',
      'naction_2 hit 7:00:04 am',
      'naction_2_choose_0_sequence_0 hit 7:00:04 am',
      'naction_2_choose_1_sequence_0 off ',
      'naction_2_default_0 off ',
      'naction_3 hit 7:00:05 am',
      'naction_4 hit 7:00:06 am',
      'naction_4_repeat_sequence_0 hit done',
      'naction_5_sequence_0 hit 7:00:08 am',
    ],
    edges: [
      'ntrigger_0 off ngate',
      'ntrigger_1 on ngate',
      'ngate on ncondition_0',
      'ncondition_0 on ncondition_0_conditions_0',
      'ncondition_0 off ncondition_0_conditions_1',
      'ncondition_0_conditions_0 off ncondition_1_conditions_0',
      'ncondition_0_conditions_1 off ncondition_1_conditions_0',
      'ncondition_1_conditions_0 off ncondition_1_conditions_1',
      'ncondition_1_conditions_1 off naction_0',
      'naction_0 on naction_0_then_0 yes',
      'naction_0 off naction_0_else_0 no',
      'naction_0_then_0 on naction_1',
      'naction_0_else_0 off naction_1',
      'naction_1 off naction_1_then_0 yes',
      'naction_1_then_0 off naction_2',
      'naction_1 off naction_2 no',
      'naction_2 on naction_2_choose_0_sequence_0 Evening',
      'naction_2 off naction_2_choose_1_sequence_0 Kitchen Sink is on',
      'naction_2 off naction_2_default_0 otherwise',
      'naction_2_choose_0_sequence_0 on naction_3',
      'naction_2_choose_1_sequence_0 off naction_3',
      'naction_2_default_0 off naction_3',
      'naction_3 off naction_4 w',
      'naction_3 on naction_4 none',
      'naction_4 on naction_4_repeat_sequence_0',
      'naction_4_repeat_sequence_0 on naction_4 again',
      'naction_4 on naction_5_sequence_0',
    ],
  },
  'a run stopped by its first check': {
    sentence: 'Front opened at 7:00 am → stopped at “Kitchen Sink is on”',
    failed: true,
    waiting: false,
    nodes: [
      'ntrigger_0 hit 7:00:00 am',
      'ntrigger_1 off ',
      'ngate hit ',
      'ncondition_0 no no',
      'ncondition_0_conditions_0 no no',
      'ncondition_0_conditions_1 no no',
      'ncondition_1_conditions_0 off ',
      'ncondition_1_conditions_1 off ',
      'naction_0 off ',
      'naction_0_then_0 off ',
      'naction_0_else_0 off ',
      'naction_1 off ',
      'naction_1_then_0 off ',
      'naction_2 off ',
      'naction_2_choose_0_sequence_0 off ',
      'naction_2_choose_1_sequence_0 off ',
      'naction_2_default_0 off ',
      'naction_3 off ',
      'naction_4 off ',
      'naction_4_repeat_sequence_0 off ',
      'naction_5_sequence_0 off ',
      'nstop stopn ',
    ],
    edges: [
      'ntrigger_0 on ngate',
      'ntrigger_1 off ngate',
      'ngate on ncondition_0',
      'ncondition_0 off ncondition_0_conditions_0',
      'ncondition_0 off ncondition_0_conditions_1',
      'ncondition_0_conditions_0 off ncondition_1_conditions_0',
      'ncondition_0_conditions_1 off ncondition_1_conditions_0',
      'ncondition_1_conditions_0 off ncondition_1_conditions_1',
      'ncondition_1_conditions_1 off naction_0',
      'naction_0 off naction_0_then_0 yes',
      'naction_0 off naction_0_else_0 no',
      'naction_0_then_0 off naction_1',
      'naction_0_else_0 off naction_1',
      'naction_1 off naction_1_then_0 yes',
      'naction_1_then_0 off naction_2',
      'naction_1 off naction_2 no',
      'naction_2 off naction_2_choose_0_sequence_0 Evening',
      'naction_2 off naction_2_choose_1_sequence_0 Kitchen Sink is on',
      'naction_2 off naction_2_default_0 otherwise',
      'naction_2_choose_0_sequence_0 off naction_3',
      'naction_2_choose_1_sequence_0 off naction_3',
      'naction_2_default_0 off naction_3',
      'naction_3 off naction_4 w',
      'naction_3 off naction_4 none',
      'naction_4 off naction_4_repeat_sequence_0',
      'naction_4_repeat_sequence_0 off naction_4 again',
      'naction_4 off naction_5_sequence_0',
      'ncondition_0_conditions_0 stop nstop',
    ],
  },
  'a run waiting in its repeat': {
    sentence: 'Every 5 min, at 7:00 am → checks passed → now waiting: until v, up to 30 s',
    failed: false,
    waiting: true,
    nodes: [
      'ntrigger_0 off ',
      'ntrigger_1 hit 7:00:00 am',
      'ngate hit ',
      'ncondition_0 hit yes',
      'ncondition_0_conditions_0 hit yes',
      'ncondition_0_conditions_1 off ',
      'ncondition_1_conditions_0 off ',
      'ncondition_1_conditions_1 off ',
      'naction_0 hit 7:00:02 am',
      'naction_0_then_0 hit 7:00:02 am',
      'naction_0_else_0 off ',
      'naction_1 no no',
      'naction_1_then_0 off ',
      'naction_2 hit 7:00:04 am',
      'naction_2_choose_0_sequence_0 hit 7:00:04 am',
      'naction_2_choose_1_sequence_0 off ',
      'naction_2_default_0 off ',
      'naction_3 hit 7:00:05 am',
      'naction_4 hit 7:00:06 am',
      'naction_4_repeat_sequence_0 run waiting here since 7:00 am',
      'naction_5_sequence_0 hit 7:00:08 am',
    ],
    edges: [
      'ntrigger_0 off ngate',
      'ntrigger_1 on ngate',
      'ngate on ncondition_0',
      'ncondition_0 on ncondition_0_conditions_0',
      'ncondition_0 off ncondition_0_conditions_1',
      'ncondition_0_conditions_0 off ncondition_1_conditions_0',
      'ncondition_0_conditions_1 off ncondition_1_conditions_0',
      'ncondition_1_conditions_0 off ncondition_1_conditions_1',
      'ncondition_1_conditions_1 off naction_0',
      'naction_0 on naction_0_then_0 yes',
      'naction_0 off naction_0_else_0 no',
      'naction_0_then_0 on naction_1',
      'naction_0_else_0 off naction_1',
      'naction_1 off naction_1_then_0 yes',
      'naction_1_then_0 off naction_2',
      'naction_1 off naction_2 no',
      'naction_2 on naction_2_choose_0_sequence_0 Evening',
      'naction_2 off naction_2_choose_1_sequence_0 Kitchen Sink is on',
      'naction_2 off naction_2_default_0 otherwise',
      'naction_2_choose_0_sequence_0 on naction_3',
      'naction_2_choose_1_sequence_0 off naction_3',
      'naction_2_default_0 off naction_3',
      'naction_3 off naction_4 w',
      'naction_3 on naction_4 none',
      'naction_4 run naction_4_repeat_sequence_0',
      'naction_4_repeat_sequence_0 on naction_4 again',
      'naction_4 on naction_5_sequence_0',
    ],
  },
  'a run in a delay': {
    sentence: 'At 7:00 am → now in a wait 5 min',
    failed: false,
    waiting: true,
    nodes: ['ntrigger_0 hit 7:00:00 am', 'naction_0 run waiting here'],
    edges: ['ntrigger_0 run naction_0'],
  },
  'an older trace, its trigger by index': {
    sentence: 'At 10:00 am',
    failed: false,
    waiting: false,
    nodes: ['ntrigger_0 off ', 'ntrigger_1 hit 7:00:00 am', 'ngate hit ', 'naction_0 hit 7:00:02 am'],
    edges: ['ntrigger_0 off ngate', 'ntrigger_1 on ngate', 'ngate on naction_0'],
  },
  'a run skipped': {
    sentence: 'Time pattern at 7:00 am → skipped, it was already running',
    failed: false,
    waiting: false,
    nodes: [
      'ntrigger_0 off ',
      'ntrigger_1 off ',
      'ngate off ',
      'ncondition_0 off ',
      'ncondition_0_conditions_0 off ',
      'ncondition_0_conditions_1 off ',
      'ncondition_1_conditions_0 off ',
      'ncondition_1_conditions_1 off ',
      'naction_0 off ',
      'naction_0_then_0 off ',
      'naction_0_else_0 off ',
      'naction_1 off ',
      'naction_1_then_0 off ',
      'naction_2 off ',
      'naction_2_choose_0_sequence_0 off ',
      'naction_2_choose_1_sequence_0 off ',
      'naction_2_default_0 off ',
      'naction_3 off ',
      'naction_4 off ',
      'naction_4_repeat_sequence_0 off ',
      'naction_5_sequence_0 off ',
    ],
    edges: [
      'ntrigger_0 off ngate',
      'ntrigger_1 off ngate',
      'ngate off ncondition_0',
      'ncondition_0 off ncondition_0_conditions_0',
      'ncondition_0 off ncondition_0_conditions_1',
      'ncondition_0_conditions_0 off ncondition_1_conditions_0',
      'ncondition_0_conditions_1 off ncondition_1_conditions_0',
      'ncondition_1_conditions_0 off ncondition_1_conditions_1',
      'ncondition_1_conditions_1 off naction_0',
      'naction_0 off naction_0_then_0 yes',
      'naction_0 off naction_0_else_0 no',
      'naction_0_then_0 off naction_1',
      'naction_0_else_0 off naction_1',
      'naction_1 off naction_1_then_0 yes',
      'naction_1_then_0 off naction_2',
      'naction_1 off naction_2 no',
      'naction_2 off naction_2_choose_0_sequence_0 Evening',
      'naction_2 off naction_2_choose_1_sequence_0 Kitchen Sink is on',
      'naction_2 off naction_2_default_0 otherwise',
      'naction_2_choose_0_sequence_0 off naction_3',
      'naction_2_choose_1_sequence_0 off naction_3',
      'naction_2_default_0 off naction_3',
      'naction_3 off naction_4 w',
      'naction_3 off naction_4 none',
      'naction_4 off naction_4_repeat_sequence_0',
      'naction_4_repeat_sequence_0 off naction_4 again',
      'naction_4 off naction_5_sequence_0',
    ],
  },
  'a run with an error and no message': {
    sentence: 'Started → error',
    failed: false,
    waiting: false,
    nodes: ['naction_0 off '],
    edges: [],
  },
  'an aborted run of 2 minutes': {
    sentence: 'Kitchen Sink changes at 7:00 am → 1 step ran in 2 min (aborted)',
    failed: false,
    waiting: false,
    nodes: ['ntrigger_0 hit 7:00:00 am', 'naction_0 no Lost'],
    edges: ['ntrigger_0 on naction_0'],
  },
  'a cancelled run with no finish': {
    sentence: 'State of x at 7:00 am → 0 steps ran (cancelled)',
    failed: false,
    waiting: false,
    nodes: ['ntrigger_0 off ', 'naction_0 off '],
    edges: ['ntrigger_0 off naction_0'],
  },
};

describe('the shapes and the ends of a run', () => {
  test.each(SHAPES)('%s', (name, config, trace, summary) =>
    expect(lines(automationGraph(config, trace, summary, EN))).toEqual(SHAPED[name]),
  );
  test('the node words and shapes: a stadium per trigger, a circle per gate, a hexagon per decision, the stop', () => {
    const g = automationGraph(CONFIG, SHAPES[1][2], SHAPES[1][3], EN);
    const of = (id: string) => g.nodes.find(n => n.id === id);
    expect(
      [of('ntrigger_0'), of('ngate'), of('naction_0'), of('naction_2'), of('nstop')].map(n => [
        n?.shape,
        n?.k,
        n?.label,
      ]),
    ).toEqual([
      ['stadium', 'Door', 'Front opened'],
      ['circle', '', 'Any'],
      ['diamond', 'If', 'Kitchen Sink is on?'],
      ['diamond', 'Choose', 'Which case?'],
      ['stop', '', 'Stop'],
    ]);
    expect(of('ncondition_0')?.label).toBe('Any of');
  });
  test('a choose that took its default lights the default and leaves its options dark', () => {
    const config: AutomationConfig = {
      triggers: [{trigger: 'time', at: '07:00:00'}],
      actions: [{choose: [{conditions: '{{ a }}', sequence: [{delay: 1}]}], default: [{delay: 2}]}],
    };
    const trace: Trace = {
      timestamp: {start: at(0)},
      trace: {
        'trigger/0': [{timestamp: at(0)}],
        'action/0': [{timestamp: at(1), result: {choice: 'default'}}],
        'action/0/default/0': [{timestamp: at(2)}],
      },
    };
    expect(lines(automationGraph(config, trace, SUMMARY, EN)).edges).toEqual([
      'ntrigger_0 on naction_0',
      'naction_0 off naction_0_choose_0_sequence_0 a',
      'naction_0 on naction_0_default_0 otherwise',
    ]);
  });
  test('in French', () => {
    const g = automationGraph(CONFIG, SHAPES[1][2], SHAPES[1][3], depsOf('fr'));
    expect(g.sentence).toBe('Front s’ouvre à 7 h → arrêtée à «\u00a0Kitchen Sink est on\u00a0»');
    // the step times are 24-hour in French, with their seconds
    expect(g.nodes.find(n => n.id === 'ntrigger_0')?.sub).toBe('7 h 00 min 00 s');
  });
});
