// Live activities (2.6.0): the test car is charging, so the status spot is a pill; tapped, it shows the car's card above the
// Status checks. With nothing running and nothing to check the spot is empty (2.8.0); a problem shows as an attention pill.
// State changes go through the harness, the way Home Assistant hands the panel a new hass.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
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
