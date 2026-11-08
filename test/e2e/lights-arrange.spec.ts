// Arrange: drag a room (a linked pair moves as one block) to a new place; the order is saved in Home Assistant's frontend
// system data for every screen, and only admins see the Arrange bar.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect} from './fixtures';
import {LINK_CFG} from './houses';
import {tileTexts} from './lights-links.helpers';

const tabletOnly = () => test.skip(test.info().project.name === 'phone', 'tablet layout');
const phoneOnly = () => test.skip(test.info().project.name === 'tablet', 'phone layout');

test.describe('as an admin', () => {
  // the clock is faked so the test can let a stray service call show up before it ends, without waiting in real time
  test.use({houseOpts: {cfg: LINK_CFG, time: '2026-11-07T12:00:00-05:00'}});

  test('37 dragging Living room onto Island reorders the tiles, saves the order and switches nothing', async ({house}) => {
    tabletOnly();
    const root = house.root();
    await house.tab('lights');
    await expect(root.locator('#ledbar')).toBeVisible();
    await root.locator('#ledit').click();
    await expect(root.locator('#pane-lights')).toHaveClass(/ledit/);
    const centre = async (name: string) => {
      const tile = root.locator('#pane-lights .lcell').filter({has: house.page.locator('.tx b', {hasText: new RegExp(`^${name}$`)})});
      const box = await tile.boundingBox();
      return {x: box!.x + box!.width / 2, y: box!.y + box!.height / 2};
    };
    const from = await centre('Living room'), to = await centre('Island');
    await house.page.mouse.move(from.x, from.y);
    await house.page.mouse.down();
    await house.page.mouse.move(to.x, to.y, {steps: 12});
    await house.page.mouse.up();

    await expect.poll(() => tileTexts(house)).toEqual(['Office', 'Living room', 'Island', 'Sink']);
    await expect.poll(() => house.ws.at(-1)).toEqual({type: 'frontend/set_system_data', key: 'home_panel', value: {light_order: ['office', 'light.kitchen_island']}});

    await root.locator('#ledit').click();
    await expect(root.locator('#pane-lights')).not.toHaveClass(/ledit/);
    await house.clock.runFor(1_100);
    expect(house.calls.filter(c => /^light\./.test(c)), 'arranging switches or dims nothing').toEqual([]);
  });
});

test.describe('with a saved order', () => {
  test.use({houseOpts: {cfg: LINK_CFG, sysdata: {home_panel: {light_order: ['office', 'light.kitchen_island']}}}});

  test('38 the phone follows the saved order', async ({house}) => {
    phoneOnly();
    await expect.poll(() => tileTexts(house)).toEqual(['Office', 'Living room', 'Island', 'Sink']);
  });
});

test.describe('as someone who is not an admin', () => {
  test.use({houseOpts: {cfg: LINK_CFG, admin: false}});

  test('39 the Arrange bar is hidden', async ({house}) => {
    tabletOnly();
    await house.tab('lights');
    const bar = house.root().locator('#ledbar');
    await expect(bar).toHaveCount(1);
    await expect(bar).toBeHidden();
  });
});
