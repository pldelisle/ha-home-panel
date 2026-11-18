// Room views (#506, ADR 0039): the Liquid Glass sidebar lists a row for each room that has a tile, a row opens that room's view, the Lights part
// switches the room and opens the room's sheet over the view, and a remembered room the house no longer has shows Home. Driven as a person
// drives it: the rows, the bulb, the tile; what is read back is the screen's roles, text and the calls Home Assistant got.
import {test, expect, tabletOnly, fontsLoaded, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

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
    await expect(pane(house).locator('.subject')).toHaveCount(1);
    await expect(pane(house).locator('.subject > h3')).toHaveText('Lights');
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

// The Media part (#509): the room's speakers and, when it sits there, the television, as the Media tab's tiles; the controls open over the room.
test.describe('Media in a room view', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  const tile = (house: House, name: string) => pane(house).locator('hp-media-tile').filter({hasText: name});

  test("the living room's Media section has the television's tile and the speaker's, named without the room's words", async ({
    house,
  }) => {
    tabletOnly();
    await openRoom(house, 'living_room');
    await expect(pane(house).locator('.subject > h3')).toHaveText(['Lights', 'Media']);
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
