// Accessibility: axe-core analyses the panel on every shown tab and in every sheet and popup a person can open, on the tablet and
// the phone, in English, in French and in the bare house. A serious or critical finding fails the test; the rest is attached.
// Spec: docs/specs/14-lit-shell.md, "axe in the end-to-end run (step A)". Not numbered in docs/specs/01-playwright-test.md:
// it checks no behaviour, only what a screen reader would be told.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, eachShownTab, isPhone, nestedInteractive, phoneOnly, type House} from './fixtures';
import {FULL_CFG, PHONE_TABS} from './houses';
import {openOfficeSheet} from './lights';
import {stopCharging, openFrontDoor, openPopup, pill} from './live';

type Result = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];

const BLOCKING = new Set(['serious', 'critical']);

// A rule is disabled only with the reason and the issue that owns it, and only in the states where it finds something: everywhere
// else it still runs. The list is expected to empty out; the phase-3 gate (#150) is "no serious or critical finding".
const DISABLED_RULES: {rule: string; issue: number; why: string; states: RegExp}[] = [];

/** one finding as a line the report reads without opening the trace: id, impact, help, then the first three targets */
const describeViolation = (v: Result) =>
  `${v.id} (${v.impact}): ${v.help}\n` +
  v.nodes
    .slice(0, 3)
    .map(n => `    ${JSON.stringify(n.target)}`)
    .join('\n');

/** analyses the panel as it is now; serious and critical findings fail, the rest is attached to the report */
const scan = async (house: House, state: string) => {
  const {violations} = await new AxeBuilder({page: house.page})
    .include('home-panel')
    .disableRules(DISABLED_RULES.filter(d => d.states.test(state)).map(d => d.rule))
    .analyze();
  const blocking = violations.filter(v => BLOCKING.has(v.impact ?? ''));
  const rest = violations.filter(v => !BLOCKING.has(v.impact ?? ''));
  if (rest.length)
    await test.info().attach(`axe-moderate-minor: ${state}`, {
      body: JSON.stringify(
        rest.map(v => ({id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map(n => n.target)})),
        null,
        2,
      ),
      contentType: 'application/json',
    });
  // soft: one run lists every state's findings, not only the first state that has any
  expect.soft(blocking.map(describeViolation), `axe, serious or critical, on ${state}`).toEqual([]);
  // one control, one name: no button holds another (axe's rule only sees the ones in the same tree)
  expect.soft(await nestedInteractive(house), `nested interactive elements on ${state}`).toEqual([]);
};

/**
 * scans the open sheet or popup, then closes it with Escape and waits until it is gone. `id` is the sheet's id in the sheet host
 * (`car.history`) or the popup's (`shell.settings`): test/unit/a11y-coverage.test.ts reads the first literal of every call of this
 * function and compares the set with the registry's sheets, so a sheet nobody scans fails the unit run.
 */
const scanDialog = async (house: House, id: string, dialog: string, variant?: string) => {
  const open = house.root().locator(dialog);
  await expect(open).toBeVisible();
  await scan(house, variant ? `${id} (${variant})` : id);
  await house.page.keyboard.press('Escape');
  await expect(open).toBeHidden();
};

/** opens a tab the way the screen offers it: the rail or bar, or on a phone More for the tabs the bar does not hold */
const openTab = async (house: House, tab: string) => {
  if (isPhone(house) && !PHONE_TABS.includes(tab)) {
    await house.root().locator('#moretab').click();
    await house.root().locator(`#morelist hp-stat-tile[key="${tab}"] button`).click();
    await expect(house.root().locator(`#pane-${tab}`)).toBeVisible();
  } else await house.tab(tab);
};

const scanTab = async (house: House, tab: string) => {
  // the runs are read: the Today line is drawn, and every flow the house has holds its drawing
  if (tab === 'auto') {
    await expect(house.root().locator('#pane-auto .autl')).toBeVisible({timeout: 10_000});
    await expect(house.root().locator('#pane-auto .augraph:not([data-drawn])')).toHaveCount(0, {timeout: 10_000});
  }
  await scan(house, `the ${tab} tab`);
};

/** every shown tab: on a phone the four in the bar, then the others, which More lists */
const everyTab = async (house: House) => {
  await eachShownTab(house, tab => scanTab(house, tab));
  if (!isPhone(house)) return;
  await house.root().locator('#moretab').click();
  const held = await house
    .root()
    .locator('#morelist hp-stat-tile')
    .evaluateAll(l => l.map(e => e.getAttribute('key')!));
  await house.page.keyboard.press('Escape');
  for (const tab of held) {
    await openTab(house, tab);
    await scanTab(house, tab);
  }
};

const settingsPopup = async (house: House) => {
  await house.root().locator('#gear').click();
  await scanDialog(house, 'shell.settings', '#setpop');
};

const moreSheet = async (house: House) => {
  phoneOnly();
  await house.root().locator('#moretab').click();
  await scanDialog(house, 'shell.more', 'hp-more-sheet .sheet');
};

for (const lang of ['en', 'fr'] as const) {
  test.describe(`full house, ${lang}`, () => {
    test.use({houseOpts: {cfg: FULL_CFG, lang}});

    test('every shown tab has no serious or critical finding', async ({house}) => {
      await everyTab(house);
    });

    test('the settings popup has no serious or critical finding', async ({house}) => {
      await settingsPopup(house);
    });

    test('the Status checks, charging and then needing attention, have no serious or critical finding', async ({
      house,
    }) => {
      await openPopup(house);
      await scanDialog(house, 'live.status', '#attpop', 'charging');
      await stopCharging(house);
      await openFrontDoor(house);
      await expect(pill(house).locator('.lwarn')).toHaveCount(1); // the attention pill, whatever the language
      await openPopup(house);
      await scanDialog(house, 'live.status', '#attpop', 'needs attention');
    });

    test('the light sheet has no serious or critical finding', async ({house}) => {
      await openOfficeSheet(house);
      await scanDialog(house, 'lights.room', '#sh-light');
    });

    test('a weather tile history has no serious or critical finding', async ({house}) => {
      await openTab(house, 'weather');
      // the phone's tiles are the pane's elements; the tablet's are the detail panel's buttons
      await house
        .root()
        .locator(
          isPhone(house) ? 'hp-weather-pane hp-stat-tile[key="wind"] button' : '#pane-weather button[data-wx="wind"]',
        )
        .click();
      await expect(house.root().locator('hp-weather-history hp-chart .apexcharts-canvas')).toBeVisible();
      await scanDialog(house, 'weather.history', 'hp-weather-history hp-sheet .sheet');
    });

    test('the weather detail sheet has no serious or critical finding', async ({house}) => {
      phoneOnly(); // on a tablet the detail is the Weather tab, which every shown tab covers
      await openTab(house, 'weather');
      await house.root().locator('hp-weather-pane .wxcard').click();
      await expect(house.root().locator('hp-weather-detail .sunarc')).toBeVisible();
      await scanDialog(house, 'weather.detail', 'hp-weather-pane hp-sheet .sheet');
    });

    test('the Energy detail sheet has no serious or critical finding', async ({house}) => {
      phoneOnly(); // on a tablet the detail is the Energy tab, which every shown tab covers
      await house.tab('home'); // the sheet is Home's Energy tile's: the tab draws the detail inline
      await house.root().locator('#htiles [data-opens="energy.detail"]').click();
      await expect(house.root().locator('hp-energy-detail .inner > hp-chart .apexcharts-canvas')).toBeVisible();
      await scanDialog(house, 'energy.detail', 'hp-energy-pane hp-sheet:has(hp-energy-detail) .sheet');
    });

    test('the Car detail sheet has no serious or critical finding', async ({house}) => {
      phoneOnly(); // the sheet is the phone's, from Home's car tile; the Car tab shows the detail inline, which every shown tab covers
      await openTab(house, 'home');
      await house.root().locator('[data-opens="car.detail"]').first().click();
      await expect(house.root().locator('hp-car-pane hp-sheet hp-car-summary .carhero')).toBeVisible();
      await scanDialog(house, 'car.detail', 'hp-car-pane hp-sheet.detail .sheet');
    });

    test('the Media sheet has no serious or critical finding', async ({house}) => {
      phoneOnly(); // the tiles that open it are the phone's; a tablet's Media tab is the cards, which every shown tab covers
      await openTab(house, 'media');
      await house.root().locator('hp-media-tile .tx').first().click();
      await scanDialog(house, 'media.controls', 'hp-media-pane hp-sheet .sheet');
    });

    test('the automation flow sheet has no serious or critical finding', async ({house}) => {
      phoneOnly(); // a phone's list row opens it; a tablet draws the card inline, which every shown tab covers
      await openTab(house, 'auto');
      await house.root().locator('hp-automation-list .aurow:not([disabled])').first().click();
      await expect(house.root().locator('hp-automations-pane hp-sheet .augraph svg')).toBeVisible({timeout: 10_000});
      await scanDialog(house, 'automations.flow', 'hp-automations-pane hp-sheet .sheet');
    });

    test('the camera sheet has no serious or critical finding', async ({house}) => {
      // the test house has no camera: Home Assistant adds one the way it adds any entity
      await house.setState('camera.porch', {
        state: 'idle',
        attributes: {friendly_name: 'Porch', attribution: 'UniFi Protect', access_token: 'x'},
      });
      await openTab(house, 'cams');
      await house.root().locator('hp-camera-card button.cam').first().click();
      await scanDialog(house, 'security.camera', 'hp-camera-sheet hp-sheet .sheet');
    });

    test('the Climate detail sheet has no serious or critical finding', async ({house}) => {
      phoneOnly(); // on a tablet the detail is the Climate tab, which every shown tab covers
      await house.tab('home');
      await house.root().locator('#htiles [data-opens="climate.detail"]').click();
      await expect(house.root().locator('hp-climate-pane hp-climate-detail')).toBeVisible();
      await scanDialog(house, 'climate.detail', 'hp-climate-pane hp-sheet .sheet');
    });

    test('the Air detail sheet has no serious or critical finding', async ({house}) => {
      phoneOnly(); // on a tablet the detail is the Air tab, which every shown tab covers
      await house.tab('home');
      await house.root().locator('[data-opens="air.detail"]').first().click();
      await expect(house.root().locator('hp-air-pane hp-air-detail')).toBeVisible();
      await scanDialog(house, 'air.detail', 'hp-air-pane hp-sheet:has(hp-air-detail) .sheet');
    });

    test('an Air reading history has no serious or critical finding', async ({house}) => {
      await openTab(house, 'air');
      await house.root().locator('#pane-air hp-air-room').getByRole('button', {name: /^CO₂/}).first().click();
      await expect(house.root().locator('hp-air-history hp-chart .apexcharts-canvas')).toBeVisible();
      await scanDialog(house, 'air.history', 'hp-air-history hp-sheet .sheet');
    });

    test('the Water heater sheet has no serious or critical finding', async ({house}) => {
      phoneOnly(); // the tiles that open the Energy cards are the phone's
      await house.tab('home');
      await house.root().locator('#htiles [data-opens="energy.water"]').click();
      await expect(house.root().locator('hp-water-card')).toBeVisible();
      await scanDialog(house, 'energy.water', 'hp-energy-pane hp-sheet[data-key="water"] .sheet');
    });

    test('the Hilo sheet has no serious or critical finding', async ({house}) => {
      phoneOnly(); // the tiles that open the Energy cards are the phone's
      // the test house has no Hilo: its rate sensor appears the way Home Assistant adds any entity
      await house.setState('sensor.hilo_gateway_hilo_rate_low', {state: '0.0732'});
      await house.setState('sensor.hilo_gateway_hilo_rate_current', {state: '0.0732'});
      await openTab(house, 'energy');
      await house.root().locator('hp-energy-pane hp-stat-tile[key="hilo"] button').click();
      await expect(house.root().locator('hp-hilo-card')).toBeVisible();
      await scanDialog(house, 'energy.hilo', 'hp-energy-pane hp-sheet[data-key="hilo"] .sheet');
    });

    test('a door or motion history has no serious or critical finding', async ({house}) => {
      await openTab(house, 'cams');
      await house
        .root()
        .locator('#pane-cams hp-sensor-card')
        .getByRole('button', {name: /^Front door/})
        .click();
      await expect(house.root().locator('hp-sensor-history .sevents li').first()).toBeVisible();
      await scanDialog(house, 'security.history', 'hp-sensor-history hp-sheet .sheet');
    });

    test.describe('with charging sessions', () => {
      test.use({
        houseOpts: {
          cfg: FULL_CFG,
          lang,
          charges: {
            id: 'sensor.charger_power',
            runs: Array.from({length: 12}, (_, i) => ({hoursAgo: 20 + 12 * i, hours: 3, kw: 7.2})),
          },
        },
      });

      test('the charging history sheet has no serious or critical finding', async ({house}) => {
        await openTab(house, 'car');
        await house.root().locator('hp-car-history .hist').click();
        await expect(house.root().locator('hp-car-sessions')).toBeVisible();
        await scanDialog(house, 'car.history', 'hp-car-pane hp-sheet.history .sheet');
      });
    });

    test('the More sheet has no serious or critical finding', async ({house}) => {
      await moreSheet(house);
    });
  });
}

test.describe('bare house', () => {
  test.use({houseOpts: {house: 'bare'}});

  test('every shown tab has no serious or critical finding', async ({house}) => {
    await everyTab(house);
  });

  test('the settings popup has no serious or critical finding', async ({house}) => {
    await settingsPopup(house);
  });

  test('the More sheet has no serious or critical finding', async ({house}) => {
    await moreSheet(house);
  });
});
