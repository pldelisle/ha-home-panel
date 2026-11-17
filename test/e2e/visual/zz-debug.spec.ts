// TEMPORARY diagnostic for #260 (removed before merge): prints the French Lights screen's header rows as CI renders them.
import {test, expect, fontsLoaded} from '../fixtures';
import {AFTERNOON, FULL_CFG, KEEP_ENGLISH_NAMES, VIEWPORTS} from '../houses';

for (const viewport of ['tablet', 'phone'] as const)
  for (const theme of ['light', 'dark'] as const)
    test.describe(`zz ${viewport} ${theme}`, () => {
      test.use({
        viewport: VIEWPORTS[viewport],
        houseOpts: {cfg: {...FULL_CFG, names: KEEP_ENGLISH_NAMES}, theme, lang: 'fr', time: AFTERNOON, frozen: true},
      });
      test('zz lights fr', async ({house}) => {
        await fontsLoaded(house);
        await house.tab('lights');
        await expect(house.root().locator('hp-lights-pane hp-al-strip')).toBeVisible();
        await house.page.waitForTimeout(1500);
        const clip =
          viewport === 'tablet' ? {x: 340, y: 170, width: 280, height: 40} : {x: 60, y: 170, width: 333, height: 60};
        const png = (await house.page.screenshot({animations: 'disabled', caret: 'hide', clip})).toString('base64');
        console.log(`ZZCROP ${viewport}-${theme} ${clip.x} ${clip.y} ${png}`);
      });
    });
