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

  test('collapsed, each icon sits in the middle of its row', async ({house}) => {
    tabletOnly();
    const off = await rows(house).evaluateAll(els =>
      els.map(row => {
        const r = row.getBoundingClientRect();
        const i = row.querySelector('svg')!.getBoundingClientRect();
        return Math.abs(r.left + r.width / 2 - (i.left + i.width / 2));
      }),
    );
    expect(off.length).toBeGreaterThan(5);
    for (const d of off) expect(d).toBeLessThanOrEqual(0.5);
  });

  test('the toggle opens it, by keyboard too: labels, two groups, rows of 44 px or more', async ({house}) => {
    tabletOnly();
    await toggle(house).focus();
    await house.page.keyboard.press('Enter');
    await expect(toggle(house)).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle(house)).toHaveAccessibleName('Hide sidebar');
    // the toggle is the same button after the redraw, so the keyboard stays on it
    await expect(toggle(house)).toBeFocused();
    await house.page.keyboard.press('Space');
    await expect(toggle(house)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(house)).toBeFocused();
    await house.page.keyboard.press('Enter');
    await expect(toggle(house)).toHaveAttribute('aria-expanded', 'true');
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
      // light theme: the icon is the colour pulled toward the text colour so it keeps 3:1 on the light grounds, so it is the card's colour, darker
      const icon = await colour(house, `${open} svg`);
      // rgb(...) in 0-255, or color(srgb ...) in 0-1: the brightness is the sum of the three channels on one scale
      const sum = (c: string) => {
        const [r, g, b] = c
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
        return (r + g + b) * (c.startsWith('color(') ? 255 : 1);
      };
      expect(icon, `${key}: the row's icon is not the card's colour`).not.toBe(card[key]);
      expect(sum(icon), `${key}: the row's icon is darker`).toBeLessThan(sum(card[key]));
      // the row's fill is the navigation layer's neutral selection, not the section's colour; the label keeps the text colour
      const neutral = await house
        .root()
        .locator('#app')
        .evaluate(e => {
          const probe = document.createElement('i');
          probe.style.background = 'var(--nav-sel-bg)';
          e.append(probe);
          const bg = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return bg;
        });
      await expect
        .poll(() =>
          house
            .root()
            .locator(open)
            .evaluate(e => getComputedStyle(e).backgroundColor),
        )
        .toBe(neutral);
      const label = await colour(house, `${open} span`);
      const text = await house
        .root()
        .locator('#hello')
        .evaluate(e => getComputedStyle(e).color);
      expect(label).toBe(text);
    }
  });
});

test.describe('the sidebar, dark', () => {
  test.use({houseOpts: {cfg: FULL_CFG, theme: 'dark', time: AFTERNOON, frozen: true}});

  test('the open row icon is exactly the colour of its icon on its Home card', async ({house}) => {
    tabletOnly();
    await house.tab('home');
    const card = await colour(house, '#htiles hp-glance-tile[data-key="lights"] .hh > span:first-child');
    await house.root().locator('[data-tab="lights"]').click();
    await expect(house.root().locator('#rail [data-tab="lights"][aria-selected="true"]')).toBeVisible();
    expect(await colour(house, '#rail [data-tab="lights"] svg')).toBe(card);
  });
});

test.describe('between the phone and the tablet (700 px)', () => {
  test.use({viewport: {width: 700, height: 820}, houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  test('the rail is as it was: the registry order, no tooltips, no toggle', async ({house}) => {
    tabletOnly();
    const tabs = rail(house).locator('[data-tab]');
    expect(await tabs.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.tab))).toEqual([
      'home',
      'lights',
      'climate',
      'weather',
      'car',
      'energy',
      'air',
      'media',
      'cams',
      'auto',
    ]);
    expect(await tabs.evaluateAll(els => els.filter(e => e.hasAttribute('title')).length)).toBe(0);
    await expect(toggle(house)).toBeHidden();
    await expect(rail(house).locator('.rhead')).toHaveCount(0);
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
