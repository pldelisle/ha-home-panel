// Helpers for the specs that look at the idle clock: the made-up night, and the two ways a screen goes idle.
import {expect, IDLE_AFTER_MS, isPhone, type House} from './fixtures';

/** 11:30 pm, when the car is plugged in and the speaker is playing, so the idle clock has a stack to show */
export const NIGHT = '2026-11-07T23:30:00-05:00';

/** "Sleep now" in the settings popup: how a phone starts the idle clock, since phones never go idle on their own; waits for the stack card */
export async function sleepNow(house: House) {
  await house.root().locator('#gear').click();
  await house.root().locator('[data-sleep]').click();
  await expect(house.root().locator('#istk .sc')).toBeVisible();
}

/** lets five minutes pass on the page's clock, then has the idle clock showing with its stack card: a tablet goes idle by itself, a phone is put to sleep */
export async function goIdle(house: House) {
  await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
  if (isPhone(house)) await sleepNow(house);
  else await expect(house.root().locator('#istk .sc')).toBeVisible();
}
