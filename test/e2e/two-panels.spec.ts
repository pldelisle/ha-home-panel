// Two panels on one page each show their own house (spec 10, "Entity store, and the module globals leave the old class").
// The harness's ?two=1 mounts a second panel with two rooms and one person, fed the same hass as the first.
import type {Locator} from '@playwright/test';
import {test, expect} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG, two: true}});

// opens a tab of one panel. On the phone each panel fixes its tab bar to the bottom of the screen, so the second panel's covers the
// first's and a pointer click would land on it: the click event goes to the button itself
const openTab = (panel: Locator, tab: string) => panel.locator(`[data-tab="${tab}"]`).first().dispatchEvent('click');

// the rooms a panel's Climate tab lists, once opened (not the whole-house item or the heat pump): a list on the tablet, tiles on the phone
const climateRooms = async (panel: Locator) => {
  await openTab(panel, 'climate');
  await expect(panel.locator('#pane-climate')).toBeVisible();
  const room = (item: string, key: string, name: string) =>
    `#pane-climate ${item}[${key}]:not([${key}="house"]):not([${key}="hp"]) ${name}`;
  return panel.locator(`${room('.citem', 'data-id', '.nm')}, ${room('.stile', 'data-csel', 'b')}`);
};

test('two panels on one page show their own houses', async ({house}) => {
  const first = house.page.locator('home-panel').nth(0),
    second = house.page.locator('home-panel').nth(1);

  // each Climate tab lists its own rooms
  await expect(await climateRooms(second)).toHaveText(['Living room', 'Office']);
  await expect(await climateRooms(first)).toHaveText(['Bedroom', 'Garage', 'Living room', 'Office']); // discovered: every thermostat, sorted by id

  // the headers show two people in the first and one in the second
  await expect(first.locator('#hello .wp')).toHaveCount(2);
  await expect(second.locator('#hello .wp')).toHaveCount(1);

  // a state change through the harness reaches both
  const bulb = (panel: Locator) => panel.locator('#pane-lights .lbulb[data-a="living_room"]:visible'); // on the phone the tablet card is in the page too, hidden
  for (const panel of [first, second]) await openTab(panel, 'lights');
  await expect(bulb(first)).toHaveAttribute('aria-checked', 'true');
  await expect(bulb(second)).toHaveAttribute('aria-checked', 'true');
  await house.setState('light.living_room_1', {state: 'off'});
  await expect(bulb(first)).toHaveAttribute('aria-checked', 'false');
  await expect(bulb(second)).toHaveAttribute('aria-checked', 'false');
});

// The page behind the panels has one colour, and the panel connected last owns it; when it leaves the other's colour
// comes back, and when none is left the page is its own again.
test('the page keeps its wallpaper colour until the last panel leaves', async ({house}) => {
  const background = () =>
    house.page.evaluate(() => ({
      html: document.documentElement.style.backgroundColor,
      body: document.body.style.backgroundColor,
    }));
  await expect.poll(background).toMatchObject({html: expect.stringMatching(/.+/), body: expect.stringMatching(/.+/)});
  await house.page
    .locator('home-panel')
    .nth(1)
    .evaluate(panel => panel.remove());
  expect(await background()).toMatchObject({html: expect.stringMatching(/.+/), body: expect.stringMatching(/.+/)});
  await house.page
    .locator('home-panel')
    .nth(0)
    .evaluate(panel => panel.remove());
  expect(await background()).toEqual({html: '', body: ''});
});

// The two panels read the same settings but each applies them on its own: the first is given Lake through its own popup
// and the second is left on Dawn, so their wallpapers (and the colours behind the document) differ.
test('the colour of the panel that leaves is handed to the one that stays', async ({house}) => {
  const first = house.page.locator('home-panel').nth(0);
  const second = house.page.locator('home-panel').nth(1);
  // the document's background as the browser writes it, and a panel's wallpaper base colour read the same way
  const documentColour = () => house.page.evaluate(() => document.documentElement.style.backgroundColor);
  const wallpaperColour = (panel: Locator) =>
    panel.evaluate(host => {
      const base = getComputedStyle(host.shadowRoot!.getElementById('app')!).getPropertyValue('--wbase').trim();
      const probe = document.createElement('i');
      probe.style.backgroundColor = base;
      return probe.style.backgroundColor;
    });
  const dawn = await wallpaperColour(second);
  await expect.poll(documentColour).toBe(dawn); // the second panel connected last, so it owns the document
  await first.locator('#gear').dispatchEvent('click');
  await first.locator('hp-settings-popup [data-gl="lake"]').dispatchEvent('click');
  await expect(first.locator('.app')).toHaveAttribute('data-wp', 'lake');
  const lake = await wallpaperColour(first);
  expect(lake).not.toBe(dawn);
  expect(await documentColour(), 'the first panel does not own the document').toBe(dawn);
  await second.evaluate(host => host.remove());
  expect(await documentColour(), 'the first panel gets the document back, in its own colour').toBe(lake);
});

test.describe('on auto', () => {
  test.use({houseOpts: {cfg: FULL_CFG, two: true, theme: 'auto'}});

  test('two panels follow the device together', async ({house}) => {
    await house.page.emulateMedia({colorScheme: 'dark'});
    for (const index of [0, 1])
      await expect(house.page.locator('home-panel').nth(index).locator('.app')).toHaveAttribute('data-theme', 'dark');
  });
});
