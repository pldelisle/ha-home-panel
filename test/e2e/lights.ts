// Helpers for the Lights tab specs: what a person reads on the tiles, and what the panel sent to Home Assistant.
import {expect, type House} from './fixtures';

/** opens the Lights tab and returns the names on the tiles on screen, in order (the phone and the tablet each draw their own copy; only one is visible) */
export const tileNames = async (house: House) => {
  await house.tab('lights');
  return house.root().locator('#pane-lights .lcell:visible .tx b').allTextContents();
};

/** the JSON a service call carried: "light.turn_on {...}" gives the object */
export const callData = (call: string) => JSON.parse(call.replace(/^\S+ /, '')) as Record<string, unknown>;

/** a failure message that shows the calls the panel made */
export const callsMessage = (house: House, what: string) => `${what} (calls: ${house.calls.join('; ')})`;

/** the Office tile on the Lights tab (its right part opens the sheet, its left part is the bulb) */
export const OFFICE_TILE = '#pane-lights .lcell[data-lsheet="office"]';

/** taps the right part of the Office tile (the left part is the bulb) on the Lights tab and waits for the light sheet */
export const openOfficeSheet = async (house: House) => {
  await house.tab('lights');
  const t = (await house.root().locator(`${OFFICE_TILE}:visible`).boundingBox())!;
  await house.page.mouse.click(t.x + t.width * 0.7, t.y + t.height / 2);
  await expect(house.root().locator('#sh-light')).toBeVisible();
};
