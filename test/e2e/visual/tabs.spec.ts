// One screenshot per tab, per viewport, theme and language (spec 02, "The matrix": Tabs and Bare rows).
// Baselines live in test/e2e/__screenshots__/visual/tabs.spec.ts/ and are recorded only inside the Playwright image (Docker or
// `container`: npm run test:visual:update); a difference is either fixed or approved by updating them in the same pull request.
import {test, expect, eachShownTab, fontsLoaded, type House} from '../fixtures';
import {AFTERNOON, FULL_CFG, PHONE_TABS, TABLET_TABS, VIEWPORTS} from '../houses';

const TABS = {tablet: TABLET_TABS, phone: PHONE_TABS};

// every screenshot shows the bundled Montserrat, never the fallback it swaps from, and the charts and flows drawn after
// this measure their labels in it
test.beforeEach(({house}) => fontsLoaded(house));

for (const viewport of ['tablet', 'phone'] as const) {
  test.describe(viewport, () => {
    test.use({viewport: VIEWPORTS[viewport]});

    // opens every tab this screen shows in this house and compares it with its baseline; a mismatch on one tab
    // does not hide the others (soft), so one run lists every screen that changed
    async function captureTabs(house: House, name: (tab: string) => string, withFlows: boolean) {
      return eachShownTab(house, async t => {
        // the flows are drawn once Mermaid's chunk has loaded, and while it loads no frame changes, so two identical frames
        // can show the empty flow card: wait for every flow box to hold its drawing (the panel marks it data-drawn in the
        // task that inserts it). Not `#pane-auto svg`: the pane's title badge is an svg too, so that passed at once (#94)
        if (t === 'auto' && withFlows) {
          await expect(house.root().locator('#pane-auto .augraph svg').first()).toBeVisible({timeout: 10_000});
          await expect(house.root().locator('#pane-auto .augraph:not([data-drawn])')).toHaveCount(0);
        }
        await expect.soft(house.page).toHaveScreenshot(name(t));
      });
    }

    for (const theme of ['light', 'dark'] as const) {
      for (const lang of ['en', 'fr'] as const) {
        test.describe(`full house, ${theme}, ${lang}`, () => {
          test.use({houseOpts: {cfg: FULL_CFG, theme, lang, time: AFTERNOON, frozen: true}});
          test('every tab', async ({house}) => {
            const captured = await captureTabs(house, t => `${t}-${viewport}-${theme}-${lang}.png`, true);
            // the full house shows every tab; one that went missing must fail here, not shrink the baseline set quietly
            expect(captured, 'tabs captured').toEqual(TABS[viewport]);
          });
        });
      }
    }

    // the bare house hides the tabs whose entities it lacks, so only here may a tab be skipped
    test.describe('bare house, light, en', () => {
      test.use({houseOpts: {house: 'bare', time: AFTERNOON, frozen: true}});
      test('every tab', async ({house}) => {
        await captureTabs(house, t => `bare-${t}-${viewport}-light-en.png`, false); // no automations, so no flow
      });
    });
  });
}
