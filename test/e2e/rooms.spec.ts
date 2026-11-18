// Room views (#506, ADR 0039): the Liquid Glass sidebar lists a row for each room that has a tile, a row opens that room's view, the Lights part
// switches the room and opens the room's sheet over the view, and a remembered room the house no longer has shows Home. Driven as a person
// drives it: the rows, the bulb, the tile; what is read back is the screen's roles, text and the calls Home Assistant got.
import {test, expect, tabletOnly, fontsLoaded, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';
import {addPorchCamera} from './room-camera';

test.beforeEach(({house}) => fontsLoaded(house));

const rooms = (house: House) => house.root().locator('#rail .rroom');
const pane = (house: House) => house.root().locator('#pane-room');
const openRoom = async (house: House, areaId: string) => {
  await house.root().locator(`#rail [data-room="${areaId}"]`).click();
  await expect(pane(house)).toBeVisible();
};

test.describe('the rooms of the full house', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  test('the sidebar lists the rooms that have a light, sorted by name, after a Rooms heading', async ({house}) => {
    tabletOnly();
    await house.root().getByRole('button', {name: 'Show sidebar'}).click();
    await expect(house.root().locator('#rail .rhead').nth(1)).toHaveText('Rooms');
    await expect(rooms(house).locator('span')).toHaveText(['Kitchen', 'Living room', 'Office']);
    // each row is a tab of the same list, with its area and its name; the Other tile (no area) is not a room
    await expect(rooms(house)).toHaveCount(3);
    for (const row of await rooms(house).all()) {
      await expect(row).toHaveAttribute('role', 'tab');
      await expect(row).toHaveAttribute('aria-selected', 'false');
    }
    await expect(house.root().getByRole('tab', {name: 'Office'})).toHaveAttribute('data-room', 'office');
    // the toggle stays put while the list scrolls: the list, not the rail, is the scroller
    expect(
      await house
        .root()
        .locator('#rail .rtabs')
        .evaluate(e => getComputedStyle(e).overflowY),
    ).toBe('auto');
  });

  test('collapsed, a row is an icon with its name on hover', async ({house}) => {
    tabletOnly();
    await expect(house.root().getByRole('tab', {name: 'Living room'})).toHaveAttribute('title', 'Living room');
    expect((await rooms(house).first().boundingBox())?.width).toBeLessThanOrEqual(72);
  });

  test('a row opens its room: the name, the Lights section and the room remembered', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'office');
    await expect(house.root().locator('#rail [data-room="office"]')).toHaveAttribute('aria-selected', 'true');
    await expect(house.root().locator('#rail [data-room="kitchen"]')).toHaveAttribute('aria-selected', 'false');
    // no section is the selected one, and no other pane shows
    await expect(house.root().locator('#rail [data-tab="home"]')).toHaveAttribute('aria-selected', 'false');
    await expect(house.root().locator('#pane-home')).toBeHidden();
    await expect(pane(house).locator('hp-pane-header h2')).toHaveText('Office');
    await expect(pane(house).locator('.subject[data-subject="lights"]')).toHaveCount(1);
    await expect(pane(house).locator('.subject[data-subject="lights"] > h3')).toHaveText('Lights');
    await expect(pane(house).locator('hp-light-tile .tx b')).toHaveText(['Office']);
    expect(await house.page.evaluate(() => localStorage.getItem('home-panel-tab'))).toBe('room:office');
    // another row, then a section, takes the room's place
    await openRoom(house, 'kitchen');
    await expect(pane(house).locator('hp-light-tile .tx b')).toHaveText(['Kitchen']);
    await house.tab('lights');
    await expect(pane(house)).toBeHidden();
    await expect(house.root().locator('#rail [data-room="kitchen"]')).toHaveAttribute('aria-selected', 'false');
  });

  test("the bulb switches the room through the Lights tab's commands", async ({house}) => {
    tabletOnly();
    await openRoom(house, 'office');
    await pane(house).locator('button.lbulb[data-a="office"]').click();
    await expect
      .poll(() => house.calls.some(c => /^light\.turn_off .*office_1/.test(c)), house.calls.join('; '))
      .toBe(true);
  });

  test('a tile opens the Lights room sheet over the room, and the room stays', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'office');
    await pane(house).locator('.lrow[data-lsheet="office"]').click();
    await expect(house.root().locator('#sh-light')).toBeVisible();
    // the tab did not change: the room's view is still the one selected, and the Lights pane is in the page only behind the sheet
    await expect(house.root().locator('#rail [data-room="office"]')).toHaveAttribute('aria-selected', 'true');
    await expect(pane(house)).toBeVisible();
    await expect(house.root().locator('#rail [data-tab="lights"]')).toHaveAttribute('aria-selected', 'false');
    await expect(house.root().locator('#pane-lights')).toHaveClass(/behind/);
    await house.page.keyboard.press('Escape');
    await expect(house.root().locator('#sh-light')).toBeHidden();
    await expect(pane(house)).toBeVisible();
  });

  test("choosing a section while the room's sheet is open closes the sheet", async ({house}) => {
    tabletOnly();
    await openRoom(house, 'office');
    await pane(house).locator('.lrow[data-lsheet="office"]').click();
    await expect(house.root().locator('#sh-light')).toBeVisible();
    // the sheet's backdrop covers the rail, so the row is chosen as the keyboard or a script would
    await house.root().locator('#rail [data-tab="climate"]').dispatchEvent('click');
    await expect(house.root().locator('#pane-climate')).toBeVisible();
    await expect(house.root().locator('#sh-light')).toBeHidden();
    await expect(house.root().locator('#pane-lights')).not.toHaveClass(/behind/);
  });

  test('the keyboard walks the sections and then the rooms in one list', async ({house}) => {
    tabletOnly();
    await house.root().locator('#rail [data-tab="cams"]').focus();
    await house.page.keyboard.press('ArrowDown');
    await expect(house.root().locator('#rail [data-room="kitchen"]')).toBeFocused();
    await house.page.keyboard.press('ArrowUp');
    await expect(house.root().locator('#rail [data-tab="cams"]')).toBeFocused();
  });
});

// a browser that remembers a room the house does not have
const rememberedAttic = test.extend({
  page: async ({page}, use) => {
    await page.addInitScript(() => localStorage.setItem('home-panel-tab', 'room:attic'));
    await use(page);
  },
});

rememberedAttic.describe('a remembered room the house does not have', () => {
  rememberedAttic.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  rememberedAttic('shows Home and selects no room', async ({house}) => {
    tabletOnly();
    await expect(house.root().locator('#pane-home')).toBeVisible();
    await expect(house.root().locator('#rail [data-tab="home"]')).toHaveAttribute('aria-selected', 'true');
    await expect(pane(house)).toBeHidden();
    await expect(rooms(house).first()).toHaveAttribute('aria-selected', 'false');
  });
});

// The Security part of a room view (#510): the room's cameras, then its door and motion sensors, as the Security tab draws them; a camera
// opens its live sheet and a sensor its history over the room. The test house has the front door in the living room, the hall motion sensor in
// the office and no camera: the porch camera is added to the living room the way Home Assistant adds an entity, with its registry row.
test.describe('the Security part of a room', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  const section = (house: House) => pane(house).locator('[data-subject="cams"]');

  test('a room with a door sensor and a camera shows the camera, then the sensor, and no other room', async ({
    house,
  }) => {
    tabletOnly();
    await addPorchCamera(house, 'living_room');
    await openRoom(house, 'living_room');
    await expect(section(house).locator('h3')).toHaveText('Security');
    await expect(section(house).locator('hp-camera-card .camlbl b')).toHaveText(['Porch']);
    await expect(section(house).locator('hp-sensor-card .schip b')).toHaveText(['Front door']);
    // the cameras' card comes before the sensors'
    const order = await section(house)
      .locator('hp-security-room > *')
      .evaluateAll(cards => cards.map(c => c.localName));
    expect(order).toEqual(['hp-camera-card', 'hp-sensor-card']);
  });

  test('a room with only a sensor draws no cameras card, not even the tab empty state', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'office');
    await expect(section(house).locator('hp-sensor-card .schip b')).toHaveText(['Hall motion']);
    await expect(section(house).locator('hp-camera-card')).toHaveCount(0);
  });

  test('a camera opens its sheet over the room, and the room stays', async ({house}) => {
    tabletOnly();
    await addPorchCamera(house, 'living_room');
    await openRoom(house, 'living_room');
    await section(house)
      .getByRole('button', {name: /^Porch/})
      .click();
    const sheet = house.root().locator('hp-camera-sheet');
    await expect(sheet.locator('hp-sheet h2')).toHaveText('Porch');
    await expect(sheet.locator('.camlive img')).toHaveAttribute(
      'src',
      '/api/camera_proxy_stream/camera.porch?token=tok',
    );
    await expect(house.root().locator('#rail [data-room="living_room"]')).toHaveAttribute('aria-selected', 'true');
    await expect(pane(house)).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(pane(house)).toBeVisible();
  });

  test('a sensor opens its history over the room, and the room stays', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'living_room');
    await section(house)
      .getByRole('button', {name: /^Front door/})
      .click();
    await expect(house.root().locator('hp-sensor-history hp-sheet h2')).toHaveText('Front door');
    await expect(house.root().locator('#rail [data-room="living_room"]')).toHaveAttribute('aria-selected', 'true');
    await house.page.keyboard.press('Escape');
    await expect(house.root().locator('hp-sensor-history')).toHaveCount(0);
    await expect(pane(house)).toBeVisible();
  });

  test('leaving the room takes its cards, and their snapshots, out of the page', async ({house}) => {
    tabletOnly();
    await addPorchCamera(house, 'living_room');
    await openRoom(house, 'living_room');
    await expect(section(house).locator('hp-camera-card .cam img')).toHaveCount(1);
    await house.tab('lights');
    await expect(house.root().locator('hp-security-room')).toHaveCount(0);
  });
});
