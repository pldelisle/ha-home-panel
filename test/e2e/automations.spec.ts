// Home Assistant text reaches the Mermaid source of a flow (step aliases, entity names, trace errors). It is drawn as
// text: none of it may act as Mermaid syntax, such as a %%{init}%% directive, a label closed early or a click handler.
import AxeBuilder from '@axe-core/playwright';
import type {Locator} from '@playwright/test';
import {test, expect, isPhone, phoneOnly, tabletOnly, KATEX_CHUNK_URL, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';
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
// a source line that has a `#` after `style…:` with no space between, so `toMermaid` ends every node and edge line in a `;`
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
    await house.root().locator('#pane-auto .aurow[data-au="percent_flow"]').click();
    const flow = house.root().locator('#pane-auto .auc.ausel'),
      svg = flow.locator('.augraph svg');
    await expect(flow.locator('.status', {hasText: 'no run stored'})).toBeVisible();
    await expect(svg).toBeVisible({timeout: 10_000});
    // a label at the end of its source line: `"100%"` is `100#37;` and a `#2;` is `#35;2;`, as it reads as an entity (the
    // `Room #2` of ENTITIES does not, and stays as it is)
    // a lone % is in every other label's text, so it is asked for as a whole label
    await expect.soft(svg.locator('.node', {hasText: /^Trigger%$/})).toHaveCount(1, {timeout: 1000});
    for (const text of [...Object.values(PERCENT), ...Object.values(HOSTILE), ...ENTITIES])
      await expect.soft(svg, text).toContainText(text, {timeout: 1000});
  });
});

// the tab: the rail's on a tablet, More's list on a phone (Automations is not one of the bar's four)
const openAuto = async (house: House) => {
  if (!isPhone(house)) return house.tab('auto');
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="auto"] button').click();
  await expect(house.root().locator('#pane-auto')).toBeVisible();
};

// The pane drawn by the feature (#273): the line and the Today dots from the test house's runs, a chip's card with its flow, the
// twenty-second rule of the runs' list, nothing redrawn for an entity the pane does not read, and no accessibility finding
test.describe('the Automations pane', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});
  test.beforeEach(tabletOnly);

  const pane = (house: House) => house.root().locator('hp-automations-pane');

  test('says what ran today and draws a dot per run', async ({house}) => {
    await house.tab('auto');
    await expect(pane(house).locator('hp-pane-header [slot="sub"]')).toHaveText(
      'nothing running · 3 runs today · 3 enabled',
    );
    await expect(pane(house).locator('.aud:not(.up)')).toHaveCount(3);
    // the 5 pm run still to come is a dot of its own with the 6 pm one, or in a group with a run: either way one says it is scheduled
    await expect(pane(house).locator('.aud[aria-label*="scheduled"]')).not.toHaveCount(0);
  });

  test('a row of the list selects its automation, and its card comes first with its flow', async ({house}) => {
    await house.tab('auto');
    const row = pane(house).locator('.aurow[data-au="front_door_light"]');
    await expect(row).toHaveAttribute('aria-pressed', 'false');
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    const card = pane(house).locator('.auc.ausel');
    await expect(card.locator('h3')).toHaveText(/^Selected · Entrance/);
    await expect(card.locator('.augraph svg')).toBeVisible({timeout: 10_000});
    await card.locator('.close').click();
    await expect(pane(house).locator('.auc.ausel')).toHaveCount(0);
  });

  // HIG, Buttons: 44x44 pt. A dot is a 44 pt button round a smaller drawn dot, a row of the list is as tall; no sentence tells
  // to tap, and the list is rows with a name, when it last ran and a chevron, the selected one filled
  test('the dots and the rows are 44 pt targets, and the list has no tap hint', async ({house}) => {
    await house.tab('auto');
    const size = (l: Locator) =>
      l.evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(r => [r.width, r.height]));
    const dots = await size(pane(house).locator('.aud'));
    expect(dots.length).toBeGreaterThan(0);
    for (const [w, h] of dots) expect([w, h]).toEqual([44, 44]);
    // the drawn dot stays 28 pt (20 when the run was skipped), or the same with a count
    for (const w of (await size(pane(house).locator('.aud:not(.skip) .d'))).map(([w]) => w)) expect(w).toBe(28);
    const rows = await size(pane(house).locator('.aurow'));
    expect(rows).toHaveLength(3);
    for (const [, h] of rows) expect(h).toBeGreaterThanOrEqual(44);
    const row = pane(house).locator('.aurow[data-au="front_door_light"]');
    await expect(row).toContainText('Entrance');
    await expect(row.locator('small')).not.toBeEmpty();
    await expect(row.locator('svg')).toHaveCount(1);
    const fill = (l: Locator) => l.evaluate(e => getComputedStyle(e).backgroundColor);
    const unselected = await fill(row);
    await row.click();
    const selected = await fill(row);
    expect(selected).not.toBe(unselected);
    // the neutral selection fill, the sidebar's, and not only a colour: the chevron stays and the selected state is said
    const navSel = await row.evaluate(e => {
      const probe = document.createElement('i');
      probe.style.background = 'var(--nav-sel-bg)';
      e.append(probe);
      const c = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return c;
    });
    expect(selected).toBe(navSel);
    await expect(pane(house)).not.toContainText(/\btap\b/i);
  });

  test('asks for the list of runs once when the tab opens, not again within twenty seconds', async ({house}) => {
    await house.tab('auto');
    await expect(pane(house).locator('hp-run-timeline')).toBeAttached();
    // just under the twenty seconds the list is held for: a shorter hold would ask again within this window
    await house.clock.runFor(19_500);
    const lists = (await house.reads()).filter(r => r.startsWith('trace/list'));
    expect(lists).toHaveLength(1);
  });

  test('a light change gives zero mutations in the pane', async ({house}) => {
    await house.tab('auto');
    await expect(pane(house).locator('.augraph svg').first()).toBeVisible({timeout: 10_000});
    await house.mutations.reset();
    await house.setState('light.living_room_1', {state: 'on'});
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-automations-pane, hp-run-timeline, hp-flow-card, hp-automation-list')).toBe(
      0,
    );
  });

  test('the tab has no serious or critical accessibility finding', async ({house}) => {
    await house.tab('auto');
    await expect(pane(house).locator('.augraph svg').first()).toBeVisible({timeout: 10_000});
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    const bad = violations
      .filter(v => v.impact === 'serious' || v.impact === 'critical')
      .flatMap(v => v.nodes.map(() => v.id));
    expect(bad).toEqual([]);
  });
});

// HIG audit 15 (#428). Both shapes: the dots' legend of four marks replaces the paragraph that explained them.
test.describe('the Automations pane, the dots legend', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});

  test('names the four marks of a dot, in a legend and not in a paragraph', async ({house}) => {
    await openAuto(house);
    const today = house.root().locator('hp-automations-pane hp-run-timeline');
    await expect(today.locator('.audots span')).toHaveText([
      'ran',
      'checked, did nothing',
      'running now',
      'still to come',
    ]);
    await expect(today.locator('.auhead p')).not.toContainText('Filled');
  });
});

// On a phone Today's card is followed by the list; a row opens that automation's flow and last run in a sheet, and the flow is
// drawn (Mermaid fetched) only then.
test.describe('the Automations pane on a phone', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});
  test.beforeEach(phoneOnly);

  test('has the list under Today and no flow until a row opens its sheet', async ({house}) => {
    await openAuto(house);
    const pane = house.root().locator('hp-automations-pane');
    await expect(pane.locator('hp-run-timeline + hp-automation-list')).toBeAttached();
    await expect(pane.locator('.augraph')).toHaveCount(0);
    expect(house.chunkRequests, 'chunks asked for before a flow is opened').toEqual([]);
    await pane.locator('.aurow[data-au="front_door_light"]').click();
    const sheet = pane.locator('hp-sheet .sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('h2')).toContainText('Entrance'); // the sheet says the name; the framed card draws no title
    await expect(pane.locator('hp-sheet hp-flow-card .auc.ausel')).toHaveCount(1);
    await expect(pane.locator('hp-sheet hp-flow-card .auc.ausel h3')).toHaveCount(0);
    await expect(pane.locator('hp-sheet hp-flow-card .augraph svg')).toBeVisible({timeout: 10_000});
    await house.page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(pane.locator('.augraph')).toHaveCount(0);
  });

  // the host may be asked for the sheet by something that selected nothing: no empty sheet stays over the tab
  test('closes the flow sheet when it is asked for with nothing selected', async ({house}) => {
    await openAuto(house);
    const pane = house.root().locator('hp-automations-pane');
    await pane
      .locator('hp-run-timeline')
      .evaluate(el =>
        el.dispatchEvent(
          new CustomEvent('sheet-request', {bubbles: true, composed: true, detail: {id: 'automations.flow'}}),
        ),
      );
    await expect(pane.locator('hp-sheet')).not.toHaveAttribute('open', /.*/);
    await expect(pane.locator('hp-sheet .sheet')).toBeHidden();
  });
});
