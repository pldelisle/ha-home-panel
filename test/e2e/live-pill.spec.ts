// Live activities (2.6.0): the test car is charging, so the status spot is a pill; tapped, it shows the car's card above the
// Status checks. With nothing running and nothing to check the spot is empty (2.8.0); a problem shows as an attention pill.
// State changes go through the harness, the way Home Assistant hands the panel a new hass.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import type {Locator} from '@playwright/test';
import {test, expect, expectCall} from './fixtures';
import {FULL_CFG} from './houses';
import {pill, stopCharging, openFrontDoor, openPopup} from './live';

test.use({houseOpts: {cfg: FULL_CFG}});

test('10 the status chip is a charging pill', async ({house}) => {
  await expect(pill(house)).toHaveClass(/\blap\b/);
  await expect(pill(house)).toContainText('64%');
});

test('11 tapped, the pill shows one activity card and the Status checks', async ({house}) => {
  const popup = await openPopup(house);
  await expect(popup.locator('.lact')).toHaveCount(1);
  await expect(popup.locator('.lstat')).toHaveCount(1);
});

test("12 Pause charging turns the charger's pause switch off", async ({house}) => {
  const popup = await openPopup(house);
  await popup.locator('[data-la="pause"]').click();
  await expectCall(house, /^switch\.turn_off .*charger_pause/);
});

test('13 once charging stops and nothing needs attention, the spot is empty', async ({house}) => {
  await expect(pill(house)).toHaveClass(/\blap\b/); // the pill was there first, so its absence below means something
  await stopCharging(house);
  await expect(pill(house)).toHaveCount(0);
});

test('14 a door left open shows as an attention pill', async ({house}) => {
  await stopCharging(house); // while the car still charges, the charging pill wins
  await openFrontDoor(house);
  await expect(pill(house)).toContainText(/needs attention/);
});

test("15 the Home card ends at Who's home: the pill says the rest (2.8.1)", async ({house}) => {
  await stopCharging(house);
  await openFrontDoor(house);
  await expect(pill(house)).toContainText(/needs attention/); // there is a problem, and still no Status block on the Home card
  const home = house.root().locator('#hwx');
  await expect(home).toContainText(/Who's home/);
  await expect(home).not.toContainText(/Status|All clear/);
});

// The attention mark under the glass look (the default): the inline "!" of the attention pill is the bare round badge, with no tinted
// box behind it (#50). Computed style, because a box is pixels the text assertions above never see.
const computed = (el: Locator, prop: 'backgroundColor' | 'borderRadius') =>
  el.evaluate((e, p) => getComputedStyle(e)[p], prop);
const CLEAR = 'rgba(0, 0, 0, 0)';

test('14b under the glass look, the attention pill’s warning mark has no tinted box behind it', async ({house}) => {
  await expect(house.root().locator('.app.gl')).toHaveCount(1); // glass is on: it is the look that used to paint the box
  await stopCharging(house);
  await openFrontDoor(house);
  await expect(pill(house)).toContainText(/needs attention/);
  const mark = pill(house).locator('.lwarn');
  await expect(mark).toHaveCount(1);
  expect(await computed(mark, 'backgroundColor')).toBe(CLEAR);
  expect(await computed(mark, 'borderRadius')).toBe('0px');
  // the pill itself and its round "!" badge are what carry the look
  expect(await computed(pill(house).locator('.lmain'), 'backgroundColor')).not.toBe(CLEAR);
  expect(await computed(mark.locator('b'), 'borderRadius')).toBe('50%');
});

test('14c while the car charges, the attention bubble beside the pill stays a round tinted bubble', async ({house}) => {
  await expect(house.root().locator('.app.gl')).toHaveCount(1);
  await openFrontDoor(house);
  const bubble = pill(house).locator('.lbub.lwarn');
  await expect(bubble).toHaveCount(1);
  expect(await computed(bubble, 'backgroundColor')).not.toBe(CLEAR);
  expect(await computed(bubble, 'borderRadius')).toBe('999px');
});
