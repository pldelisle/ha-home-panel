// Helpers for the Lights tab specs: what a person reads on the tiles, and what the panel sent to Home Assistant.
import type {House} from './fixtures';

/** opens the Lights tab and returns the names on the tiles on screen, in order (the phone and the tablet each draw their own copy; only one is visible) */
export const tileNames = async (house: House) => {
  await house.tab('lights');
  return house.root().locator('#pane-lights .lcell:visible .tx b').allTextContents();
};

/** the JSON a service call carried: "light.turn_on {...}" gives the object */
export const callData = (call: string) => JSON.parse(call.replace(/^\S+ /, ''));

/** a failure message that shows the calls the panel made */
export const callsMessage = (house: House, what: string) => `${what} (calls: ${house.calls.join('; ')})`;
