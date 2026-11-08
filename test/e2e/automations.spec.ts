// Home Assistant text reaches the Mermaid source of a flow (step aliases, entity names, trace errors). It is drawn as
// text: none of it may act as Mermaid syntax, such as a %%{init}%% directive, a label closed early or a click handler.
import {readFileSync} from 'node:fs';
import {test, expect, tabletOnly, KATEX_CHUNK_URL} from './fixtures';
import {FULL_CFG} from './houses';

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

// the test house's automations, with those aliases on the steps of the one the Automations tab draws first
type Automation = {config: {id: string; triggers: object[]; conditions: object[]; actions: object[]}};
const automations = (
  JSON.parse(readFileSync(new URL('./automations.json', import.meta.url), 'utf8')) as Automation[]
).map(a => {
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
