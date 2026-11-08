// Every tab opens, on a tablet and a phone, in the full and the bare house; nothing covers the Home button; no page error.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect, tabletOnly, type House} from './fixtures';
import type {Locator} from '@playwright/test';
import {FULL_CFG, PHONE_TABS, TABLET_TABS} from './houses';

// opens each tab the screen offers (a tab button hidden on purpose, no car say, is skipped; one that is merely invisible is not) and runs `check` on its pane
async function openEveryTab(house: House, check?: (tab: string, pane: Locator) => Promise<void>) {
  const tabs = house.page.viewportSize()!.width < 600 ? PHONE_TABS : TABLET_TABS;
  for (const t of tabs) {
    const button = house.root().locator(`[data-tab="${t}"]`).first();
    if (!(await button.count()) || await button.evaluate(e => (e as HTMLElement).hidden)) continue;
    await house.tab(t);
    if (check) await check(t, house.root().locator(`#pane-${t}`));
  }
}
// whether the element itself is shown: not `hidden` and not display:none (its pane may be closed, that is not the question)
const shown = (loc: Locator) => expect.poll(() => loc.evaluate(e => !(e as HTMLElement).hidden && getComputedStyle(e).display !== 'none'));
// the pane is at least 50 px tall; in a house with automations the Automations pane has drawn its flow first
const tallEnough = (withFlows: boolean) => async (tab: string, pane: Locator) => {
  if (tab === 'auto' && withFlows) await expect(pane.locator('svg').first()).toBeVisible({timeout: 10_000});
  expect((await pane.boundingBox())!.height, `${tab} pane height`).toBeGreaterThan(50);
};
// nothing invisible may sit on top of the panel and swallow taps (the v1.19.6 idle overlay did); checked in every house
const homeButtonUncovered = async (house: House) => {
  const covered = await house.root().evaluate(el => {
    const root = el.shadowRoot!, b = root.querySelector('[data-tab="home"]')!, x = b.getBoundingClientRect();
    const top = root.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2);
    return !top || !(top === b || b.contains(top));
  });
  expect(covered, 'the Home tab button is covered by another element').toBe(false);
};

test.describe('full house', () => {
  test.use({houseOpts: {cfg: FULL_CFG}});

  test('1 every tab that is shown opens a pane', async ({house}) => {
    await openEveryTab(house, tallEnough(true));
  });

  test('2 the Home tab button is the topmost element at its centre', async ({house}) => {
    await homeButtonUncovered(house);
  });

  test('3 shows who is home, the water heater and the Car tab; Hilo stays hidden', async ({house}) => {
    tabletOnly();
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

  test('1b every tab that is shown opens a pane', async ({house}) => {
    await openEveryTab(house, tallEnough(false)); // no automations here, so no flow to wait for
  });

  test('2b the Home tab button is the topmost element at its centre', async ({house}) => {
    await homeButtonUncovered(house);
  });
});

test.describe('French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, lang: 'fr'}});

  test('5 the rail is in French for a French-language user', async ({house}) => {
    tabletOnly();
    await expect(house.root().locator('#rail')).toContainText(/Accueil|Lumières|Climat/);
    await homeButtonUncovered(house);
  });
});

test.describe('dark theme', () => {
  test.use({houseOpts: {cfg: FULL_CFG, theme: 'dark'}});

  test('6 every tab opens with no page error', async ({house}) => {
    tabletOnly();
    await expect(house.root().locator('.app'), 'the theme option reached the panel').toHaveAttribute('data-theme', 'dark');
    await openEveryTab(house, tallEnough(true));
    await homeButtonUncovered(house);
  });
});
