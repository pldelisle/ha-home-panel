// Helper for the room-view screenshots: opens a room from its sidebar row and pins the sidebar's scroll, so the baseline does not hang on timing.
import type {House} from './fixtures';

/**
 * Taps the room's sidebar row, then scrolls the sidebar's list to its end and waits two frames. A room row sits low in the list, so the click
 * scrolls it into view by however far the list had settled: a fraction of a pixel that differed between CI runs and showed as a few pixels at the
 * sidebar's clipped bottom edge (#519). The room views are the only shots whose sidebar list is scrolled.
 */
export const openRoomRow = async (house: House, areaId: string) => {
  await house.root().locator(`#rail [data-room="${areaId}"]`).click();
  await house
    .root()
    .locator('#rail .rtabs')
    .evaluate(
      list =>
        new Promise<void>(done => {
          list.scrollTop = list.scrollHeight;
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        }),
    );
};
