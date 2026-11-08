// The idle clock: it shows after five minutes without a touch (the clock is faked, so time passes on command), carries the
// outdoor condition's icon beside the time (2.2.0), and a tap wakes the panel. Phones never go idle on their own.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect, tabletOnly, IDLE_AFTER_MS} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T14:00:00-05:00'}});
test.beforeEach(tabletOnly);

test('8 after five minutes the idle clock shows with the weather icon', async ({house}) => {
  await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
  await expect(house.root().locator('#idle')).toBeVisible();
  await expect(house.root().locator('#iwrap .iclk2 .wxi')).toHaveAttribute('aria-label', 'Mainly sunny');
});

test('9 a tap on the idle clock wakes the panel', async ({house}) => {
  await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
  await expect(house.root().locator('#idle')).toBeVisible();
  await house.root().locator('#idle').click({position: {x: 10, y: 10}}); // a corner: the centre could land on a stack card
  await expect(house.root().locator('#idle')).toBeHidden();
  await expect(house.root().locator('#rail')).toHaveCSS('opacity', '1'); // not stuck in idle mode, which fades everything
  await house.tab('lights'); // the click fails if an overlay still covers the rail
});
