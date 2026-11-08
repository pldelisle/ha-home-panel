// Live activities (2.6.0): the test car is charging, so the status spot is a pill; tapped, it shows the car's card above the
// Status checks. With nothing running and nothing to check the spot is empty (2.8.0); a problem shows as an attention pill.
// State changes go through the harness, the way Home Assistant hands the panel a new hass.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

test('10 to 15 the pill, its popup, Pause charging, the empty spot and the attention pill', async ({house}) => {
  const pill = house.root().locator('#chips .attchip');

  // 10 the status chip is a charging pill
  await expect(pill).toHaveClass(/\blap\b/);
  await expect(pill).toContainText('64%');

  // 11 tapped, it shows one activity card and the Status checks
  await pill.click();
  const popup = house.root().locator('#attpop');
  await expect(popup).toBeVisible();
  await expect(popup.locator('.lact')).toHaveCount(1);
  await expect(popup.locator('.lstat')).toHaveCount(1);

  // 12 Pause charging turns the charger's pause switch off
  await popup.locator('[data-la="pause"]').click();
  await expect.poll(() => house.calls.some(c => /^switch\.turn_off .*charger_pause/.test(c)), `Pause charging (calls: ${house.calls.join('; ')})`).toBe(true);

  // 13 once charging stops and nothing needs attention, the spot is empty
  await house.setState('sensor.fordpass_test_elvehcharging', {state: 'NOT_READY'});
  await house.setState('sensor.fordpass_test_elvehplug', {state: 'DISCONNECTED'});
  await expect(pill).toHaveCount(0);

  // 14 a door left open shows as an attention pill
  await house.setState('binary_sensor.front_door', {state: 'on', last_changed: new Date(Date.now() - 20 * 60_000).toISOString()});
  await expect(pill).toContainText(/needs attention/);

  // 15 the Home card ends at Who's home: the pill says the rest (2.8.1)
  const home = house.root().locator('#hwx');
  await expect(home).toContainText(/Who's home/);
  await expect(home).not.toContainText(/Status|All clear/);
});
