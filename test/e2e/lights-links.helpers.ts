// Small helpers for the linked-rooms and Arrange specs: what the Lights tab shows, read the way a person reads it.
import type {House} from './fixtures';

/** opens the Lights tab and returns the names of the tiles on screen, in the order they appear (the phone and the tablet draw their own copy; only one is visible) */
export async function tileTexts(house: House): Promise<string[]> {
  await house.tab('lights');
  return house.root().locator('#pane-lights .lcell:visible .tx b').allTextContents();
}
