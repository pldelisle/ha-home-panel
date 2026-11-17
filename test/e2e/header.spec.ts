// The header's elements (#269): the greeting turns at 5:00 by the clock, the weather chip slims beside a live activity and widens when it
// ends, and the clock's small line says when the history last loaded.
import {test, expect, tabletOnly} from './fixtures';
import {FULL_CFG} from './houses';
import {stopCharging} from './live';

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
