// The header's elements (#269): the greeting turns at 5:00 by the clock, the weather chip slims beside a live activity and widens when it
// ends, and the clock's small line says when the history last loaded.
import {test, expect, tabletOnly, phoneOnly, isPhone} from './fixtures';
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

  test('the clock says when the history last loaded', async ({house}) => {
    await expect(house.root().locator('#clock small')).toHaveText('Live · history 2:00 pm');
  });
});

test.describe('the greeting belongs to Home', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T14:00:00-05:00'}});

  test('Home keeps the greeting, the date and the people; Lights drops them for the tab title', async ({house}) => {
    const hello = house.root().locator('#hello');
    await expect(hello.locator('h1')).toBeVisible();
    if (!isPhone(house)) await expect(hello.locator('.status').first()).toBeVisible(); // a phone's Home pane shows them
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
