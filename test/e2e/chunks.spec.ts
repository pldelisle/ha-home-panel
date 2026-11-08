// The charts library is a lazy chunk: the Home tab does not fetch it, the first tab that draws a chart fetches it once.
// `house.chunks` holds every chunk the panel fetched with its text, so a library is told by what is inside the chunk, not
// by a file name (names carry a content hash).
import {test, expect, tabletOnly} from './fixtures';
import {FULL_CFG} from './houses';

// ApexCharts' export name; the chunk is the only file under chunks/ that has it
const APEX = 'ApexCharts';

test.describe('lazy chunks', () => {
  test.use({houseOpts: {cfg: FULL_CFG}});

  test('the charts library is fetched when the Energy tab opens, not on Home', async ({house}) => {
    tabletOnly();
    // nothing the panel does at start-up reaches for it
    await house.page.waitForLoadState('networkidle');
    expect(house.chunksWith(APEX), 'chunks holding ApexCharts on the Home tab').toEqual([]);

    await house.tab('energy');
    await expect.poll(() => house.chunksWith(APEX), 'chunks holding ApexCharts on the Energy tab').toHaveLength(1);
    const [apex] = house.chunksWith(APEX);
    // the chart is drawn, with the library's stylesheet in the panel's own #apexcss
    await expect(house.root().locator('#pane-energy .apexcharts-canvas').first()).toBeVisible();
    expect(
      await house
        .root()
        .locator('#apexcss')
        .evaluate(e => e.textContent),
    ).toContain('.apexcharts-canvas');

    // the second tab with charts reuses it: no further request for the library
    await house.tab('climate');
    await expect(house.root().locator('#pane-climate .apexcharts-canvas').first()).toBeVisible();
    expect(house.chunksWith(APEX)).toEqual([apex]);
  });

  test('the Weather tab, opened first, fetches the library and draws its charts', async ({house}) => {
    tabletOnly();
    await house.page.waitForLoadState('networkidle');
    await house.tab('weather');
    await expect.poll(() => house.chunksWith(APEX)).toHaveLength(1);
    // the seven-day chart, drawn beside the history once the library is there
    await expect(house.root().locator('#c-w7 .apexcharts-canvas')).toBeVisible();
  });

  test('when the chunk cannot be fetched the panel says so, and nothing else breaks', async ({house}) => {
    tabletOnly();
    await house.page.route(/\/panel\/chunks\//, r => r.abort());
    await house.tab('energy');
    await expect(house.root().locator('#toast')).toContainText('Charts library failed to load');
    expect(house.chunksWith(APEX)).toEqual([]);
    await house.tab('home');
  });
});
