// A room view with Security in it (#510): the room's camera card, its sensor card and the room's Lights tiles, in the Liquid Glass tablet, light.
// Baselines live in test/e2e/__screenshots__/visual/room-security.spec.ts/ and are recorded only inside the Playwright image (Docker or
// `container`: npm run test:visual:update); a difference is either fixed or approved by updating them in the same pull request.
import {test, expect, fontsLoaded} from '../fixtures';
import {AFTERNOON, FULL_CFG, VIEWPORTS} from '../houses';
import {addPorchCamera} from '../room-camera';
import {openRoomRow} from '../room-row';

test.beforeEach(({house}) => fontsLoaded(house));

test.describe('a room with security, tablet, light', () => {
  test.use({viewport: VIEWPORTS.tablet, houseOpts: {cfg: FULL_CFG, theme: 'light', time: AFTERNOON, frozen: true}});

  test('room view with security', async ({house}) => {
    await addPorchCamera(house, 'living_room');
    await openRoomRow(house, 'living_room');
    await expect(house.root().locator('#pane-room hp-camera-card .cam')).toBeVisible();
    await house.page.mouse.move(0, 0);
    // the snapshot is a Home Assistant proxy URL the harness never serves: masked, as it is wherever a camera is on screen
    await expect(house.page).toHaveScreenshot('room-view-security-tablet-light-en.png', {
      mask: [house.root().locator('#pane-room hp-camera-card .cam img')],
    });
  });
});
