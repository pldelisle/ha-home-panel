// Helpers for the live-activity pill and the Status checks popup: what the specs and the screenshots both do to the made-up house.
import {expect, type House} from './fixtures';

/** the pill in the header chips (the charging pill, or the attention pill when something needs a look) */
export const pill = (house: House) => house.root().locator('#chips .attchip');

/** the car stops charging and is unplugged: no live activity is left */
export const stopCharging = async (house: House) => {
  await house.setState('sensor.fordpass_test_elvehcharging', {state: 'NOT_READY'});
  await house.setState('sensor.fordpass_test_elvehplug', {state: 'DISCONNECTED'});
};

/** the front door has been open for 20 minutes (counted on the page's clock) */
export const openFrontDoor = (house: House) => house.setStateSince('binary_sensor.front_door', {state: 'on'}, 20 * 60_000);

/** taps the pill, waits for the popup it opens and returns it */
export const openPopup = async (house: House) => {
  await pill(house).click();
  const popup = house.root().locator('#attpop');
  await expect(popup).toBeVisible();
  return popup;
};
