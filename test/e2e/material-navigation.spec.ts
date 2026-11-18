// The Material navigation rail and bar (#466): the sections' labels show whole in the 96 px rail (Automations was cut to "Automatio…" in the
// old rail), in English and in French; the rail stands beside the page and not over it; on the phone the bar is 64 px (plus the inset, 0 here)
// and the page keeps room under its content.
import {test, expect, tabletOnly, phoneOnly, fontsLoaded} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.beforeEach(({house}) => fontsLoaded(house));

for (const lang of ['en', 'fr'] as const) {
  test.describe(`Material navigation, ${lang}`, () => {
    test.use({houseOpts: {cfg: FULL_CFG, lang, design: 'material', time: AFTERNOON, frozen: true}});

    test('the rail on the tablet cuts no label and leaves the page its room', async ({house}) => {
      tabletOnly();
      const rail = house.root().locator('#rail');
      await expect(rail).toBeVisible();
      const box = await rail.boundingBox();
      expect(box?.width).toBe(96);
      expect(box?.x).toBe(0);
      const cut = await rail
        .locator('.rtab:visible span')
        .evaluateAll(spans => spans.filter(e => e.scrollWidth > e.clientWidth).map(e => e.textContent));
      expect(cut, 'labels cut in the rail').toEqual([]);
      expect(await rail.locator('.rtab:visible').count()).toBeGreaterThanOrEqual(9);
      // nothing of the page is under the rail
      const pane = await house.root().locator('.panes').boundingBox();
      expect(pane!.x).toBeGreaterThanOrEqual(96);
    });

    test('the open section has the pill and the bold label, the others none', async ({house}) => {
      tabletOnly();
      await house.tab('lights');
      const open = house.root().locator('#rail .rtab[aria-selected="true"]');
      const icon = open.locator('svg');
      // the pill grows in on a spring: it is 56 x 32 once it has settled
      await expect.poll(() => icon.evaluate(e => e.getBoundingClientRect().width)).toBe(56);
      expect(await icon.evaluate(e => e.getBoundingClientRect().height)).toBe(32);
      expect(await icon.evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      expect(await open.evaluate(e => getComputedStyle(e).fontWeight)).toBe('600');
      const other = house.root().locator('#rail .rtab[aria-selected="false"]:visible svg').first();
      expect(await other.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    });

    test('the bar on the phone is 64 px, and the page keeps room under it', async ({house}) => {
      phoneOnly();
      const rail = house.root().locator('#rail');
      const box = await rail.boundingBox();
      expect(box?.height).toBe(64);
      expect(box?.width).toBe(393);
      const padding = await house
        .root()
        .locator('.wrap')
        .evaluate(e => parseFloat(getComputedStyle(e).paddingBottom));
      expect(padding).toBeGreaterThanOrEqual(64);
      const cut = await rail
        .locator('.rtab:visible span')
        .evaluateAll(spans => spans.filter(e => e.scrollWidth > e.clientWidth).map(e => e.textContent));
      expect(cut, 'labels cut in the bar').toEqual([]);
    });
  });
}
