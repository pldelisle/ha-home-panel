// Montserrat ships with the panel (spec 08): the font comes from the panel's own fonts/ folder, and nothing is asked of
// Google. The fixture already fails any test whose page calls Google's font hosts; this file checks that the font
// arrives from beside home-panel.js, that the page draws with it, and that no tab reaches past the house's server.
import {test, expect, tabletOnly, eachShownTab, FONT_URL, type House} from './fixtures';
import {FULL_CFG} from './houses';

test.beforeEach(tabletOnly);
test.use({houseOpts: {cfg: FULL_CFG}});

// the four weights of the latin subset, the files the test house's text needs (it shows no latin-ext character)
const LATIN = [400, 500, 600, 700].map(w => `montserrat-latin-${w}-normal.woff2`);

// the weights of Montserrat the document has loaded. document.fonts.check() is true for a family no rule declares at
// all, so the faces themselves are asked for: the panel declares them in the document (Chromium ignores @font-face in
// its shadow root), and a loaded face is one whose file arrived
const loadedWeights = (house: House) =>
  house.page.evaluate(() =>
    [...document.fonts]
      .filter(f => f.family.replaceAll(/["']/g, '') === 'Montserrat' && f.status === 'loaded')
      .map(f => f.weight)
      .sort(),
  );

test("the Home tab draws in Montserrat from the panel's fonts/ folder", async ({house}) => {
  // every font the panel asked for came from /panel/fonts/ with a 200; the weights the Home tab uses are among them
  await expect
    .poll(() => house.fonts.map(f => f.url.slice(f.url.lastIndexOf('/') + 1)), 'files fetched from /panel/fonts/')
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
  expect(await loadedWeights(house)).toEqual(['400', '500', '600', '700']);
  await expect(page.locator('head style#home-panel-fonts')).toHaveCount(1);
  expect(await page.locator('head link[rel="stylesheet"]').count(), 'stylesheet links in the head').toBe(0);
  // and the text uses the family: a heading on the Home pane is drawn in it
  await house.tab('home');
  expect(
    await house
      .root()
      .locator('#pane-home h2')
      .evaluate(e => getComputedStyle(e).fontFamily),
  ).toMatch(/^["']?Montserrat["']?,/);
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
  const family = (selector: string) =>
    house
      .root()
      .locator(selector)
      .first()
      .evaluate(e => getComputedStyle(e).fontFamily);
  await eachShownTab(house, async t => {
    if (t === 'energy') {
      // ApexCharts draws its labels as SVG text in the panel's --f-body
      await expect(house.root().locator('#pane-energy .apexcharts-canvas text').first()).toBeAttached();
      expect(await family('#pane-energy .apexcharts-canvas text')).toMatch(/^["']?Montserrat["']?,/);
    }
    if (t === 'auto') {
      // Mermaid draws the flow's labels as HTML inside the SVG, in its fontFamily setting (the same --f-body)
      await expect(house.root().locator('#pane-auto .augraph foreignObject span').first()).toBeAttached();
      expect(await family('#pane-auto .augraph foreignObject span')).toMatch(/^["']?Montserrat["']?,/);
    }
  });
  urls.push(...(await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name))));
  expect(urls.length, 'requests seen').toBeGreaterThan(10);
  expect(urls.filter(u => !u.startsWith(origin + '/') && !u.startsWith('data:'))).toEqual([]);
  expect(house.fonts.every(f => f.status === 200)).toBe(true);
  // the family the charts and the flows name is the bundled one, loaded
  expect(await loadedWeights(house)).toEqual(['400', '500', '600', '700']);
});
