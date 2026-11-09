// Home Assistant text reaches the Mermaid source of a flow (step aliases, entity names, trace errors). It is drawn as
// text: none of it may act as Mermaid syntax, such as a %%{init}%% directive, a label closed early or a click handler.
import {test, expect, tabletOnly, KATEX_CHUNK_URL} from './fixtures';
import {FULL_CFG} from './houses';
import {automations as houseAutomations} from '../houses/full.mjs';

// what an automation's author could type as the alias of a step, each under the 64 characters a label keeps
const HOSTILE = {
  trigger: 'Door %%{init: {"theme":"dark"}}%%',
  condition: '"]; click A call alert(1)',
  first: "%%{init:{'themeCSS':'*{background:url(//x.invalid/a)}'}}%%",
  last: '100% sure %%{ never closed',
  // KaTeX's delimiters: Mermaid typesets a $$…$$ in a label, so this one must stay text (and KaTeX's chunk unfetched)
  math: 'Fan $$x$$',
};
// Mermaid reads `#nn;` and `#name;` as entities, in a label too, and decodes them before it looks for a directive or for
// `$$`: each of these must stay the characters typed. Then plain text with a # in it, which has to read as typed
const ENTITIES = [
  '#36;#36;y#36;#36;', // two $ typed as entities, to make `$$y$$` for KaTeX after the decoding
  '#37;#37;{init}', // two % as entities, to make a directive
  '#lt;img onerror#gt;', // a tag as entities
  '#quot;]; click', // a quote closing the label, as an entity
  'Room #2', // not an entity at all
];

// the test house's automations, with those aliases on the steps of the one the Automations tab draws first. Every one of
// its nodes has a subtitle (the time of the run), and a subtitle carries a `;` (`font-weight:500;opacity:.75`) that
// Mermaid's `style` pre-pass takes in place of a label's own: this flow passed by luck for a `%` or `#` at the end of a
// label. The flow below, with no run stored, has no subtitles and is the one that tells (#97)
type Automation = {config: {id: string; triggers: object[]; conditions: object[]; actions: object[]}};
const automations = (houseAutomations as Automation[]).map(a => {
  if (a.config.id !== 'front_door_light') return a;
  const c = structuredClone(a.config),
    alias = (o: object, text: string) => ({...o, alias: text});
  c.triggers[0] = alias(c.triggers[0], HOSTILE.trigger);
  c.conditions[0] = alias(c.conditions[0], HOSTILE.condition);
  c.actions[0] = alias(c.actions[0], HOSTILE.first);
  c.actions[1] = alias(c.actions[1], HOSTILE.math);
  c.actions[2] = alias(c.actions[2], HOSTILE.last);
  // five more steps, one for each text above
  for (const text of ENTITIES)
    c.actions.push(alias({action: 'light.turn_off', target: {entity_id: 'light.living_room_1'}}, text));
  return {...a, config: c};
});

test.describe('Home Assistant text in a flow', () => {
  test.use({houseOpts: {cfg: FULL_CFG, automations}});

  test('is drawn as it was typed and changes nothing else', async ({house}) => {
    tabletOnly(); // the phone has no Automations tab
    const outside: string[] = [];
    await house.page.route(/x\.invalid/, r => (outside.push(r.request().url()), r.abort()));
    // nothing the flow draws reaches beyond the house: no request to another host
    house.page.on('request', r => {
      if (!/^(data|blob|about):/.test(r.url()) && new URL(r.url()).hostname !== 'localhost') outside.push(r.url());
    });
    await house.tab('auto');
    const flow = house.root().locator('#pane-auto .auc', {hasText: 'Entrance'}),
      svg = flow.locator('.augraph svg');
    await expect(svg).toBeVisible({timeout: 10_000});
    for (const text of [...Object.values(HOSTILE), ...ENTITIES]) await expect(svg).toContainText(text);
    // no formula was typeset (KaTeX writes a <math> element) and KaTeX's chunk was never asked for
    await expect(svg.locator('math, .katex')).toHaveCount(0);
    expect(
      house.chunkRequests.filter(u => KATEX_CHUNK_URL.test(u)),
      'KaTeX chunks fetched',
    ).toEqual([]);
    // nor a tag or a click handler from an entity
    await expect(svg.locator('img, script, [onerror]')).toHaveCount(0);
    // no directive reached Mermaid: the text and the nodes have the panel's colours, not the dark theme's, and the
    // stylesheet has no rule from the alias
    const [card, ring, fg] = await house
      .root()
      .locator('#app')
      .evaluate(el => ['--card', '--ring', '--fg'].map(n => getComputedStyle(el).getPropertyValue(n).trim()));
    const style = (await svg.locator('style').first().textContent()) ?? '';
    expect(style).toMatch(new RegExp(`^#hpau\\d+\\{[^}]*fill:${fg};`));
    expect(style).toContain(`.node path{fill:${card};stroke:${ring};`);
    expect(style).not.toContain('x.invalid');
    expect(outside, 'requests the flow made outside the house').toEqual([]);
  });
});

// What each text below is drawn as. Mermaid's entity pre-pass (`text.replace(/style.*:\S*#.*;/g, …)`) drops the last `;` of
// a source line that has a `#` after `style…:` with no space between, so `auMermaid` ends every node and edge line in a `;`
// of its own. These are all the shapes and line kinds the panel writes, without a subtitle: a `%` or `#` that ends a label
const PERCENT = {
  trigger: '10%', // a stadium, and (with the second trigger) the ANY circle
  trigger2: '%',
  check: 'Room #2;', // a node, and an `if` (a diamond), below: ends in what reads as an entity, so it is escaped
  entity: '#36;#36;y#36;#36;', // typed entities, as in the flow above
  step: 'Fan at 20%',
  script: '50%', // the name of a script: a `[[…]]` node
  ifCheck: 'Sun at 30%',
  caseA: '40% off', // choice labels: the text on an edge
  caseB: '60%',
  caseC: '#9;',
  then: '70%',
  lamp: 'Lamp 80%',
  last: '#8;',
};
const pctFlow = {
  entity_id: 'automation.percent_flow',
  noRun: true,
  config: {
    id: 'percent_flow',
    alias: 'Percent flow',
    mode: 'single',
    triggers: [
      {trigger: 'time', at: '07:00:00', alias: PERCENT.trigger},
      {trigger: 'time', at: '08:00:00', alias: PERCENT.trigger2},
      {trigger: 'time', at: '09:00:00', alias: HOSTILE.trigger},
    ],
    conditions: [
      {condition: 'state', entity_id: 'sun.sun', state: 'below_horizon', alias: PERCENT.check},
      {condition: 'state', entity_id: 'sun.sun', state: 'below_horizon', alias: HOSTILE.condition},
    ],
    actions: [
      // the other aliases of the flow above, so they are drawn with no subtitle too
      ...[HOSTILE.first, HOSTILE.math, HOSTILE.last, ...ENTITIES].map(alias => ({
        action: 'light.turn_off',
        target: {entity_id: 'light.living_room_1'},
        alias,
      })),
      {action: 'light.turn_on', target: {entity_id: 'light.living_room_1'}, alias: PERCENT.entity},
      {action: 'light.turn_off', target: {entity_id: 'light.living_room_1'}, alias: PERCENT.step},
      {action: 'script.percent_script'},
      {
        if: [{condition: 'state', entity_id: 'sun.sun', state: 'above_horizon', alias: PERCENT.ifCheck}],
        then: [{action: 'light.turn_on', target: {entity_id: 'light.living_room_1'}, alias: PERCENT.then}],
      },
      {
        choose: [
          {
            alias: PERCENT.caseA,
            conditions: [{condition: 'state', entity_id: 'sun.sun', state: 'below_horizon'}],
            sequence: [{action: 'light.turn_on', target: {entity_id: 'light.living_room_1'}, alias: 'Lamp #7'}],
          },
          {
            alias: PERCENT.caseB,
            conditions: [{condition: 'state', entity_id: 'sun.sun', state: 'above_horizon'}],
            sequence: [{action: 'light.turn_off', target: {entity_id: 'light.living_room_1'}, alias: PERCENT.lamp}],
          },
          {
            alias: PERCENT.caseC,
            conditions: [{condition: 'state', entity_id: 'sun.sun', state: 'above_horizon'}],
            sequence: [{action: 'light.turn_off', target: {entity_id: 'light.living_room_1'}, alias: PERCENT.last}],
          },
        ],
      },
    ],
  },
};

test.describe('A % or # that ends a label in a flow with no run stored', () => {
  test.use({houseOpts: {cfg: FULL_CFG, automations: [...automations, pctFlow]}});

  test('is drawn as typed, in every shape, edge and line kind', async ({house}) => {
    tabletOnly();
    await house.setState('script.percent_script', {state: 'off', attributes: {friendly_name: PERCENT.script}});
    await house.tab('auto');
    await house.root().locator('#pane-auto .auchip[data-au="percent_flow"]').click();
    const flow = house.root().locator('#pane-auto .auc.ausel'),
      svg = flow.locator('.augraph svg');
    await expect(flow.locator('.pill', {hasText: 'no run stored'})).toBeVisible();
    await expect(svg).toBeVisible({timeout: 10_000});
    // a label at the end of its source line: `"100%"` is `100#37;` and a `#2;` is `#35;2;`, as it reads as an entity (the
    // `Room #2` of ENTITIES does not, and stays as it is)
    // a lone % is in every other label's text, so it is asked for as a whole label
    await expect.soft(svg.locator('.node', {hasText: /^TRIGGER%$/})).toHaveCount(1, {timeout: 1000});
    for (const text of [...Object.values(PERCENT), ...Object.values(HOSTILE), ...ENTITIES])
      await expect.soft(svg, text).toContainText(text, {timeout: 1000});
  });
});
