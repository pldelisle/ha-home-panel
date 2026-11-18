// The header's elements (#269): the greeting turns at 5:00 by the clock, the weather chip slims beside a live activity and widens when it
// ends, and the clock's small line says when the history last loaded.
import {test, expect, tabletOnly, phoneOnly} from './fixtures';
import {FULL_CFG} from './houses';
import {pill, stopCharging} from './live';

test.describe('at 4:59 in the morning', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T04:59:30-05:00'}});

  test('the greeting says good night, then good morning once the clock passes 5:00', async ({house}) => {
    const heading = house.root().locator('#hello h1');
    await expect(heading).toHaveText(/^\s*Good night/);
    await house.clock.runFor(40_000); // the greeting looks at the clock every twenty seconds
    await expect(heading).toHaveText(/^\s*Good morning/);
  });
});

test.describe('in the afternoon', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T14:00:00-05:00'}});
  test.beforeEach(() => tabletOnly()); // a phone's header has no weather chip and no clock

  test('the weather chip shows only its temperature while the car charges, and its condition once it stops', async ({
    house,
  }) => {
    const condition = house.root().locator('hp-weather-chip').locator('small');
    await expect(house.root().locator('hp-weather-chip')).toHaveAttribute('slim', '');
    await expect(condition).toBeHidden();
    await stopCharging(house);
    await expect(condition).toBeVisible();
  });

  test('the clock has no line while the history is fresh; Home says when it was updated once the recorder has stayed down past the interval, and Lights, with no history, never does', async ({
    house,
  }) => {
    await house.root().locator('#gear').click(); // the settings' foot says the history has loaded
    await expect(house.root().locator('#setpop .ccv')).toContainText('statistics refreshed');
    await house.root().locator('#gear').click();
    const note = house.root().locator('#clock small');
    await expect(house.root().locator('#clock')).toBeVisible();
    await expect(note).toHaveCount(0);
    await house.page.evaluate(() => window.house.failStatistics('all')); // Home asks again each minute once the 15 minutes are up, and is not answered
    await house.clock.runFor(20 * 60_000);
    await expect(note).toHaveText('Updated 2:00 pm');
    await house.tab('lights'); // no history on this pane: nothing to say about it
    await expect(note).toHaveCount(0);
    // each failed read is logged by the reader that asked, and the fixture would fail on it
    expect(house.errors.every(e => /^home-panel (stack|live|home) history .*the recorder is down/.test(e))).toBe(true);
    house.errors.length = 0;
  });
});

test.describe('the greeting belongs to Home', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T14:00:00-05:00'}});

  test('Home keeps the greeting with its date and temperatures as its only title; Lights drops them for the tab title', async ({
    house,
  }) => {
    const hello = house.root().locator('#hello');
    await expect(hello.locator('h1')).toBeVisible();
    await expect(hello.locator('div')).toContainText(/Saturday, November 7 · .*inside/);
    await expect(house.root().locator('#pane-home hp-pane-header')).toHaveCount(0); // no second title under the greeting
    await expect(house.root().locator('hp-who-chips')).toHaveCount(1); // Who is home is the card, not the greeting too
    await house.tab('lights');
    await expect(hello).toBeHidden();
    await expect(house.root().locator('#gear')).toBeVisible();
  });

  test('every tab has exactly one h1: the greeting on Home, a hidden name for the panel everywhere else', async ({
    house,
  }) => {
    const headings = house.root().getByRole('heading', {level: 1}); // the greeting's, hidden off Home, is not in the page's outline
    await expect(headings).toHaveCount(1);
    await expect(headings).toContainText('Good afternoon');
    await house.tab('lights');
    await expect(headings).toHaveCount(1);
    await expect(headings).toHaveText('Home panel');
    expect(await headings.boundingBox().then(box => (box ? box.width * box.height : 0))).toBeLessThanOrEqual(1);
  });

  test('on a tablet the clock and Settings stay above the tab header', async ({house}) => {
    tabletOnly();
    await house.tab('lights');
    const clock = await house.root().locator('#clock').boundingBox();
    const title = await house.root().locator('#pane-lights hp-pane-header h2').boundingBox();
    expect(clock!.y + clock!.height).toBeLessThanOrEqual(title!.y);
    await expect(house.root().locator('#gear')).toBeVisible();
  });

  test('on a phone the menu button and Settings share one row, and the title starts near the top', async ({house}) => {
    phoneOnly();
    await house.tab('lights');
    const menu = await house.root().locator('#menu').boundingBox();
    const gear = await house.root().locator('#gear').boundingBox();
    expect(Math.abs(menu!.y + menu!.height / 2 - (gear!.y + gear!.height / 2))).toBeLessThan(4);
    expect(gear!.x + gear!.width).toBeLessThanOrEqual(393);
    const live = await pill(house).boundingBox(); // the car charges in this house: the pill shows between them
    expect(live!.x).toBeGreaterThan(menu!.x + menu!.width);
    expect(live!.x + live!.width).toBeLessThanOrEqual(gear!.x);
    expect(Math.abs(live!.y + live!.height / 2 - (menu!.y + menu!.height / 2))).toBeLessThan(4);
    const title = await house.root().locator('#pane-lights hp-pane-header h2').boundingBox();
    expect(title!.y).toBeLessThan(100);
  });
});

// the header never moves between tabs, at the tablet's two widths and in both languages
for (const {lang, viewport} of [
  {lang: 'en', viewport: {width: 1180, height: 820}},
  {lang: 'fr', viewport: {width: 1024, height: 768}},
] as const) {
  test.describe(`the header's place, ${lang} at ${viewport.width}`, () => {
    test.use({viewport, houseOpts: {cfg: FULL_CFG, lang, time: '2026-11-07T14:00:00-05:00'}});

    test('the clock, the weather, the live pill and the gear sit in the same place on Home and on Lights', async ({
      house,
    }) => {
      tabletOnly();
      const parts = ['#clock', 'hp-weather-chip .wx', '#chips .attchip', '#gear'];
      const boxes = () => Promise.all(parts.map(part => house.root().locator(part).boundingBox()));
      await expect(pill(house)).toBeVisible(); // the car charges in this house
      const onHome = await boxes();
      await house.tab('lights');
      await expect(pill(house)).toBeVisible();
      expect(await boxes()).toEqual(onHome);
    });
  });
}
