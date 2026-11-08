// Montserrat ships with the panel (spec 08): the font comes from the panel's own fonts/ folder, and nothing is asked of
// Google. The fixture already fails any test whose page calls Google's font hosts; this file checks that the font
// arrives from beside home-panel.js, that the page draws with it, and that no tab reaches past the house's server.
import {
  test,
  expect,
  tabletOnly,
  eachShownTab,
  loadedFontWeights,
  FONT_URL,
  FONT_WEIGHTS,
  type House,
} from './fixtures';
import {FULL_CFG} from './houses';

test.beforeEach(tabletOnly);
test.use({houseOpts: {cfg: FULL_CFG}});

// the four weights of the latin subset, the files the test house's text needs (it shows no latin-ext character)
const LATIN = FONT_WEIGHTS.map(w => `montserrat-latin-${w}-normal.woff2`);

// a font-family list that starts with the bundled family, as getComputedStyle writes it
const MONTSERRAT_FIRST = /^["']?Montserrat["']?,/;

// the font-family the first element matching `selector` in the panel is set in
const family = (house: House, selector: string) =>
  house
    .root()
    .locator(selector)
    .first()
    .evaluate(e => getComputedStyle(e).fontFamily);

test("the Home tab draws in Montserrat from the panel's fonts/ folder", async ({house}) => {
  // the weights the Home tab uses arrived; every font file the page received (the fixture records them all, wherever
  // they came from) is one of the panel's, with a 200
  await expect
    .poll(() => house.fonts.map(f => f.url.slice(f.url.lastIndexOf('/') + 1)), 'font files received')
    .toEqual(expect.arrayContaining(LATIN));
  for (const f of house.fonts) {
    expect(f.url).toMatch(FONT_URL);
    expect(f.status, f.url).toBe(200);
  }

  const page = house.page;
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('600 16px Montserrat');
    }),
  ).toBe(true);
  // check() is also true for a family no rule declares, so the loaded faces are asked for too: the panel declares
  // them in the document (Chromium ignores @font-face in its shadow root)
  expect(await loadedFontWeights(house)).toEqual(FONT_WEIGHTS);
  await expect(page.locator('head style#home-panel-fonts')).toHaveCount(1);
  expect(await page.locator('head link[rel="stylesheet"]').count(), 'stylesheet links in the head').toBe(0);
  // and the text uses the family: a heading on the Home pane is drawn in it
  await house.tab('home');
  expect(await family(house, '#pane-home h2')).toMatch(MONTSERRAT_FIRST);
});

test("no tab asks anything of a server other than the house's, and charts and flows draw in Montserrat", async ({
  house,
}) => {
  // the offline check: with the harness server as the only network, every tab draws and every request the page made
  // went to it (the resource timings cover the load, before this test could listen; the listener covers the rest)
  const page = house.page;
  const origin = new URL(page.url()).origin;
  const urls: string[] = [];
  page.on('request', r => urls.push(r.url()));
  await eachShownTab(house, async t => {
    if (t === 'energy') {
      // ApexCharts draws its labels as SVG text in the panel's --f-body
      await expect(house.root().locator('#pane-energy .apexcharts-canvas text').first()).toBeAttached();
      expect(await family(house, '#pane-energy .apexcharts-canvas text')).toMatch(MONTSERRAT_FIRST);
    }
    if (t === 'auto') {
      // Mermaid draws the flow's labels as HTML inside the SVG, in its fontFamily setting (the same --f-body)
      await expect(house.root().locator('#pane-auto .augraph foreignObject span').first()).toBeAttached();
      expect(await family(house, '#pane-auto .augraph foreignObject span')).toMatch(MONTSERRAT_FIRST);
    }
  });
  urls.push(...(await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name))));
  expect(urls.length, 'requests seen').toBeGreaterThan(10);
  expect(urls.filter(u => !u.startsWith(origin + '/') && !u.startsWith('data:'))).toEqual([]);
  expect(house.fonts.every(f => FONT_URL.test(f.url) && f.status === 200)).toBe(true);
  // the family the charts and the flows name is the bundled one, loaded
  expect(await loadedFontWeights(house)).toEqual(FONT_WEIGHTS);
});
