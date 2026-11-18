// The Liquid Glass sidebar (#491): on the tablet the rail is a sidebar that starts collapsed to a strip of icons, opens with its toggle
// to icons and labels in two groups, keeps its choice across a reload, and tints the open section with that section's own colour (the
// one its icon has on its Home card). Material's rail and the phone's bar are not the sidebar. Driven as a person drives it: the toggle,
// the rows, the keyboard; what is read back is the screen's boxes, roles and colours.
import {test, expect, tabletOnly, phoneOnly, fontsLoaded, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.beforeEach(({house}) => fontsLoaded(house));

const rail = (house: House) => house.root().locator('#rail');
const toggle = (house: House) => rail(house).locator('.rside');
const rows = (house: House) => rail(house).locator('.rtab:visible');
const colour = (house: House, selector: string) =>
  house
    .root()
    .locator(selector)
    .evaluate(e => getComputedStyle(e).color);

test.describe('the sidebar on the tablet', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  test('starts collapsed: an icon strip whose rows keep their names and show them on hover', async ({house}) => {
    tabletOnly();
    await expect(toggle(house)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(house)).toHaveAccessibleName('Show sidebar');
    expect((await rail(house).boundingBox())?.width).toBe(72);
    // every label is clipped to nothing, yet each row is a tab with its name and a tooltip
    const widths = await rows(house)
      .locator('span')
      .evaluateAll(spans => spans.map(e => e.getBoundingClientRect().width));
    expect(widths.length).toBeGreaterThanOrEqual(9);
    for (const w of widths) expect(w).toBeLessThanOrEqual(1);
    await expect(house.root().getByRole('tab', {name: 'Lights'})).toHaveAttribute('title', 'Lights');
    await expect(house.root().getByRole('tab', {name: 'Automations'})).toBeVisible();
    // the content has the width the strip leaves
    expect((await house.root().locator('.panes').boundingBox())!.x).toBeLessThan(120);
  });

  test('the toggle opens it, by keyboard too: labels, two groups, rows of 44 px or more', async ({house}) => {
    tabletOnly();
    await toggle(house).focus();
    await house.page.keyboard.press('Enter');
    await expect(toggle(house)).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle(house)).toHaveAccessibleName('Hide sidebar');
    await expect.poll(async () => (await rail(house).boundingBox())?.width).toBe(280);
    await expect(rail(house).locator('.rhead')).toHaveText('Categories');
    // Home and Automations, the heading, then the rest in today's order
    await expect(rows(house).locator('span')).toHaveText([
      'Home',
      'Automations',
      'Lights',
      'Climate',
      'Weather',
      'Car',
      'Energy',
      'Air',
      'Media',
      'Security',
    ]);
    const heights = await rows(house).evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
    // a tab still opens its pane, and the sidebar stays as it was
    await house.root().locator('[data-tab="lights"]').click();
    await expect(house.root().locator('#pane-lights')).toBeVisible();
    await expect(toggle(house)).toHaveAttribute('aria-expanded', 'true');
    await toggle(house).click();
    await expect(toggle(house)).toHaveAttribute('aria-expanded', 'false');
  });

  test('keeps its choice across a reload', async ({house}) => {
    tabletOnly();
    await toggle(house).click();
    await expect(toggle(house)).toHaveAttribute('aria-expanded', 'true');
    expect(await house.page.evaluate(() => localStorage.getItem('home-panel-sidebar'))).toBe('open');
    await house.page.reload();
    await expect(toggle(house)).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(async () => (await rail(house).boundingBox())?.width).toBe(280);
  });

  test('the open row takes its section colour: the colour of its icon on its Home card', async ({house}) => {
    tabletOnly();
    await house.tab('home');
    for (const key of ['lights', 'climate'])
      await expect(house.root().locator(`#htiles hp-glance-tile[data-key="${key}"] button.htile`)).toBeVisible();
    const card = {
      lights: await colour(house, '#htiles hp-glance-tile[data-key="lights"] .hh > span:first-child'),
      climate: await colour(house, '#htiles hp-glance-tile[data-key="climate"] .hh > span:first-child'),
    };
    for (const key of ['lights', 'climate'] as const) {
      await house.root().locator(`[data-tab="${key}"]`).click();
      const open = `#rail [data-tab="${key}"][aria-selected="true"]`;
      await expect(house.root().locator(open)).toBeVisible();
      expect(await colour(house, `${open} svg`), `${key}: the row's icon`).toBe(card[key]);
      // the pill is that colour at a low alpha, and the label keeps the text colour
      await expect
        .poll(() =>
          house
            .root()
            .locator(open)
            .evaluate(e => getComputedStyle(e).backgroundColor),
        )
        .toMatch(/ 0\.16\)$/);
      const label = await colour(house, `${open} span`);
      const text = await house
        .root()
        .locator('#hello')
        .evaluate(e => getComputedStyle(e).color);
      expect(label).toBe(text);
    }
  });
});

test.describe('the sidebar in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, lang: 'fr', time: AFTERNOON, frozen: true}});

  test('names the toggle in French and cuts no label', async ({house}) => {
    tabletOnly();
    await expect(toggle(house)).toHaveAccessibleName('Afficher la barre latérale');
    await toggle(house).click();
    await expect(toggle(house)).toHaveAccessibleName('Masquer la barre latérale');
    await expect(rail(house).locator('.rhead')).toHaveText('Catégories');
    await expect.poll(async () => (await rail(house).boundingBox())?.width).toBe(280);
    const cut = await rows(house)
      .locator('span')
      .evaluateAll(spans => spans.filter(e => e.scrollWidth > e.clientWidth).map(e => e.textContent));
    expect(cut, 'labels cut in the sidebar').toEqual([]);
    await expect(house.root().getByRole('tab', {name: 'Automatisations'})).toBeVisible();
  });
});

test.describe('what is not the sidebar', () => {
  test.use({houseOpts: {cfg: FULL_CFG, design: 'material', time: AFTERNOON, frozen: true}});

  test('Material keeps its rail: 96 px, no toggle, the labels showing', async ({house}) => {
    tabletOnly();
    await expect(toggle(house)).toBeHidden();
    expect((await rail(house).boundingBox())?.width).toBe(96);
    await expect(rail(house).locator('.rhead')).toBeHidden();
  });
});

test.describe('the phone', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  test('keeps its bottom bar: no toggle, no heading, four tabs and More', async ({house}) => {
    phoneOnly();
    await expect(toggle(house)).toBeHidden();
    await expect(rail(house).locator('.rhead')).toBeHidden();
    await expect(rows(house)).toHaveCount(5);
  });
});
