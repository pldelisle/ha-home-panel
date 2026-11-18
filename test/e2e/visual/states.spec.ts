// One screenshot per state a person sees most, beyond the tabs (spec 02, "The matrix": the state rows): the idle clock with its
// stack card, the light sheet, the live-activity popup, the settings popup, the Status checks, the phone's More sheet, and the
// phone's Media tab (which More lists, so the tabs' matrix never opens it) with the sheets its tiles open.
// Baselines live in test/e2e/__screenshots__/visual/states.spec.ts/ and are recorded only inside the Playwright image (Docker or
// `container`: npm run test:visual:update); a difference is either fixed or approved by updating them in the same pull request.
import {test, expect, fontsLoaded, type House} from '../fixtures';
import {AFTERNOON, FULL_CFG, KEEP_ENGLISH_NAMES, VIEWPORTS} from '../houses';
import {OFFICE_TILE} from '../lights';
import {NIGHT, goIdle} from '../idle';
import {pill, stopCharging, openFrontDoor, openPopup} from '../live';

// every screenshot shows the bundled Manrope, never the fallback it swaps from (font-display: swap)
test.beforeEach(({house}) => fontsLoaded(house));

// The idle clock draws two things that differ between runs, and neither is a tolerance question:
// - the time: it reads "now", so Date cannot be frozen (`frozen` would show 11:30 pm after five minutes). The test stops the clock
//   a minute on from the load and lets goIdle move it five minutes on, on a phone too, so the time (and the card the stack turns
//   to: the first one, on both viewports) is the same on every run.
// - the position: the idle screen nudges the whole block on every tick so the screen never rests on the same pixels (src/shell/drift.ts,
//   seeded from Math.random when the panel goes idle). Its first place is no nudge at all, whatever the seed; the test still pins
//   Math.random to its middle, before the idle clock starts, so the seed is the same on every run. idle.spec.ts covers the drift.
async function idleClock(house: House) {
  await house.page.evaluate(() => {
    Math.random = () => 0.5;
  });
  await house.clock.pauseAt(new Date(Date.parse(NIGHT) + 60_000));
  await goIdle(house);
}

// The phone's Media tab, through More, with its two tiles drawn: the television's and the living room speaker's. A tile is found by
// the name it shows, which says nothing of who draws it.
async function openMedia(house: House) {
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="media"] button').click();
  await expect(mediaTile(house, 'Samsung TV')).toBeVisible();
  await expect(mediaTile(house, 'Living room')).toBeVisible();
}
const mediaTile = (house: House, name: string) =>
  house.root().locator('#pane-media').getByText(name, {exact: true}).filter({visible: true});

// a tap on a tile's name, away from its switch or play button, opens its controls in a sheet
async function openMediaSheet(house: House, tile: string, dialog: string) {
  await openMedia(house);
  await mediaTile(house, tile).click();
  await expect(house.root().getByRole('dialog', {name: dialog})).toBeVisible();
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

            // the phone's Media tab: a wide tile per player, the television's with its switch, a speaker's with its play button
            test('Media tiles', async ({house}) => {
              await openMedia(house);
              await expect(house.page).toHaveScreenshot(`media-tiles-${viewport}-${theme}-en.png`);
            });

            // what a tile opens: the television's box, or the speakers' card, in a sheet over the tab
            if (theme === 'light') {
              test('Media sheet of the television', async ({house}) => {
                await openMediaSheet(house, 'Samsung TV', 'Samsung TV');
                await expect(house.page).toHaveScreenshot(`media-sheet-tv-${viewport}-${theme}-en.png`);
              });

              test('Media sheet of the speakers', async ({house}) => {
                await openMediaSheet(house, 'Living room', 'Speakers');
                await expect(house.page).toHaveScreenshot(`media-sheet-speakers-${viewport}-${theme}-en.png`);
              });
            }

            // coming back to More from a section: its tile carries the ring of the one shown
            if (theme === 'light')
              test('More sheet with a section shown', async ({house}) => {
                await house.root().locator('#moretab').click();
                // the More sheet's tile ("Weather 4° · …"); Home's weather card is named "Weather: 4°, …" and is matched by no space after the word
                await house
                  .root()
                  .getByRole('button', {name: /^Weather \d/})
                  .click();
                await expect(house.root().locator('#pane-weather')).toBeVisible();
                await house.root().locator('#moretab').click();
                await expect(house.root().getByRole('dialog', {name: 'More'})).toBeVisible();
                await expect(house.page).toHaveScreenshot(`more-sheet-weather-${viewport}-${theme}-en.png`);
              });

            // The glass of the sheet bends its backdrop with the Mercury-drop filter, which the guest puts in its container. The
            // harness's panel (hass first, two draws) loses it (#198, which owns the baselines of the filter); a panel drawn the way
            // Home Assistant draws it (panel first, one draw) keeps it. The sheet is in a shadow root of its own, and the filter
            // must still reach it: its panel's backdrop filter names the filter, with no picture to approve.
            if (theme === 'light')
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
                const panel = house.root().locator('hp-more-sheet .panel');
                await expect(panel).toBeVisible();
                expect(await panel.evaluate(e => getComputedStyle(e).backdropFilter)).toContain('glass-distortion');
              });
          }

          if (viewport === 'tablet') {
            // the Liquid Glass sidebar opened (#491): glass panel, the two groups, the open section tinted with its own colour. Every other
            // tablet screen shows the strip it starts as
            test('sidebar open', async ({house}) => {
              await house.tab('climate');
              await house.root().getByRole('button', {name: 'Show sidebar'}).click();
              await expect(house.root().getByRole('button', {name: 'Hide sidebar'})).toHaveAttribute(
                'aria-expanded',
                'true',
              );
              await expect(house.page).toHaveScreenshot(`sidebar-open-${viewport}-${theme}-en.png`);
            });

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
    // the pill, the Car tile and the stack are elements since #268 and follow at once; the waits keep the screenshot after them
    await expect(house.root().locator('#pane-home')).toContainText('unplugged');
    await expect(house.root().locator('#pane-home')).toContainText('Front door open');
    await openPopup(house);
    // the tiles' last lines are masked: CI drew their text a sub-pixel apart from one run to the next (#268), and the Home
    // baselines already show them; this one is about the popup, the pill and the Security card
    await expect(house.page).toHaveScreenshot('status-checks-tablet-light-en.png', {
      mask: [house.root().locator('hp-glance-tile .hs')],
    });
  });
});

// The sensor history sheet (spec 17): the door's day, with the strip, the events, the four tiles, and, in French, its times and dates in
// the profile's formats (`12 h`). The harness answers the door with three fixed on-periods, so the sheet is the same on every run.
for (const lang of ['en', 'fr'] as const)
  test.describe(`The sensor history sheet in ${lang === 'en' ? 'English' : 'French'}`, () => {
    test.use({
      viewport: VIEWPORTS.tablet,
      houseOpts: {cfg: {...FULL_CFG, names: KEEP_ENGLISH_NAMES}, lang, time: AFTERNOON, frozen: true},
    });
    test('tablet, light', async ({house}) => {
      await house.tab('cams');
      await house
        .root()
        .locator('hp-sensor-card')
        .getByRole('button', {name: /^Front door/})
        .click();
      await expect(house.root().locator('hp-sensor-history .sevents li')).toHaveCount(3);
      await expect(house.page).toHaveScreenshot(`sensor-history-tablet-light-${lang}.png`);
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

// The phone's Media tiles in French: the names, and the state under each, from the first paint.
test.describe('The Media tiles in French', () => {
  test.use({
    viewport: VIEWPORTS.phone,
    houseOpts: {cfg: {...FULL_CFG, names: KEEP_ENGLISH_NAMES}, lang: 'fr', time: AFTERNOON, frozen: true},
  });
  test('phone, light', async ({house}) => {
    await openMedia(house);
    await expect(house.page).toHaveScreenshot('media-tiles-phone-light-fr.png');
  });
});

// The Car's charging history sheet (#422): the 30 days' chart on its card, the Sessions card and the last plug-in, over the tab. Twelve sessions twelve hours apart, from the frozen clock, so the dates are the same on every run.
test.describe('Car charging history sheet', () => {
  test.use({
    viewport: VIEWPORTS.tablet,
    houseOpts: {
      cfg: FULL_CFG,
      time: AFTERNOON,
      frozen: true,
      charges: {
        id: 'sensor.charger_power',
        runs: Array.from({length: 12}, (_, i) => ({hoursAgo: 20 + 12 * i, hours: 3, kw: 7.2})),
      },
    },
  });
  test('tablet, light', async ({house}) => {
    await house.tab('car');
    const pane = house.root().locator('#pane-car hp-car-pane');
    await expect(pane.locator('hp-car-history .hist .tx small')).not.toBeEmpty();
    await pane.locator('hp-car-history .hist').click();
    await expect(pane.locator('hp-car-history-sheet .daily hp-chart .apexcharts-bar-area').first()).toBeVisible();
    await expect(house.page).toHaveScreenshot('car-history-sheet-tablet-light-en.png');
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
