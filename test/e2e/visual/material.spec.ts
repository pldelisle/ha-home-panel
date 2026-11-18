// The Material design, colour only (ADR 0037, #460): the Home tab on the tablet in light and dark, and on the phone in light, in the
// full house with `home-panel-design` set to material before the page loads. Later tickets of the Material epic add their own shots.
// Baselines live in test/e2e/__screenshots__/visual/material.spec.ts/ and are recorded only inside the Playwright image (Docker or
// `container`: npm run test:visual:update); a difference is either fixed or approved by updating them in the same pull request.
import {test, expect, fontsLoaded} from '../fixtures';
import {AFTERNOON, FULL_CFG, VIEWPORTS} from '../houses';

// every screenshot shows the bundled Manrope, never the fallback it swaps from (font-display: swap)
test.beforeEach(({house}) => fontsLoaded(house));

const SHOTS = [
  {viewport: 'tablet', theme: 'light'},
  {viewport: 'tablet', theme: 'dark'},
  {viewport: 'phone', theme: 'light'},
] as const;

for (const {viewport, theme} of SHOTS) {
  test.describe(`${viewport}, ${theme}`, () => {
    test.use({
      viewport: VIEWPORTS[viewport],
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('Home in Material', async ({house}) => {
      await house.tab('home');
      // the frame is Material's: no glass, and the scheme's surface under the cards
      await expect(house.root().locator('.app')).toHaveAttribute('data-design', 'material');
      await expect(house.root().locator('.app')).not.toHaveClass(/\bgl\b/);
      await expect(house.page).toHaveScreenshot(`material-home-${viewport}-${theme}-en.png`);
    });
  });
}
