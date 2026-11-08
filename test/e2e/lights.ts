// Helpers for the Lights tab specs: what a person reads on the tiles and where they press on a slider.
import type {House} from './fixtures';

/** opens the Lights tab and returns the names on its tiles, in order */
export const tileNames = async (house: House) => {
  await house.tab('lights');
  return house.root().locator('#pane-lights .lcell .tx b').allTextContents();
};

/** the JSON a service call carried: "light.turn_on {...}" gives the object */
export const callData = (call: string) => JSON.parse(call.replace(/^\S+ /, ''));
