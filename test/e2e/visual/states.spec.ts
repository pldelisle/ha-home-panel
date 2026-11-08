// One screenshot per state a person sees most, beyond the tabs (spec 02, "The matrix": the state rows): the idle clock with its
// stack card, the light sheet, the live-activity popup, the settings popup and the Status checks.
// Baselines live in test/e2e/__screenshots__/visual/states.spec.ts/ and are recorded only inside the Playwright image (Docker or
// `container`: npm run test:visual:update); a difference is either fixed or approved by updating them in the same pull request.
import {test, expect, type House} from '../fixtures';
import {AFTERNOON, FULL_CFG, VIEWPORTS} from '../houses';
import {OFFICE_TILE} from '../lights';
import {NIGHT, goIdle} from '../idle';
import {pill, stopCharging, openFrontDoor, openPopup} from '../live';

// The idle clock draws two things that differ between runs, and neither is a tolerance question:
// - the time: it reads "now", so Date cannot be frozen (`frozen` would show 11:30 pm after five minutes). The test stops the clock
//   a minute on from the load and lets goIdle move it five minutes on, on a phone too, so the time (and the card the stack turns
//   to: the first one, on both viewports) is the same on every run.
// - the position: the panel nudges the whole block by a random offset on every tick so the screen never rests on the same pixels
//   (Math.random in renderIdle). The test pins Math.random to its middle, which is no nudge at all. The pin MUST be installed before
//   the idle clock starts, because renderIdle draws the first offset the moment it starts; idle.spec.ts covers the drift this hides.
async function idleClock(house: House) {
  await house.page.evaluate(() => {
    Math.random = () => 0.5;
  });
  await house.clock.pauseAt(new Date(Date.parse(NIGHT) + 60_000));
  await goIdle(house);
}

for (const viewport of ['tablet', 'phone'] as const) {
  test.describe(viewport, () => {
    test.use({viewport: VIEWPORTS[viewport]});

    for (const theme of ['light', 'dark'] as const) {
      test.describe(theme, () => {
        test.describe('idle clock', () => {
          test.use({houseOpts: {cfg: FULL_CFG, theme, time: NIGHT}});
          test('with a stack card', async ({house}) => {
            await idleClock(house);
            await expect(house.page).toHaveScreenshot(`idle-stack-${viewport}-${theme}-en.png`);
          });
        });

        test.describe('full house', () => {
          test.use({houseOpts: {cfg: FULL_CFG, theme, time: AFTERNOON, frozen: true}});

          test('light sheet', async ({house}) => {
            await house.tab('lights');
            await house.root().locator(`${OFFICE_TILE}:visible .tx`).click();
            await expect(house.root().locator('#sh-light')).toBeVisible();
            await expect(house.page).toHaveScreenshot(`light-sheet-${viewport}-${theme}-en.png`);
          });

          test('live-activity popup', async ({house}) => {
            await openPopup(house);
            await expect(house.page).toHaveScreenshot(`live-popup-${viewport}-${theme}-en.png`);
          });

          if (viewport === 'tablet') {
            test('settings popup', async ({house}) => {
              await house.root().locator('#gear').click();
              await expect(house.root().locator('#setpop')).toBeVisible();
              await expect(house.page).toHaveScreenshot(`settings-${viewport}-${theme}-en.png`);
            });
          }
        });
      });
    }
  });
}

test.describe('Status checks', () => {
  test.use({viewport: VIEWPORTS.tablet, houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});
  test('front door open 20 minutes', async ({house}) => {
    await stopCharging(house); // while the car charges, the charging pill wins over the attention pill
    await openFrontDoor(house);
    await expect(pill(house)).toContainText(/needs attention/);
    await openPopup(house);
    await expect(house.page).toHaveScreenshot('status-checks-tablet-light-en.png');
  });
});
