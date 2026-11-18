// Room views (#506, ADR 0039): the Liquid Glass sidebar lists a row for each room that has a tile, a row opens that room's view, the Lights part
// switches the room and opens the room's sheet over the view, and a remembered room the house no longer has shows Home. Driven as a person
// drives it: the rows, the bulb, the tile; what is read back is the screen's roles, text and the calls Home Assistant got.
import {test, expect, expectCall, tabletOnly, fontsLoaded, type House} from './fixtures';
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

  test('the sidebar lists the rooms that have a light or a thermostat, sorted by name, after a Rooms heading', async ({
    house,
  }) => {
    tabletOnly();
    await house.root().getByRole('button', {name: 'Show sidebar'}).click();
    await expect(house.root().locator('#rail .rhead').nth(1)).toHaveText('Rooms');
    await expect(rooms(house).locator('span')).toHaveText(['Bedroom', 'Garage', 'Kitchen', 'Living room', 'Office']);
    // each row is a tab of the same list, with its area and its name; the Other tile (no area) is not a room
    await expect(rooms(house)).toHaveCount(5);
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
    // the Office has a light, a thermostat, a purifier and the hall motion sensor: one section each, in the registry's order
    await expect(pane(house).locator('.subject')).toHaveCount(4);
    await expect(pane(house).locator('.subject > h3')).toHaveText(['Lights', 'Climate', 'Air', 'Security']);
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
    await expect(house.root().locator('#rail [data-room="bedroom"]')).toBeFocused();
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

// Climate's part of a room view (#507): the room's thermostat as the Climate tab's phone tile, its temperature in the header, and a tap that opens
// Climate's detail for that room over the room, on a tablet as well
test.describe('the climate of a room', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  const tile = (house: House) => pane(house).locator('hp-climate-room hp-stat-tile button');
  const sheet = (house: House) => house.root().locator('#pane-climate hp-climate-pane hp-sheet');

  test('the room shows its thermostat’s tile and its temperature', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'living_room');
    await expect(pane(house).locator('[data-subject="climate"] h3')).toHaveText('Climate');
    await expect(tile(house)).toHaveCount(1);
    await expect(tile(house)).toContainText('Living room');
    await expect(tile(house)).toContainText('Heating · 1.2 kW');
    await expect(tile(house)).toContainText('20.0°');
    await expect(pane(house).locator('.readings li')).toHaveText(['20.0°']);
    // the whole house and the heat pump are the tab's, and a room without a thermostat has no Climate section and no reading
    await openRoom(house, 'kitchen');
    await expect(pane(house).locator('[data-subject="climate"]')).toHaveCount(0);
    await expect(pane(house).locator('.readings')).toHaveCount(0);
  });

  test('a tap opens the detail of that room over the room, and Close returns to it', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'office');
    await tile(house).click();
    await expect(sheet(house).getByRole('dialog')).toBeVisible();
    await expect(sheet(house).locator('hp-climate-detail h3')).toHaveText('Office');
    // the tab did not change: the room is still the one selected, and the Climate pane is in the page only behind the sheet
    await expect(house.root().locator('#rail [data-room="office"]')).toHaveAttribute('aria-selected', 'true');
    await expect(house.root().locator('#rail [data-tab="climate"]')).toHaveAttribute('aria-selected', 'false');
    await expect(house.root().locator('#pane-climate')).toHaveClass(/behind/);
    await expect(pane(house)).toBeVisible();
    await sheet(house).getByRole('button', {name: 'Close'}).click();
    await expect(sheet(house).getByRole('dialog')).toBeHidden();
    await expect(pane(house)).toBeVisible();
    await expect(house.root().locator('#rail [data-room="office"]')).toHaveAttribute('aria-selected', 'true');
  });
});

// Air's part of a room view (#508): the room's purifier card, its humidity in the header, and the Air sheets over the view. The test house has one
// purifier, in the office; the kitchen has lights and no purifier.
test.describe('the Air part of a room', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  const air = (house: House) => pane(house).locator('.subject[data-subject="air"]');
  const card = (house: House) => air(house).locator('hp-air-room');
  const MANUAL = /^fan\.set_preset_mode \{"entity_id":"fan\.office_purifier","preset_mode":"Manual"\}$/;

  test('a room with a purifier shows its card after the lights, and the humidity in the header; one without has neither', async ({
    house,
  }) => {
    tabletOnly();
    await openRoom(house, 'office');
    await expect(pane(house).locator('.subject > h3')).toHaveText(['Lights', 'Climate', 'Air', 'Security']);
    await expect(pane(house).locator('hp-pane-header .readings li')).toHaveText(['20.4°', '38 %']);
    await expect(card(house)).toHaveCount(1);
    await expect(card(house).locator('.aqhead h3')).toHaveText('Office');
    await expect(card(house).getByRole('radio', {name: 'Automagic'})).toHaveAttribute('aria-checked', 'true');
    await expect(card(house).locator('.tile .k')).toHaveText(['PM2.5', 'CO₂', 'VOC', 'CO', 'PM1', 'PM10', 'Humidity']);
    await openRoom(house, 'kitchen');
    await expect(air(house)).toHaveCount(0);
    await expect(pane(house).locator('hp-pane-header .readings li')).toHaveCount(0);
  });

  test('the mode control sends the same call as on the Air tab and shows the choice at once', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'office');
    await card(house).getByRole('radio', {name: 'Manual'}).click();
    await expectCall(house, MANUAL);
    await expect(card(house).getByRole('radio', {name: 'Manual'})).toHaveAttribute('aria-checked', 'true');
    await expect(card(house).getByRole('button', {name: 'Faster'})).toBeVisible();
  });

  test('the humidity follows the sensor', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'office');
    await house.setState('sensor.office_purifier_humidity', {state: '45'});
    await expect(pane(house).locator('hp-pane-header .readings li')).toHaveText(['20.4°', '45 %']);
  });

  test('a tile opens its history over the room, and the room stays', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'office');
    await card(house).getByRole('button', {name: /^CO₂/}).click();
    await expect(house.root().locator('hp-air-history hp-sheet')).toHaveAttribute('open', '');
    await expect(house.root().locator('#rail [data-room="office"]')).toHaveAttribute('aria-selected', 'true');
    await expect(house.root().locator('#pane-air')).toHaveClass(/behind/);
    await house.page.keyboard.press('Escape');
    await expect(house.root().locator('hp-air-history')).toHaveCount(0);
    await expect(pane(house)).toBeVisible();
  });

  test('the detail opens as a sheet over the room on a tablet, and the room stays', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'office');
    await air(house).getByRole('button', {name: 'Every room and the outside air'}).click();
    const sheet = house.root().locator('#pane-air hp-air-pane hp-sheet');
    await expect(sheet).toHaveAttribute('open', '');
    await expect(sheet.locator('h2[slot="title"]')).toHaveText('Air quality');
    await expect(sheet.locator('hp-air-detail hp-air-room')).toHaveCount(1);
    await expect(house.root().locator('#rail [data-room="office"]')).toHaveAttribute('aria-selected', 'true');
    await expect(house.root().locator('#rail [data-tab="air"]')).toHaveAttribute('aria-selected', 'false');
    await expect(house.root().locator('#pane-air')).toHaveClass(/behind/);
    await house.page.keyboard.press('Escape');
    await expect(sheet).not.toHaveAttribute('open', '');
    await expect(pane(house)).toBeVisible();
    await expect(house.root().locator('#pane-air')).not.toHaveClass(/behind/);
  });

  test('a room that goes away while the detail is open over it takes the sheet with it, and Home shows', async ({
    house,
  }) => {
    tabletOnly();
    await openRoom(house, 'office');
    await air(house).getByRole('button', {name: 'Every room and the outside air'}).click();
    await expect(house.root().locator('#pane-air hp-air-pane hp-sheet')).toHaveAttribute('open', '');
    // the office's area is deleted in Home Assistant: its light and its purifier are in no room any more
    await house.removeArea('office');
    await expect(house.root().locator('#rail [data-room="office"]')).toHaveCount(0);
    await expect(house.root().locator('hp-sheet[open]')).toHaveCount(0);
    await expect(house.root().locator('#pane-home')).toBeVisible();
    await expect(pane(house)).toBeHidden();
    // nothing is left open in the host either: another room does not find the detail's sheet open over it
    await openRoom(house, 'kitchen');
    await expect(house.root().locator('hp-sheet[open]')).toHaveCount(0);
    await expect(house.root().locator('#pane-air')).not.toHaveClass(/behind/);
  });
});

// The Media part (#509): the room's speakers and, when it sits there, the television, as the Media tab's tiles; the controls open over the room.
test.describe('Media in a room view', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  const tile = (house: House, name: string) => pane(house).locator('hp-media-tile').filter({hasText: name});

  test("the living room's Media section has the television's tile and the speaker's, named without the room's words", async ({
    house,
  }) => {
    tabletOnly();
    await openRoom(house, 'living_room');
    await expect(pane(house).locator('.subject > h3')).toHaveText(['Lights', 'Climate', 'Media', 'Security']);
    await expect(pane(house).locator('hp-media-tile .tx b')).toHaveText(['Samsung TV', 'speaker']);
    // a room with no player has no Media section
    await openRoom(house, 'kitchen');
    await expect(pane(house).locator('.subject > h3')).toHaveText(['Lights']);
    await expect(pane(house).locator('hp-media-tile')).toHaveCount(0);
  });

  test("the play button pauses the speaker at once through the Media tab's command", async ({house}) => {
    tabletOnly();
    await openRoom(house, 'living_room');
    await tile(house, 'speaker').getByRole('button', {name: 'Pause', exact: true}).click();
    await expect(tile(house, 'speaker').getByRole('button', {name: 'Play', exact: true})).toBeEnabled();
    await expect
      .poll(
        () => house.calls.some(c => /^media_player\.media_pause .*living_room_speaker/.test(c)),
        house.calls.join('; '),
      )
      .toBe(true);
    await expect(house.root().getByRole('dialog')).toHaveCount(0);
  });

  test('a tap opens the controls sheet over the room, and the room stays', async ({house}) => {
    tabletOnly();
    await openRoom(house, 'living_room');
    await tile(house, 'speaker').getByText('speaker', {exact: true}).click();
    const sheet = house.root().getByRole('dialog', {name: 'Speakers'});
    await expect(sheet).toBeVisible();
    // the card is slotted, so it is the sheet element's child and not the panel's
    await expect(house.root().locator('#pane-media hp-sheet hp-speaker-pod')).toHaveCount(1);
    // the tab did not change: the room's view is still the one selected, and the Media pane is in the page only behind the sheet
    await expect(house.root().locator('#rail [data-room="living_room"]')).toHaveAttribute('aria-selected', 'true');
    await expect(pane(house)).toBeVisible();
    await expect(house.root().locator('#rail [data-tab="media"]')).toHaveAttribute('aria-selected', 'false');
    await expect(house.root().locator('#pane-media')).toHaveClass(/behind/);
    await house.page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(pane(house)).toBeVisible();
  });

  test("the television's tile opens its box in the sheet over the room", async ({house}) => {
    tabletOnly();
    await openRoom(house, 'living_room');
    await tile(house, 'Samsung TV').getByText('Samsung TV', {exact: true}).click();
    await expect(house.root().getByRole('dialog', {name: 'Samsung TV'})).toBeVisible();
    await expect(
      house.root().locator('#pane-media hp-sheet').getByRole('button', {name: 'Turn the TV off'}),
    ).toBeVisible();
    await expect(house.root().locator('#rail [data-room="living_room"]')).toHaveAttribute('aria-selected', 'true');
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
    // a door that opens is a later state change: the camera keeps its registry row, so it stays in the room
    await house.setState('binary_sensor.front_door', {state: 'on'});
    await expect(section(house).locator('hp-sensor-card .schip.warn em')).toHaveText('Open');
    await expect(section(house).locator('hp-camera-card .camlbl b')).toHaveText(['Porch']);
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
