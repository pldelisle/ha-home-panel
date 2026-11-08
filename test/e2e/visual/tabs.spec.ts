// One screenshot per tab, per viewport, theme and language (spec 02, "The matrix": Tabs and Bare rows).
// Baselines live in test/e2e/__screenshots__/visual/tabs.spec.ts/ and are recorded only inside the Playwright Docker image
// (npm run test:visual:update); a difference is either fixed or approved by updating them in the same pull request.
import {test, expect, type House} from '../fixtures';
import {FULL_CFG, PHONE_TABS, TABLET_TABS} from '../houses';

// the fake clock every visual test starts at, so greetings, the sun, "ago" texts and the day's calendar never move
const AFTERNOON = '2026-11-07T14:00:00-05:00';

const VIEWPORTS = {
  tablet: {width: 1180, height: 820},
  phone: {width: 393, height: 852},
} as const;
const TABS = {tablet: TABLET_TABS, phone: PHONE_TABS};

for (const viewport of ['tablet', 'phone'] as const) {
  test.describe(viewport, () => {
    test.use({viewport: VIEWPORTS[viewport]});

    // opens every tab this screen shows in this house and compares it with its baseline; a mismatch on one tab
    // does not hide the others (soft), so one run lists every screen that changed
    async function captureTabs(house: House, name: (tab: string) => string) {
      for (const t of TABS[viewport]) {
        const button = house.root().locator(`[data-tab="${t}"]`).first();
        if (!(await button.count()) || await button.evaluate(e => (e as HTMLElement).hidden)) continue;
        await house.tab(t);
        if (t === 'auto') await expect(house.root().locator('#pane-auto svg').first()).toBeVisible({timeout: 10_000});
        await expect.soft(house.page).toHaveScreenshot(name(t));
      }
    }

    for (const theme of ['light', 'dark'] as const) {
      for (const lang of ['en', 'fr'] as const) {
        test.describe(`full house, ${theme}, ${lang}`, () => {
          test.use({houseOpts: {cfg: FULL_CFG, theme, lang, time: AFTERNOON, frozen: true}});
          test('every tab', async ({house}) => {
            await captureTabs(house, t => `${t}-${viewport}-${theme}-${lang}.png`);
          });
        });
      }
    }

    test.describe('bare house, light, en', () => {
      test.use({houseOpts: {house: 'bare', time: AFTERNOON, frozen: true}});
      test('every tab', async ({house}) => {
        await captureTabs(house, t => `bare-${t}-${viewport}-light-en.png`);
      });
    });
  });
}
