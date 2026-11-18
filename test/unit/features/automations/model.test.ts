// What the Automations pane shows: the line under the heading while loading, refused or read; the Today card's tiles and dots; the
// four flow cards with their statuses, the selected one's picker and the shape-only sentence; the rows of the list; the More word; the ids.
// Pattern: example tests at the pure view model (ADR 0005), over literal `trace/list` rows and configs at a fixed instant.
// Must not: read the clock (every instant is a literal), the DOM or Home Assistant.
import {describe, expect, test} from 'vitest';
import type {AutomationConfig, TraceSummary} from '../../../../src/core/ha.ts';
import type {HassEntities} from '../../../../src/core/hass.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {automationIds} from '../../../../src/features/automations/ids.ts';
import type {TracesData} from '../../../../src/features/automations/traces.ts';
import {automationsBrief, automationsModel, runningText} from '../../../../src/features/automations/model.ts';
import type {Automation} from '../../../../src/providers/automations.ts';

const t = createMessages({language: 'en', tag: 'en-CA'}).t;
const deps = {t, fmt: createFormatters(englishLocale('UTC')), names: {name: (k: string) => k}};
const frenchUtc = {...englishLocale('UTC'), language: 'fr', tag: 'fr-CA', hour12: undefined, numberLocale: 'fr-CA'};
const NOW = Date.parse('2026-11-07T12:00:00Z');
const TOKENS = {
  ok: '#0a0',
  crit: '#a00',
  warn: '#aa0',
  card: '#fff',
  ring: '#ccc',
  fg: '#000',
  fg3: '#888',
  line: '#ddd',
};
const inputs = (automations: Automation[], states: HassEntities = {}) => ({
  automations,
  states,
  now: NOW,
  width: 800,
  compact: false,
  tokens: TOKENS,
});
const auto = (item: string | undefined, more: Partial<Automation> = {}): Automation => ({
  entity: `automation.${item ?? 'x'}`,
  item,
  name: `Auto ${item}`,
  on: true,
  last: null,
  current: 0,
  ...more,
});
const run = (item: string, id: string, start: string, more: Partial<TraceSummary> = {}): TraceSummary => ({
  item_id: item,
  run_id: id,
  timestamp: {start},
  state: 'stopped',
  script_execution: 'finished',
  ...more,
});
const lamp: AutomationConfig = {
  id: 'a',
  triggers: [{trigger: 'time', at: ['13:00:00', '15:30:00']}],
  actions: [{action: 'light.turn_on', target: {entity_id: 'light.x'}}],
};
const data = (more: Partial<TracesData> = {}): TracesData => ({
  list: [],
  error: null,
  configs: {},
  traces: {},
  ...more,
});

describe('automationsModel: the line under the heading', () => {
  test('while nothing is read, the loading line and how many automations there are', () => {
    const view = automationsModel(inputs([auto('a'), auto('b')]), data({list: null}), null, deps);
    expect([view.loading, view.sub, view.refused]).toEqual([true, '2 automations', null]);
  });
  test('refused with no list held: the refusal with its reason; with a list held, the list', () => {
    expect(automationsModel(inputs([]), data({list: null, error: 'unauthorized'}), null, deps).refused).toBe(
      "Home Assistant didn't return the automation traces (unauthorized). The panel needs an administrator account to read them.",
    );
    expect(automationsModel(inputs([]), data({error: 'unauthorized'}), null, deps).refused).toBeNull();
  });
  test('what runs now, the runs today (a stopped check is not one) and how many are on and off', () => {
    const list = [
      run('a', 'r1', '2026-11-07T08:00:00Z'),
      run('a', 'r2', '2026-11-07T09:00:00Z', {script_execution: 'failed_conditions'}),
      run('a', 'r3', '2026-11-07T11:59:00Z', {state: 'running', script_execution: undefined}),
      run('a', 'r0', '2026-11-06T08:00:00Z'),
    ];
    const view = automationsModel(inputs([auto('a'), auto('b', {on: false})]), data({list}), null, deps);
    expect(view.sub).toBe('1 running · 2 runs today · 1 enabled · 1 off');
    expect(automationsModel(inputs([auto('a')]), data(), null, deps).sub).toBe(
      'nothing running · 0 runs today · 1 enabled',
    );
  });
});

describe('automationsModel: the Today card', () => {
  test('the runs and the runs still to come as dots, the tiles from them', () => {
    const list = [
      run('a', 'r1', '2026-11-07T08:00:00Z'),
      run('a', 'r2', '2026-11-07T10:00:00Z', {script_execution: 'failed_conditions'}),
    ];
    const view = automationsModel(inputs([auto('a')]), data({list, configs: {a: lamp}}), null, deps);
    expect(view.today.dots.map(d => [d.cls, d.item, d.run])).toEqual([
      ['', 'a', 'r1'],
      ['skip', 'a', 'r2'],
      ['up', 'a', undefined],
      ['up', 'a', undefined],
    ]);
    expect(view.today.tiles).toEqual([
      {label: 'Ran today', value: '1', sub: '1 more checked and did nothing'},
      {label: 'Next', value: '1:00 pm', sub: 'Auto a'},
      {label: 'Then', value: '3:30 pm', sub: 'Auto a'},
    ]);
    expect(view.today.status).toMatch(/ · 12:00 pm$/);
  });
  test('the hour marks of the line and the status follow the house format, in English and in French', () => {
    const en = automationsModel(inputs([auto('a')]), data(), null, deps).today;
    expect(en.hours).toEqual([
      {pct: 0, label: '12 am'},
      {pct: 25, label: '6 am'},
      {pct: 50, label: '12 pm'},
      {pct: 75, label: '6 pm'},
    ]);
    const fr = {...deps, t: createMessages({language: 'fr', tag: 'fr-CA'}).t, fmt: createFormatters(frenchUtc)};
    const done = run('a', 'r1', '2026-11-07T08:05:00Z', {
      timestamp: {start: '2026-11-07T08:05:00Z', finish: '2026-11-07T08:05:09Z'},
    });
    const view = automationsModel(
      inputs([auto('a', {last: '2026-11-07T08:05:00Z'})]),
      data({list: [done], configs: {a: lamp}}),
      null,
      fr,
    );
    expect(view.today.hours.map(h => h.label)).toEqual(['0 h', '6 h', '12 h', '18 h']);
    expect(view.today.status).toMatch(/ · 12 h$/);
    expect(view.today.tiles.slice(1).map(x => x.value)).toEqual(['13 h', '15 h 30']);
    expect(view.cards[0].flow?.status.text).toBe('terminée 8 h 05 min 09 s');
    expect(view.rows[0].sub).toBe('8 h 05');
  });
  test('nothing to come: dashes, and every run passed its checks', () => {
    const view = automationsModel(inputs([auto('a')]), data(), null, deps);
    expect(view.today.tiles.map(x => [x.value, x.sub])).toEqual([
      ['0', 'every run passed its checks'],
      ['–', 'nothing else scheduled today'],
      ['–', '—'],
    ]);
  });
});

describe('automationsModel: the flow cards', () => {
  const list = [
    run('a', 'done', '2026-11-07T08:00:00Z', {
      timestamp: {start: '2026-11-07T08:00:00Z', finish: '2026-11-07T08:00:05Z'},
    }),
    run('a', 'stop', '2026-11-07T09:00:00Z', {script_execution: 'failed_conditions'}),
    run('a', 'now', '2026-11-07T11:58:00Z', {state: 'running', script_execution: undefined}),
    run('a', 'err', '2026-11-06T10:00:00Z', {script_execution: 'error'}),
  ];
  test('running now, the last decision and the last completed, each with its status and a definition', () => {
    const view = automationsModel(inputs([auto('a')]), data({list, configs: {a: lamp}}), null, deps);
    expect(view.cards.map(c => [c.kind, c.key, c.title, c.flow?.status])).toEqual([
      [
        'running',
        'now',
        'Running now · Auto a',
        {tone: 'warn', text: 'running 2:00', since: Date.parse('2026-11-07T11:58:00Z')},
      ],
      ['decision', 'stop', 'Last decision · Auto a', {tone: 'bad', text: 'stopped 9:00 am'}],
      ['completed', 'done', 'Last completed · Auto a', {tone: 'ok', text: 'done 8:00:05 am'}],
    ]);
    expect(view.cards[0].flow?.def).toMatch(/^flowchart LR/);
    expect(view.empty).toBeNull();
  });
  test('a selected run first, with the picker of its automation’s runs (another day’s with its date) and an error’s status', () => {
    const view = automationsModel(inputs([auto('a')]), data({list, configs: {a: lamp}}), {item: 'a', run: 'err'}, deps);
    const [selected] = view.cards;
    expect([selected.kind, selected.flow?.status]).toEqual(['selected', {tone: 'bad', text: 'error 10:00 am'}]);
    expect(selected.flow?.picker.map(c => [c.run, c.sel, c.dot, c.label])).toEqual([
      ['now', false, 'warn', '11:58 am'],
      ['stop', false, 'crit', '9:00 am'],
      ['done', false, 'ok', '8:00 am'],
      ['err', true, 'crit', 'Nov 6 10:00 am'],
    ]);
    // a finished run without its finish says its start
    const plain = automationsModel(
      inputs([auto('a')]),
      data({list: [run('a', 'p', '2026-11-07T07:00:00Z')], configs: {a: lamp}}),
      null,
      deps,
    );
    expect(plain.cards[0].flow?.status).toEqual({tone: 'ok', text: 'done 7:00 am'});
  });
  test('a run is drawn once: the selected running run is not drawn again as running now', () => {
    const view = automationsModel(inputs([auto('a')]), data({list, configs: {a: lamp}}), {item: 'a', run: 'now'}, deps);
    expect(view.cards.map(c => [c.kind, c.key])).toEqual([
      ['selected', 'now'],
      ['decision', 'stop'],
      ['completed', 'done'],
    ]);
  });
  test('before the column is measured, the line is laid out for 800 pixels', () => {
    const at = (width: number) =>
      automationsModel({...inputs([auto('a')]), width}, data({configs: {a: lamp}}), null, deps).today.dots;
    expect(at(0)).toEqual(at(800));
  });
  test('an automation picked with no run stored: its shape; one whose config could not be read: says so', () => {
    const shape = automationsModel(inputs([auto('a')]), data({configs: {a: lamp}}), {item: 'a'}, deps);
    expect(shape.cards.map(c => [c.key, c.flow?.status.text, c.flow?.sentence, c.flow?.picker])).toEqual([
      [
        'none:a',
        'no run stored',
        'No run of this automation is stored since Home Assistant last started, so this is its shape only.',
        [],
      ],
    ]);
    const unread = automationsModel(
      inputs([]),
      data({list: [run('z', 'r', '2026-11-07T07:00:00Z')], configs: {z: null}}),
      null,
      deps,
    );
    expect(unread.cards).toEqual([{key: 'r', kind: 'completed', item: 'z', title: 'Last completed · z', flow: null}]);
  });
  test('a trace carries the config it ran with; no run at all is the no-runs line', () => {
    const traces = {'a/p': {config: lamp, trace: {}}};
    const view = automationsModel(
      inputs([auto('a')]),
      data({list: [run('a', 'p', '2026-11-07T07:00:00Z')], traces}),
      null,
      deps,
    );
    expect(view.cards[0].flow).not.toBeNull();
    expect(automationsModel(inputs([]), data(), null, deps).empty).toBe(
      'No automation has run since Home Assistant last started.',
    );
  });
});

test('the rows: the latest first, what each last did, the selected and the off ones marked', () => {
  const rows = automationsModel(
    inputs([
      auto('never'),
      auto('off', {on: false, last: '2026-11-07T10:00:00Z'}),
      auto('today', {last: '2026-11-07T09:30:00Z'}),
      auto('busy', {current: 1, last: '2026-11-07T11:00:00Z'}),
      auto('old', {last: '2026-11-01T09:30:00Z'}),
      auto(undefined),
    ]),
    data(),
    {item: 'today'},
    deps,
  ).rows;
  expect(rows.map(c => [c.item, c.sub, c.off, c.sel])).toEqual([
    ['busy', 'running', false, false],
    ['off', 'off', true, false],
    ['today', '9:30 am', false, true],
    ['old', 'Nov 1', false, false],
    ['never', 'never', false, false],
    [undefined, 'never', false, false],
  ]);
});

test('automationsBrief: how many run now, else how many there are, else nothing', () => {
  expect(automationsBrief([auto('a', {current: 2}), auto('b')], t)).toBe('1 running');
  expect(automationsBrief([auto('a'), auto('b')], t)).toBe('2 automations');
  expect(automationsBrief([], t)).toBeNull();
});

test('runningText: the running status’s words', () => {
  expect(runningText(NOW - 65_000, NOW, t)).toBe('running 1:05');
});

test('automationIds: every automation and the sun, nothing before Home Assistant answers', () => {
  expect(automationIds({hass: null})).toEqual([]);
  const states = {'automation.a': {}, 'light.x': {}, 'automation.b': {}} as unknown as HassEntities;
  expect(automationIds({hass: {states} as never})).toEqual([
    'automation.a',
    'automation.b',
    'sun.sun',
    'sensor.sun_next_rising',
    'sensor.sun_next_setting',
  ]);
});
