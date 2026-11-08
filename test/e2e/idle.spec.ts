// The idle clock: it shows after five minutes without a touch (the clock is faked, so time passes on command), carries the
// outdoor condition's icon beside the time (2.2.0), and a tap wakes the panel. Phones never go idle on their own.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect} from './fixtures';
import {FULL_CFG} from './houses';

const IDLE_AFTER_MS = 5 * 60_000;

test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T14:00:00-05:00'}});
test.beforeEach(() => test.skip(test.info().project.name === 'phone', 'tablet layout'));

test('8 after five minutes the idle clock shows with the weather icon', async ({house}) => {
  await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
  await expect(house.root().locator('#idle')).toBeVisible();
  await expect(house.root().locator('#iwrap .iclk2 .wxi')).toHaveAttribute('aria-label', 'Mainly sunny');
});

test('9 a tap on the idle clock wakes the panel', async ({house}) => {
  await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
  await expect(house.root().locator('#idle')).toBeVisible();
  await house.root().locator('#idle').click();
  await expect(house.root().locator('#idle')).toBeHidden();
  await expect(house.root().locator('#pane-home')).toBeVisible();
});
