// The libraries are lazy chunks: the Home tab fetches none, the first tab that draws a chart fetches ApexCharts once, and
// the Automations tab fetches Mermaid. `house.chunkRequests` lists what the panel asked for under chunks/ and
// `house.chunks` what arrived, with its text, so a library is told by what is inside the chunk, not by a file name
// (names carry a content hash).
import {test, expect, tabletOnly, CHUNK_URL} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

// ApexCharts' export name; the chunk is the only file under chunks/ that has it
const APEX = 'ApexCharts';
// a property of Mermaid's default export that minifying keeps; only Mermaid's core chunk has it. Were Mermaid imported
// statically, its core would be in home-panel.js and the Automations tab would fetch only diagram chunks, without it.
const MERMAID = 'mermaidAPI';

test.beforeEach(tabletOnly);

test.describe('lazy chunks', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});

  test('the charts library is fetched when the Energy tab opens, not on Home', async ({house}) => {
    // four minutes pass on Home (the idle screen comes at five): a timer that fetched the library later would fire
    await house.clock.runFor(4 * 60_000);
    expect(house.chunkRequests, 'chunks asked for on the Home tab').toEqual([]);

    await house.tab('energy');
    await expect.poll(() => house.chunksWith(APEX), 'chunks holding ApexCharts on the Energy tab').toHaveLength(1);
    const [apex] = house.chunksWith(APEX);
    // the chart is drawn, with the library's stylesheet in the panel's own #apexcss
    await expect(house.root().locator('#pane-energy .apexcharts-canvas').first()).toBeVisible();
    await expect
      .poll(() =>
        house
          .root()
          .locator('#apexcss')
          .evaluate(e => e.textContent),
      )
      .toContain('.apexcharts-canvas');

    // the second tab with charts reuses it: no further request for the library
    await house.tab('climate');
    await expect(house.root().locator('#pane-climate .apexcharts-canvas').first()).toBeVisible();
    await expect.poll(() => house.chunksWith(APEX)).toEqual([apex]);
    expect(house.chunkRequests).toEqual([apex]);
  });

  test('the Weather tab, opened first, fetches the library and draws its charts', async ({house}) => {
    await house.clock.runFor(60_000);
    expect(house.chunkRequests, 'chunks asked for on the Home tab').toEqual([]);
    await house.tab('weather');
    await expect.poll(() => house.chunksWith(APEX)).toHaveLength(1);
    // the seven-day chart, drawn beside the history once the library is there
    await expect(house.root().locator('#c-w7 .apexcharts-canvas')).toBeVisible();
  });

  test('when the chunk cannot be fetched the panel says so, and nothing else breaks', async ({house}) => {
    await house.page.route(CHUNK_URL, r => r.abort());
    await house.tab('energy');
    await expect(house.root().locator('#toast')).toContainText('Charts library failed to load');
    expect(house.chunksWith(APEX)).toEqual([]);
    await house.tab('home');
  });

  test('a Weather tab reopened while the chunk is still loading is drawn once', async ({house}) => {
    // hold the chunk back, open Weather, leave and open it again, then let the chunk through
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await house.page.route(CHUNK_URL, async r => {
      await gate;
      await r.continue();
    });
    // count the charts the panel puts on screen: a sheet drawn twice adds each canvas twice
    let canvases = 0;
    await house.page.exposeFunction('canvasAdded', () => canvases++);
    await house.root().evaluate(el => {
      new MutationObserver(records => {
        for (const r of records)
          for (const n of r.addedNodes)
            if (n instanceof Element && n.classList.contains('apexcharts-canvas'))
              (window as unknown as {canvasAdded(): void}).canvasAdded();
      }).observe(el.shadowRoot!, {subtree: true, childList: true});
    });
    await house.tab('weather');
    await house.tab('home');
    await house.tab('weather');
    release();
    await expect(house.root().locator('#c-wpres .apexcharts-canvas')).toBeVisible();
    // let a second draw, if there were one, happen before counting
    await house.page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    expect(canvases, 'charts drawn: the seven-day, wind and pressure charts, once each').toBe(3);
  });
  test('a tap on a range tab while the chunk is still loading breaks nothing, and the chart is drawn when it lands', async ({
    house,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await house.page.route(CHUNK_URL, async r => {
      await gate;
      await r.continue();
    });
    await house.tab('energy');
    // the fixture fails the test on the page error a chart drawn without the library would throw
    await house.root().locator('#etabs .tab').nth(1).click();
    release();
    await expect(house.root().locator('#pane-energy .apexcharts-canvas').first()).toBeVisible();
  });

  test('Mermaid is fetched when the Automations tab opens, not on Home', async ({house}) => {
    // four minutes pass on Home (the idle screen comes at five): a timer that fetched Mermaid later would fire
    await house.clock.runFor(4 * 60_000);
    expect(house.chunkRequests, 'chunks asked for on the Home tab').toEqual([]);

    await house.tab('auto');
    await expect(house.root().locator('#pane-auto svg').first()).toBeVisible({timeout: 10_000});
    await expect.poll(() => house.chunksWith(MERMAID), 'chunks holding Mermaid on the Automations tab').toHaveLength(1);
  });

  test("when Mermaid's chunks cannot be fetched each flow says so, and nothing else breaks", async ({house}) => {
    await house.page.route(CHUNK_URL, r => r.abort());
    await house.tab('auto');
    const graphs = house.root().locator('#pane-auto .augraph');
    await expect(graphs.first()).toContainText("The flow drawing library didn't load");
    await expect(graphs.locator('svg')).toHaveCount(0);
    await house.tab('home');
  });
});
