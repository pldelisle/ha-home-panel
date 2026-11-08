// Every tab opens, on a tablet and a phone, in the full and the bare house; nothing covers the Home button; no page error.
import {test, expect} from './fixtures';
import type {Locator} from '@playwright/test';
import {FULL_CFG, PHONE_TABS, TABLET_TABS} from './houses';

const tabsFor = (width: number) => (width < 600 ? PHONE_TABS : TABLET_TABS);
// whether the element itself is shown: not `hidden` and not display:none (its pane may be closed, that is not the question)
const shown = (loc: Locator) => expect.poll(() => loc.evaluate(e => !(e as HTMLElement).hidden && getComputedStyle(e).display !== 'none'));

test.describe('full house', () => {
  test.use({houseOpts: {cfg: FULL_CFG}});

  test('1 every tab that is shown opens a pane', async ({house, page}) => {
    for (const t of tabsFor(page.viewportSize()!.width)) {
      const button = house.root().locator(`[data-tab="${t}"]`).first();
      if (!(await button.isVisible())) continue; // a tab hidden on purpose (no car, say)
      await house.tab(t);
      const pane = house.root().locator(`#pane-${t}`);
      if (t === 'auto') await expect(pane.locator('svg').first()).toBeVisible({timeout: 10_000});
      expect((await pane.boundingBox())!.height, `${t} pane height`).toBeGreaterThan(50);
    }
  });

  // nothing invisible may sit on top of the panel and swallow taps (the v1.19.6 idle overlay did)
  test('2 the Home tab button is the topmost element at its centre', async ({house}) => {
    const covered = await house.root().evaluate(el => {
      const root = el.shadowRoot!, b = root.querySelector('[data-tab="home"]')!, x = b.getBoundingClientRect();
      const top = root.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2);
      return !top || !(top === b || b.contains(top));
    });
    expect(covered, 'the Home tab button is covered by another element').toBe(false);
  });

  test('3 shows who is home, the water heater and the Car tab; Hilo stays hidden', async ({house, page}) => {
    test.skip(page.viewportSize()!.width < 600, 'tablet layout');
    await expect(house.root()).toContainText('Alex');
    await shown(house.root().locator('#water')).toBe(true);
    await shown(house.root().locator('#hilo')).toBe(false);
    await shown(house.root().locator('#rail [data-tab="car"]')).toBe(true);
  });
});

test.describe('bare house', () => {
  test.use({houseOpts: {house: 'bare'}});

  test('4 optional sections stay hidden without their entities', async ({house}) => {
    for (const sel of ['#water', '#hilo', '#rail [data-tab="car"]', '#rail [data-tab="climate"]']) {
      await shown(house.root().locator(sel)).toBe(false);
    }
  });

  test('1b every tab that is shown opens a pane', async ({house, page}) => {
    for (const t of tabsFor(page.viewportSize()!.width)) {
      const button = house.root().locator(`[data-tab="${t}"]`).first();
      if (!(await button.isVisible())) continue;
      await house.tab(t);
      if (t === 'auto') continue; // no automations in the bare house
      expect((await house.root().locator(`#pane-${t}`).boundingBox())!.height, `${t} pane height`).toBeGreaterThan(50);
    }
  });
});

test.describe('French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, lang: 'fr'}});

  test('5 the rail is in French for a French-language user', async ({house, page}) => {
    test.skip(page.viewportSize()!.width < 600, 'tablet layout');
    await expect(house.root().locator('#rail')).toContainText(/Accueil|Lumières|Climat/);
  });
});

test.describe('dark theme', () => {
  test.use({houseOpts: {cfg: FULL_CFG, theme: 'dark'}});

  test('6 every tab opens with no page error', async ({house, page}) => {
    test.skip(page.viewportSize()!.width < 600, 'tablet layout');
    await expect(house.root().locator('.app')).toHaveAttribute('data-theme', 'dark');
    for (const t of TABLET_TABS) {
      if (!(await house.root().locator(`[data-tab="${t}"]`).first().isVisible())) continue;
      await house.tab(t);
    }
  });
});
