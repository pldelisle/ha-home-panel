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
      const head = await house.root().locator('.head').boundingBox();
      expect(head!.x).toBeGreaterThanOrEqual(96);
    });

    test('the open section has the pill and the bold label, the others none', async ({house}) => {
      tabletOnly();
      await house.tab('lights');
      const open = house.root().locator('#rail .rtab[aria-selected="true"]');
      // the pill is the item's ::after, which grows in on a spring (a scale on X): 56 x 32, opaque, once it has settled
      const pill = (e: Element) => {
        const cs = getComputedStyle(e, '::after');
        return {w: cs.width, h: cs.height, opacity: cs.opacity, transform: cs.transform, bg: cs.backgroundColor};
      };
      await expect.poll(() => open.evaluate(pill).then(p => p.transform)).toBe('none');
      const settled = await open.evaluate(pill);
      expect([settled.w, settled.h, settled.opacity]).toEqual(['56px', '32px', '1']);
      expect(settled.bg).not.toBe('rgba(0, 0, 0, 0)');
      expect(await open.evaluate(e => getComputedStyle(e).fontWeight)).toBe('600');
      const other = house.root().locator('#rail .rtab[aria-selected="false"]:visible').first();
      expect((await other.evaluate(pill)).opacity).toBe('0');
    });

    test('the keyboard focus ring is drawn on the pill, not on the whole item', async ({house}) => {
      tabletOnly();
      const other = house.root().locator('#rail .rtab[aria-selected="false"]:visible').first();
      await other.focus();
      await house.page.keyboard.press('Shift+Tab');
      await house.page.keyboard.press('Tab');
      const ring = await other.evaluate(e => ({
        item: getComputedStyle(e).outlineStyle,
        pill: getComputedStyle(e, '::after').outlineStyle,
        focused: e.matches(':focus-visible'),
      }));
      expect(ring).toEqual({item: 'none', pill: 'solid', focused: true});
    });

    test('the bar on the phone is 64 px, and the page keeps room under it', async ({house}) => {
      phoneOnly();
      const rail = house.root().locator('#rail');
      const box = await rail.boundingBox();
      expect(box?.height).toBe(64);
      expect(box?.width).toBe(house.page.viewportSize()?.width);
      const padding = await house
        .root()
        .locator('.wrap')
        .evaluate(e => parseFloat(getComputedStyle(e).paddingBottom));
      // the bar's 64 px and 16 px of air (the inset is 0 here)
      expect(padding).toBe(80);
      const cut = await rail
        .locator('.rtab:visible span')
        .evaluateAll(spans => spans.filter(e => e.scrollWidth > e.clientWidth).map(e => e.textContent));
      expect(cut, 'labels cut in the bar').toEqual([]);
    });
  });
}
