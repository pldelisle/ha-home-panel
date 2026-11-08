// Linked rooms: two rooms (or a kitchen's two groups) shown as one block and switched together, the sheet's Linked with
// row that picks the partner and saves the pairs in Home Assistant's frontend system data (admin-only).
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect} from './fixtures';
import {LINK_CFG} from './houses';
import {OFFICE_TILE, tileNames} from './lights';

const tabletOnly = () => test.skip(test.info().project.name === 'phone', 'tablet layout');
const phoneOnly = () => test.skip(test.info().project.name === 'tablet', 'phone layout');

test.describe('as an admin', () => {
  test.use({houseOpts: {cfg: LINK_CFG}});

  test('32 the tiles read Island, Sink, Office, Living room and two linked pairs are shown', async ({house}) => {
    tabletOnly();
    await expect.poll(() => tileNames(house)).toEqual(['Island', 'Sink', 'Office', 'Living room']);
    await expect(house.root().locator('#pane-lights .llink.on')).toHaveCount(2);
  });

  test("33 a linked tile's bulb switches both rooms' lights in one call", async ({house}) => {
    tabletOnly();
    await house.tab('lights');
    await house.root().locator('#pane-lights .lbulb[data-a="light.kitchen_sink"]').click();
    await expect
      .poll(
        () => house.calls.some(c => /^light\.turn_(on|off) .*kitchen_(island|sink)_1.*kitchen_(island|sink)_1/.test(c)),
        `a linked tile's bulb reaches both rooms (calls: ${house.calls.join('; ')})`,
      )
      .toBe(true);
  });

  test('34 the Linked with row picks the partner, saves the pairs and Back returns to the room', async ({house}) => {
    tabletOnly();
    const root = house.root();
    await house.tab('lights');
    await root.locator('#pane-lights .lcell[data-lsheet="light.kitchen_island"] .tx').click();
    await expect(root.locator('#lsheet .lnav .lval')).toHaveText('Sink');

    await root.locator('#lsheet .lnav').click();
    const options = () =>
      root
        .locator('#lsheet .lopt')
        .evaluateAll(os => os.map(o => [o.querySelector('b')!.textContent, o.getAttribute('aria-checked')]));
    await expect.poll(options).toEqual([
      ['None', 'false'],
      ['Sink', 'true'],
      ['Office', 'false'],
      ['Living room', 'false'],
    ]);

    await root.locator('#lsheet .lopt[data-al=""]').click();
    await expect
      .poll(() => house.ws.at(-1))
      .toEqual({
        type: 'frontend/set_system_data',
        key: 'home_panel',
        value: {light_links: [['office', 'living_room']]},
      });
    await expect(root.locator('#pane-lights .llink.on')).toHaveCount(1);

    await root.locator('#lsheet .lopt[data-al="living_room"]').click();
    await expect
      .poll(() => house.ws.at(-1))
      .toEqual({
        type: 'frontend/set_system_data',
        key: 'home_panel',
        value: {light_links: [['light.kitchen_island', 'living_room']]},
      });
    await expect
      .poll(
        () => house.calls.some(c => /^light\.turn_on .*living_room_1/.test(c)),
        `the new partner starts out matching (calls: ${house.calls.join('; ')})`,
      )
      .toBe(true);

    await root.locator('#lsheet .lback').click();
    await expect(root.locator('#lsheet .lpill').first()).toBeVisible();
  });

  test('35 on the phone the pairs are joined and a tap on the tile opens the sheet with a Linked with row', async ({
    house,
  }) => {
    phoneOnly();
    const root = house.root();
    await house.tab('lights');
    await expect(root.locator('#ltiles .llink.on')).toHaveCount(2);
    await root.locator('#ltiles .lcell[data-lsheet="light.kitchen_island"] .tx').click();
    await expect(root.locator('#sh-light')).toBeVisible();
    await expect(root.locator('#lsheet .lnav')).toBeVisible();
  });
});

test.describe('as someone who is not an admin', () => {
  test.use({houseOpts: {cfg: LINK_CFG, admin: false}});

  test('36 the Linked with row is disabled', async ({house}) => {
    tabletOnly();
    const root = house.root();
    await house.tab('lights');
    await root.locator(`${OFFICE_TILE} .tx`).click();
    await expect(root.locator('#lsheet .lnav')).toBeDisabled();
  });
});
