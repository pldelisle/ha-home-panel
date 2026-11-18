// Room views (#506, ADR 0039): the Liquid Glass sidebar lists a row for each room that has a tile, a row opens that room's view, the Lights part
// switches the room and opens the room's sheet over the view, and a remembered room the house no longer has shows Home. Driven as a person
// drives it: the rows, the bulb, the tile; what is read back is the screen's roles, text and the calls Home Assistant got.
import {test, expect, tabletOnly, phoneOnly, fontsLoaded, type House} from './fixtures';
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

// Rooms where the sidebar is not (#511): the phone's Home draws a Rooms row of chips and its More sheet lists the rooms; Material's tablet has the
// row too; the Liquid Glass tablet has the sidebar's group instead, so no row. A room view on the phone has a Back button to Home.
const chips = (house: House) => house.root().locator('#hrooms .hroom');
const selectedTabs = (house: House) => house.root().locator('#rail .rtab[aria-selected="true"]');
// where focus is, through every shadow root, as the element's chain of ancestors up to the document: does it sit inside the selector's element
const focusIn = (house: House, selector: string) =>
  house.page.evaluate(sel => {
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    for (let node: Node | null = el; node; node = node.parentNode ?? (node as ShadowRoot).host ?? null) {
      if (node instanceof Element && node.matches(sel)) return true;
    }
    return false;
  }, selector);

test.describe('rooms on the phone, Liquid Glass', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  test("Home's Rooms row opens a room, and Back returns to Home", async ({house}) => {
    phoneOnly();
    await house.tab('home');
    await expect(chips(house).locator('span')).toHaveText(['Kitchen', 'Living room', 'Office']);
    await expect(house.root().locator('#hrooms')).toHaveAccessibleName('Rooms');
    await chips(house).filter({hasText: 'Office'}).click();
    await expect(pane(house)).toBeVisible();
    await expect(pane(house).locator('hp-pane-header h2')).toHaveText('Office');
    await expect(house.root().locator('#pane-home')).toBeHidden();
    // the bar selects no tab while a room shows
    await expect(selectedTabs(house)).toHaveCount(0);
    expect(await house.page.evaluate(() => localStorage.getItem('home-panel-tab'))).toBe('room:office');
    await pane(house).getByRole('button', {name: 'Home'}).click();
    await expect(house.root().locator('#pane-home')).toBeVisible();
    await expect(pane(house)).toBeHidden();
    await expect(house.root().locator('#rail [data-tab="home"]')).toHaveAttribute('aria-selected', 'true');
  });

  test('focus follows the person: Enter on a chip lands in the room, Back lands on Home, and a row of More lands in the room', async ({
    house,
  }) => {
    phoneOnly();
    await house.tab('home');
    await chips(house).filter({hasText: 'Office'}).focus();
    await house.page.keyboard.press('Enter');
    await expect(pane(house)).toBeVisible();
    await expect.poll(() => focusIn(house, '#pane-room')).toBe(true);
    expect(
      await pane(house)
        .locator('h2')
        .evaluate(e => e.matches(':focus')),
    ).toBe(true);
    await pane(house).getByRole('button', {name: 'Home'}).focus();
    await house.page.keyboard.press('Enter');
    await expect(house.root().locator('#pane-home')).toBeVisible();
    await expect.poll(() => focusIn(house, '#pane-home')).toBe(true);
    await house.root().locator('#moretab').click();
    await house.root().locator('hp-more-sheet #morerooms .arow', {hasText: 'Kitchen'}).click();
    await expect(pane(house)).toBeVisible();
    await expect.poll(() => focusIn(house, '#pane-room')).toBe(true);
  });

  test('the row sits under the six tiles and scrolls sideways when the chips outgrow it', async ({house}) => {
    phoneOnly();
    await house.tab('home');
    const tiles = await house.root().locator('#htiles').boundingBox();
    const row = await house.root().locator('#hrooms').boundingBox();
    expect(row!.y).toBeGreaterThanOrEqual(tiles!.y + tiles!.height);
    expect(
      await house
        .root()
        .locator('#hrooms')
        .evaluate(e => getComputedStyle(e).overflowX),
    ).toBe('auto');
  });

  test('the More sheet lists the rooms below its sections, and a row closes it and shows the room', async ({house}) => {
    phoneOnly();
    await house.root().locator('#moretab').click();
    const sheet = house.root().locator('hp-more-sheet');
    await expect(sheet.getByRole('heading', {name: 'Rooms'})).toBeVisible();
    await expect(sheet.locator('#morerooms .arow b')).toHaveText(['Kitchen', 'Living room', 'Office']);
    await sheet.locator('#morerooms .arow', {hasText: 'Kitchen'}).click();
    await expect(sheet.getByRole('dialog')).toBeHidden();
    await expect(pane(house).locator('hp-pane-header h2')).toHaveText('Kitchen');
    await expect(selectedTabs(house)).toHaveCount(0);
  });

  test('a room view on a tablet has no Back button, and the Home pane no row beside the sidebar', async ({house}) => {
    tabletOnly();
    await expect(house.root().locator('#hrooms')).toHaveCount(0);
    await openRoom(house, 'office');
    await expect(pane(house).getByRole('button', {name: 'Home'})).toHaveCount(0);
  });
});

test.describe('rooms on the phone, in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, lang: 'fr', time: AFTERNOON, frozen: true}});

  test('the chips show whole, the row is named Pièces and Back says Accueil', async ({house}) => {
    phoneOnly();
    await house.tab('home');
    await expect(house.root().locator('#hrooms')).toHaveAccessibleName('Pièces');
    const cut = await chips(house)
      .locator('span')
      .evaluateAll(spans => spans.filter(e => e.scrollWidth > e.clientWidth).map(e => e.textContent));
    expect(cut, 'chip names cut').toEqual([]);
    await chips(house).first().click();
    await expect(pane(house).getByRole('button', {name: 'Accueil'})).toBeVisible();
  });
});

test.describe('rooms under Material', () => {
  test.use({houseOpts: {cfg: FULL_CFG, design: 'material', time: AFTERNOON, frozen: true}});

  test("the tablet's Home shows the Rooms row, its rail has no Rooms group, and a chip opens a room the rail does not select", async ({
    house,
  }) => {
    tabletOnly();
    await expect(chips(house).locator('span')).toHaveText(['Kitchen', 'Living room', 'Office']);
    // right under the six tiles, in their column
    const tiles = await house.root().locator('#htiles').boundingBox();
    const row = await house.root().locator('#hrooms').boundingBox();
    expect(row!.y).toBeGreaterThanOrEqual(tiles!.y + tiles!.height);
    expect(row!.y).toBeLessThan(tiles!.y + tiles!.height + 40);
    await expect(house.root().locator('#rail .rhead, #rail .rroom')).toHaveCount(0);
    // the assist chip: 32 px high, with a 48 px hit area: a tap 6 px above its edge still opens the room
    const chip = chips(house).first();
    expect((await chip.boundingBox())?.height).toBe(32);
    const hit = await chip.evaluate(e => {
      const after = getComputedStyle(e, '::after');
      return {top: after.top, bottom: after.bottom, position: after.position};
    });
    expect(hit).toEqual({top: '-8px', bottom: '-8px', position: 'absolute'});
    await chip.click({position: {x: 20, y: -6}});
    await expect(pane(house).locator('hp-pane-header h2')).toHaveText('Kitchen');
    await expect(selectedTabs(house)).toHaveCount(0);
    await expect(pane(house).getByRole('button', {name: 'Home'})).toHaveCount(0);
  });

  test("the phone's Home row, More list and Back work as under Liquid Glass", async ({house}) => {
    phoneOnly();
    await house.tab('home');
    await chips(house).filter({hasText: 'Living room'}).click();
    await expect(pane(house).locator('hp-pane-header h2')).toHaveText('Living room');
    await pane(house).getByRole('button', {name: 'Home'}).click();
    await expect(house.root().locator('#pane-home')).toBeVisible();
    await house.root().locator('#moretab').click();
    await expect(house.root().locator('hp-more-sheet #morerooms .arow')).toHaveCount(3);
  });
});
