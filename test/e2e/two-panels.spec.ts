// Two panels on one page each show their own house (spec 10, "Entity store, and the module globals leave the old class").
// The harness's ?two=1 mounts a second panel with two rooms and one person, fed the same hass as the first.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
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

// FIXME: this fails while the module globals are shared between the panels (the second one's config overwrites the first's).
// It passes, and the fixme goes, with the contract ticket (#130) that deletes the globals.
test.fixme('two panels on one page show their own houses (passes after #130)', async ({house}) => {
  const first = house.page.locator('home-panel').nth(0),
    second = house.page.locator('home-panel').nth(1);

  // each Climate tab lists its own rooms
  await expect(await climateRooms(second)).toHaveText(['Living room', 'Office']);
  await expect(await climateRooms(first)).toHaveText(['Living room', 'Office', 'Bedroom', 'Garage']);

  // the headers show two people in the first and one in the second
  await expect(first.locator('#hello .wp')).toHaveCount(2);
  await expect(second.locator('#hello .wp')).toHaveCount(1);

  // a state change through the harness reaches both
  const bulb = (panel: Locator) => panel.locator('#pane-lights .lbulb[data-a="living_room"]');
  for (const panel of [first, second]) await openTab(panel, 'lights');
  await expect(bulb(first)).toHaveAttribute('aria-checked', 'true');
  await expect(bulb(second)).toHaveAttribute('aria-checked', 'true');
  await house.setState('light.living_room_1', {state: 'off'});
  await expect(bulb(first)).toHaveAttribute('aria-checked', 'false');
  await expect(bulb(second)).toHaveAttribute('aria-checked', 'false');
});
