// Home Assistant text reaches the Mermaid source of a flow (step aliases, entity names, trace errors). It is drawn as
// text: none of it may act as Mermaid syntax, such as a %%{init}%% directive, a label closed early or a click handler.
import {readFileSync} from 'node:fs';
import {test, expect, tabletOnly} from './fixtures';
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
  return {...a, config: c};
});

test.describe('Home Assistant text in a flow', () => {
  test.use({houseOpts: {cfg: FULL_CFG, automations}});

  test('is drawn as it was typed and changes nothing else', async ({house}) => {
    tabletOnly(); // the phone has no Automations tab
    const outside: string[] = [];
    await house.page.route(/x\.invalid/, r => (outside.push(r.request().url()), r.abort()));
    await house.tab('auto');
    const flow = house.root().locator('#pane-auto .auc', {hasText: 'Entrance'}),
      svg = flow.locator('.augraph svg');
    await expect(svg).toBeVisible({timeout: 10_000});
    for (const text of Object.values(HOSTILE)) await expect(svg).toContainText(text);
    // no formula was typeset (KaTeX writes a <math> element) and KaTeX's chunk was never asked for
    await expect(svg.locator('math, .katex')).toHaveCount(0);
    expect(
      house.chunkRequests.filter(u => /\/chunks\/katex-/.test(u)),
      'KaTeX chunks fetched',
    ).toEqual([]);
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
