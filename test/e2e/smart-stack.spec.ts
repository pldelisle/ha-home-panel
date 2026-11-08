// Smart stack (2.5.0): at 11:30 pm the plugged-in car and the playing speaker take turns beside the idle clock, and (2.9.0)
// the same stack fills the Home card on a tablet. A tap opens what the card is about. Time is faked, so cards turn on command.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect, type House} from './fixtures';
import {FULL_CFG} from './houses';

const IDLE_AFTER_MS = 5 * 60_000;
const STACK_TURN_MS = 20_000;
const NIGHT = '2026-11-07T23:30:00-05:00';

const isPhone = () => test.info().project.name === 'phone';
const goIdle = async (house: House) => {
  await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
  await expect(house.root().locator('#istk .sc')).toBeVisible();
};
const cardKey = (house: House, stack: '#hstk' | '#istk') => house.root().locator(`${stack} .sc`).getAttribute('data-k');

test.describe('tablet', () => {
  test.beforeEach(() => test.skip(isPhone(), 'tablet layout'));
  test.use({houseOpts: {cfg: FULL_CFG, time: NIGHT}});

  test('16 the Home card shows the stack without growing taller than the tiles beside it', async ({house}) => {
    const stack = house.root().locator('#hstk');
    await expect(stack).toBeVisible();
    expect(['car', 'music']).toContain(await cardKey(house, '#hstk'));
    await expect(stack.locator('.sdots i')).toHaveCount(2);
    const [card, tiles] = await Promise.all([house.root().locator('#hwx').boundingBox(), house.root().locator('.hright').boundingBox()]);
    expect(card!.height, 'the Home card is no taller than the tiles and Security beside it').toBeLessThanOrEqual(tiles!.height + 1);
  });

  test('17 a tap on the Home card opens what it is about', async ({house}) => {
    const k = await cardKey(house, '#hstk');
    await house.root().locator('#hstk .sc').click();
    await expect(house.root().locator(k === 'car' ? '#pane-car' : '#pane-media')).toBeVisible();
  });

  test('18 the car and the speaker take turns beside the idle clock', async ({house}) => {
    await goIdle(house);
    const seen: Array<[string | null, number]> = [];
    for (let i = 0; i < 2; i++) {
      seen.push([await cardKey(house, '#istk'), await house.root().locator('#istk .sdots i').count()]);
      await house.clock.runFor(STACK_TURN_MS);
    }
    expect(seen.map(s => s[0]).sort(), `the car and the speaker take turns (got ${JSON.stringify(seen)})`).toEqual(['car', 'music']);
    expect(seen.map(s => s[1]), 'two dots for two cards').toEqual([2, 2]);
    await expect(house.root().locator('#iwrap .iclk2 .wxi'), 'the clock keeps its weather icon').toBeVisible();
  });

  test('19 a tap on the car card wakes the panel and leads to the car', async ({house}) => {
    await goIdle(house);
    for (let i = 0; i < 2 && (await cardKey(house, '#istk')) !== 'car'; i++) await house.clock.runFor(STACK_TURN_MS);
    expect(await cardKey(house, '#istk')).toBe('car');
    await house.root().locator('#istk .sc').click();
    await expect(house.root().locator('#idle')).toBeHidden();
    await expect(house.root().locator('#pane-car')).toBeVisible();
  });
});

test.describe('phone', () => {
  test.beforeEach(() => test.skip(!isPhone(), 'phone layout'));
  test.use({houseOpts: {cfg: FULL_CFG, time: NIGHT}});

  test('20 a phone keeps its Home card without the stack; on the idle clock the card sits under the clock', async ({house}) => {
    await expect(house.root().locator('#hstk')).toHaveCount(0);
    // phones never go idle on their own; "Sleep now" in the settings starts the clock
    await house.root().locator('#gear').click();
    await house.root().locator('[data-sleep]').click();
    await expect(house.root().locator('#istk .sc')).toBeVisible();
    const [card, clock, view] = await Promise.all([
      house.root().locator('#istk .sc').boundingBox(),
      house.root().locator('#iclk').boundingBox(),
      house.page.viewportSize(),
    ]);
    expect(card!.y, 'under the clock').toBeGreaterThanOrEqual(clock!.y + clock!.height - 1);
    expect(card!.x, 'inside the screen on the left').toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width, 'inside the screen on the right').toBeLessThanOrEqual(view!.width);
  });
});

test.describe('idle_stack disabled', () => {
  test.beforeEach(() => test.skip(isPhone(), 'tablet layout'));
  test.use({houseOpts: {cfg: {...FULL_CFG, idle_stack: {enabled: false}}, time: NIGHT}});

  test('21 the clock stays alone and the Home card has no stack', async ({house}) => {
    await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
    await expect(house.root().locator('#idle')).toBeVisible();
    await expect(house.root().locator('#iwrap .sc')).toHaveCount(0);
    await expect(house.root().locator('#hstk')).toBeHidden();
  });
});
