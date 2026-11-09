// The idle clock: it shows after five minutes without a touch (the clock is faked, so time passes on command), carries the
// outdoor condition's icon beside the time (2.2.0), and a tap wakes the panel. Phones never go idle on their own.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect, tabletOnly, IDLE_AFTER_MS} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';
import {NIGHT} from './idle';

const CLOCK_TICK_MS = 20_000;
// how far renderIdle nudges the clock block from where it sits: at most 20 px sideways and 15 px up or down
const MAX_DRIFT_X = 20,
  MAX_DRIFT_Y = 15;

test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});
test.beforeEach(tabletOnly);

test('8 after five minutes the idle clock shows with the weather icon', async ({house}) => {
  await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
  await expect(house.root().locator('#idle')).toBeVisible();
  await expect(house.root().locator('#iwrap .iclk2 .wxi')).toHaveAttribute('aria-label', 'Mainly sunny');
});

test('9 a tap on the idle clock wakes the panel', async ({house}) => {
  await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
  await expect(house.root().locator('#idle')).toBeVisible();
  await house
    .root()
    .locator('#idle')
    .click({position: {x: 10, y: 10}}); // a corner: the centre could land on a stack card
  await expect(house.root().locator('#idle')).toBeHidden();
  await expect(house.root().locator('#rail')).toHaveCSS('opacity', '1'); // not stuck in idle mode, which fades everything
  await house.tab('lights'); // the click fails if an overlay still covers the rail
});

// The screenshots pin Math.random so the block does not move; this is the one check of the drift they hide (burn-in protection).
test('40 the idle clock drifts a little on every tick, never further than 20 px sideways and 15 px up or down', async ({
  house,
}) => {
  await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
  await expect(house.root().locator('#idle')).toBeVisible();
  const offsets: Array<[number, number]> = [];
  for (let tick = 0; tick < 10; tick++) {
    const transform = await house
      .root()
      .locator('#iwrap')
      .evaluate(e => (e as HTMLElement).style.transform);
    const m = /^translate\((-?\d+)px,\s*(-?\d+)px\)$/.exec(transform);
    expect(m, `#iwrap carries a translate (got "${transform}")`).not.toBeNull();
    offsets.push([Number(m![1]), Number(m![2])]);
    await house.clock.runFor(CLOCK_TICK_MS);
  }
  for (const [x, y] of offsets) {
    expect(Math.abs(x), `sideways drift in ${JSON.stringify(offsets)}`).toBeLessThanOrEqual(MAX_DRIFT_X);
    expect(Math.abs(y), `up/down drift in ${JSON.stringify(offsets)}`).toBeLessThanOrEqual(MAX_DRIFT_Y);
  }
  // a repeat by chance is about 1 in 1,300 per tick, so 7 moves in 9 ticks leaves room for bad luck and still fails a block that sits still
  const moves = offsets.filter((o, i) => i > 0 && o.join(',') !== offsets[i - 1].join(',')).length;
  expect(moves, `the block moves on most ticks (got ${JSON.stringify(offsets)})`).toBeGreaterThanOrEqual(7);
});

// An upright iPad is a portrait screen: the clock and the stack sit in a column there, side by side on a landscape one.
// The rule is a media query that Lightning CSS minifies (spec 06, As built #69); this is what notices it breaking.
for (const [name, viewport, direction] of [
  ['portrait', {width: 820, height: 1180}, 'column'],
  ['landscape', {width: 1180, height: 820}, 'row'],
] as const) {
  test.describe(`${name} screen`, () => {
    // at night the car charges and the speaker plays, so the idle clock has a stack beside it
    test.use({viewport, houseOpts: {cfg: FULL_CFG, time: NIGHT}});
    test(`47 on a ${name} screen the idle clock and its stack sit in a ${direction}`, async ({house}) => {
      await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
      await expect(house.root().locator('#idle')).toBeVisible();
      await expect(house.root().locator('#iwrap .ss')).toHaveCSS('flex-direction', direction);
    });
  });
}
