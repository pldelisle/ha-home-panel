// The libraries from npm are lazy chunks: the Home tab fetches none, the tab that needs one fetches it.
// `house.chunks` holds every chunk the panel fetched with its text, so a library is told by what is inside the chunk, not
// by a file name (names carry a content hash).
import {test, expect, tabletOnly} from './fixtures';
import {FULL_CFG} from './houses';

// a property of Mermaid's default export that minifying keeps; only its core chunk has it. Were Mermaid imported
// statically, its core would be in home-panel.js and the Automations tab would fetch only diagram chunks, without it.
const MERMAID = 'mermaidAPI';

test.describe('lazy chunks', () => {
  test.use({houseOpts: {cfg: FULL_CFG}});

  test('Mermaid is fetched when the Automations tab opens, not on Home', async ({house}) => {
    tabletOnly(); // the phone has no Automations tab
    // nothing the panel does at start-up reaches for a chunk: a static import of Mermaid would fetch the chunks the
    // entry then shares with the diagrams
    await house.page.waitForLoadState('networkidle');
    expect(
      house.chunks.map(c => c.url),
      'chunks fetched on the Home tab',
    ).toEqual([]);

    await house.tab('auto');
    await expect(house.root().locator('#pane-auto svg').first()).toBeVisible({timeout: 10_000});
    await expect.poll(() => house.chunksWith(MERMAID), 'chunks holding Mermaid on the Automations tab').toHaveLength(1);
  });

  test("when Mermaid's chunks cannot be fetched each flow says so, and nothing else breaks", async ({house}) => {
    tabletOnly();
    await house.page.route(/\/panel\/chunks\//, r => r.abort());
    await house.tab('auto');
    const graphs = house.root().locator('#pane-auto .augraph');
    await expect(graphs.first()).toContainText("The flow drawing library didn't load");
    await expect(graphs.locator('svg')).toHaveCount(0);
    await house.tab('home');
  });
});
