// Every tab opens, on a tablet and a phone, in the full and the bare house; nothing covers the Home button; no page error.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect, tabletOnly, eachShownTab, type House} from './fixtures';
import type {Locator} from '@playwright/test';
import {FULL_CFG} from './houses';

// what the bare house lacks, wherever it shows: the Climate and Car tabs (rail buttons, Home tiles), the water heater and Hilo cards
// and the tiles that open them
const LACKING = '[data-tab="climate"], [data-tab="car"], #water, #hilo, [data-card="water"], [data-card="hilo"]';

// records each of them the panel leaves shown at the end of a task that changes it (window.lackingShown): a MutationObserver's
// callback runs before the browser may paint the next frame, so what it sees is what a frame can show, whatever the timing
const recordedTest = test.extend({
  page: async ({page}, use) => {
    await page.addInitScript(sel => {
      const seen: string[] = [];
      (window as unknown as {lackingShown: string[]}).lackingShown = seen;
      const attach = Object.getOwnPropertyDescriptor(Element.prototype, 'attachShadow')!
        .value as Element['attachShadow'];
      Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
        const root = attach.call(this, init);
        new MutationObserver(() =>
          root.querySelectorAll<HTMLElement>(sel).forEach(e => {
            if (!e.hidden) seen.push(`${e.id ? '#' + e.id : e.className} ${e.dataset.card ?? e.dataset.tab ?? ''}`);
          }),
        ).observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden']});
        return root;
      };
    }, LACKING);
    await use(page);
  },
});

// whether the element itself is shown: not `hidden` and not display:none (its pane may be closed, that is not the question)
const shown = (loc: Locator) =>
  expect.poll(() => loc.evaluate(e => !(e as HTMLElement).hidden && getComputedStyle(e).display !== 'none'));
// the pane is at least 50 px tall; in a house with automations the Automations pane has drawn its flow first
const tallEnough = (withFlows: boolean) => async (tab: string, pane: Locator) => {
  if (tab === 'auto' && withFlows) await expect(pane.locator('svg').first()).toBeVisible({timeout: 10_000});
  expect((await pane.boundingBox())!.height, `${tab} pane height`).toBeGreaterThan(50);
};
// nothing invisible may sit on top of the panel and swallow taps (the v1.19.6 idle overlay did); checked in every house
const homeButtonUncovered = async (house: House) => {
  const covered = await house.root().evaluate(el => {
    const root = el.shadowRoot!,
      b = root.querySelector('[data-tab="home"]')!,
      x = b.getBoundingClientRect();
    const top = root.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2);
    return !top || !(top === b || b.contains(top));
  });
  expect(covered, 'the Home tab button is covered by another element').toBe(false);
};

test.describe('full house', () => {
  test.use({houseOpts: {cfg: FULL_CFG}});

  test('1 every tab that is shown opens a pane', async ({house}) => {
    await eachShownTab(house, tallEnough(true));
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

  // the Home tiles, and on a phone the Energy rows, are redrawn whole when their text changes; a hide that ran before the redraw let
  // these show on load and come back after every change, and the glass tiles that moved for them broke the bare-house screenshot
  recordedTest(
    '41 what the bare house lacks never shows, on load or when a change redraws its tiles',
    async ({house}) => {
      await house.tab('home');
      await house.setState('light.living_room_1', {attributes: {brightness: 100}});
      await expect(house.root().locator('#htiles [data-tab="lights"]')).toContainText('39%');
      if (test.info().project.name === 'phone') {
        // Energy is under More on a phone; its pane draws the Water heater and Hilo rows
        await house.root().locator('#moretab').click();
        await house.root().locator('#morelist [data-tab="energy"]').click();
        await expect(house.root().locator('#pane-energy')).toBeVisible();
        await expect(house.root().locator('#etiles [data-card="water"]')).toBeAttached();
      }
      const shown = await house.page.evaluate(() => (window as unknown as {lackingShown: string[]}).lackingShown);
      expect([...new Set(shown)], 'shown at the end of a task').toEqual([]);
    },
  );

  test('1b every tab that is shown opens a pane', async ({house}) => {
    await eachShownTab(house, tallEnough(false)); // no automations here, so no flow to wait for
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
    await expect(house.root().locator('.app'), 'the theme option reached the panel').toHaveAttribute(
      'data-theme',
      'dark',
    );
    await eachShownTab(house, tallEnough(true));
    await homeButtonUncovered(house);
  });
});
