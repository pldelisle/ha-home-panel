// One screenshot per state a person sees most, beyond the tabs (spec 02, "The matrix": the state rows): the idle clock with its
// stack card, the light sheet, the live-activity popup, the settings popup and the Status checks.
// Baselines live in test/e2e/__screenshots__/visual/states.spec.ts/ and are recorded only inside the Playwright image (Docker or
// `container`: npm run test:visual:update); a difference is either fixed or approved by updating them in the same pull request.
import {test, expect, IDLE_AFTER_MS, type House} from '../fixtures';
import {AFTERNOON, FULL_CFG, VIEWPORTS} from '../houses';
import {OFFICE_TILE} from '../lights';
import {pill, stopCharging, openFrontDoor, openPopup} from '../live';

const NIGHT = '2026-11-07T23:30:00-05:00';

// The idle clock draws two things that differ between runs, and neither is a tolerance question:
// - the time: it reads "now", so Date cannot be frozen (`frozen` would show 11:30 pm after five minutes). The test stops the clock
//   a minute on from the load and lets fastForward move it, so the time (and the card the stack turns to) is the same on every run.
// - the position: the panel nudges the whole block by a random offset on every tick so the screen never rests on the same pixels
//   (Math.random in renderIdle). The test pins Math.random to its middle, which is no nudge at all.
async function goIdle(house: House, viewport: 'tablet' | 'phone') {
  await house.page.evaluate(() => { Math.random = () => 0.5; });
  await house.clock.pauseAt(new Date(Date.parse(NIGHT) + 60_000));
  if (viewport === 'tablet') {
    await house.clock.fastForward(IDLE_AFTER_MS + 1_000);
  } else {
    // phones never go idle on their own: "Sleep now" in the settings starts the clock
    await house.root().locator('#gear').click();
    await house.root().locator('[data-sleep]').click();
  }
  await expect(house.root().locator('#istk .sc')).toBeVisible();
}

for (const viewport of ['tablet', 'phone'] as const) {
  test.describe(viewport, () => {
    test.use({viewport: VIEWPORTS[viewport]});

    for (const theme of ['light', 'dark'] as const) {
      test.describe(theme, () => {
        test.describe('idle clock', () => {
          test.use({houseOpts: {cfg: FULL_CFG, theme, time: NIGHT}});
          test('with a stack card', async ({house}) => {
            await goIdle(house, viewport);
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

          // the gear is `<button id="gear" aria-label="Settings">` in the header; the popup it opens is `#setpop`
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
