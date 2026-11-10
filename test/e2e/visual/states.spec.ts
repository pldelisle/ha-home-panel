// One screenshot per state a person sees most, beyond the tabs (spec 02, "The matrix": the state rows): the idle clock with its
// stack card, the light sheet, the live-activity popup, the settings popup, the Status checks and the phone's More sheet.
// Baselines live in test/e2e/__screenshots__/visual/states.spec.ts/ and are recorded only inside the Playwright image (Docker or
// `container`: npm run test:visual:update); a difference is either fixed or approved by updating them in the same pull request.
import {test, expect, fontsLoaded, type House} from '../fixtures';
import {AFTERNOON, FULL_CFG, KEEP_ENGLISH_NAMES, VIEWPORTS} from '../houses';
import {OFFICE_TILE} from '../lights';
import {NIGHT, goIdle} from '../idle';
import {pill, stopCharging, openFrontDoor, openPopup} from '../live';

// every screenshot shows the bundled Montserrat, never the fallback it swaps from (font-display: swap)
test.beforeEach(({house}) => fontsLoaded(house));

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

          // the phone's More list: the sections the bar does not hold, a word under each (spec 14, the More sheet)
          if (viewport === 'phone') {
            test('More sheet', async ({house}) => {
              await house.root().locator('#moretab').click();
              await expect(house.root().getByRole('dialog', {name: 'More'})).toBeVisible();
              await expect(house.page).toHaveScreenshot(`more-sheet-${viewport}-${theme}-en.png`);
            });

            // coming back to More from a section: its tile carries the ring of the one shown
            test('More sheet with a section shown', async ({house}) => {
              await house.root().locator('#moretab').click();
              await house
                .root()
                .getByRole('button', {name: /^Weather/})
                .click();
              await expect(house.root().locator('#pane-weather')).toBeVisible();
              await house.root().locator('#moretab').click();
              await expect(house.root().getByRole('dialog', {name: 'More'})).toBeVisible();
              await expect(house.page).toHaveScreenshot(`more-sheet-weather-${viewport}-${theme}-en.png`);
            });

            // The glass of the sheet bends its backdrop with the Mercury-drop filter, which the guest puts in its container. The
            // harness's panel (hass first, two draws) loses it (#198); a panel drawn the way Home Assistant draws it (panel first,
            // one draw) keeps it. The sheet is in a shadow root of its own, and the filter must still reach it.
            test('More sheet with the Mercury drop', async ({house}) => {
              await house.page.evaluate(() => {
                const w = window as unknown as {
                  panel: HTMLElement & {narrow: boolean};
                  hass: object;
                  PANEL_CFG: object | null;
                };
                const el = document.createElement('home-panel') as HTMLElement & {
                  panel: object;
                  hass: object;
                  narrow: boolean;
                };
                el.panel = {config: w.PANEL_CFG};
                el.hass = w.hass;
                el.narrow = w.panel.narrow;
                w.panel.remove();
                document.body.appendChild(el);
                w.panel = el;
              });
              await expect(house.root().locator('#pane-home .hwx')).toBeVisible();
              await house.root().locator('#moretab').click();
              await expect(house.root().getByRole('dialog', {name: 'More'})).toBeVisible();
              await expect(house.page).toHaveScreenshot(`more-sheet-drop-${viewport}-${theme}-en.png`);
            });
          }

          if (viewport === 'tablet') {
            test('settings popup', async ({house}) => {
              await house.root().locator('#gear').click();
              await expect(house.root().locator('#setpop')).toBeVisible();
              // the footer prints the release ("Home panel v2.12.0"), which every release changes; masked, a version bump
              // leaves the baseline alone
              await expect(house.page).toHaveScreenshot(`settings-${viewport}-${theme}-en.png`, {
                mask: [house.root().locator('#setpop .ccv')],
              });
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

// The More sheet in French: its title, its sections and the word under each are French from the first paint.
test.describe('The More sheet in French', () => {
  test.use({
    viewport: VIEWPORTS.phone,
    houseOpts: {cfg: {...FULL_CFG, names: KEEP_ENGLISH_NAMES}, lang: 'fr', time: AFTERNOON, frozen: true},
  });
  test('phone, light', async ({house}) => {
    await house.root().locator('#moretab').click();
    await expect(house.root().getByRole('dialog', {name: 'Plus'})).toBeVisible();
    await expect(house.page).toHaveScreenshot('more-sheet-phone-light-fr.png');
  });
});

// The config-error card (spec 13): an admin's Home tab for a config with one problem of each kind the checker reports, in both
// languages. The tablet in the light theme is the pinned look (spec 13 asks for exactly these two baselines); the phone and the
// dark theme are covered by config-error.spec.ts's behaviour and were looked at by hand.
const BROKEN_CFG = {
  ...FULL_CFG,
  peoples: ['Alex'], // unknownKeyHint
  gizmo: true, // unknownKey
  entities: {...FULL_CFG.entities, fuel_level: 'sensor.x'}, // unknownEntity
  car: {color: '#B03A2E', battery_kwh: 'big'}, // wrongType
  rooms: [{climate: 'climate.office', icon: 'couch'}, {name: 'Den'}], // notOneOf, missingKey
  light_links: [['office']], // notAPair
  idle_stack: {reminders: [{at: '8pm'}]}, // notATime
};
for (const lang of ['en', 'fr'] as const) {
  test.describe(`The config error card in ${lang === 'en' ? 'English' : 'French'}`, () => {
    test.use({viewport: VIEWPORTS.tablet, houseOpts: {cfg: BROKEN_CFG, lang, time: AFTERNOON, frozen: true}});
    test('Home tab', async ({house}) => {
      await house.tab('home');
      await expect(house.root().locator('.cfgerr li')).toHaveCount(8);
      await expect(house.page).toHaveScreenshot(`config-error-tablet-light-${lang}.png`);
    });
  });
}
