// Accessibility: axe-core analyses the panel on every shown tab and in every sheet and popup a person can open, on the tablet and
// the phone, in English, in French and in the bare house. A serious or critical finding fails the test; the rest is attached.
// Spec: docs/specs/14-lit-shell.md, "axe in the end-to-end run (step A)". Not numbered in docs/specs/01-playwright-test.md:
// it checks no behaviour, only what a screen reader would be told.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, eachShownTab, isPhone, phoneOnly, type House} from './fixtures';
import {FULL_CFG, PHONE_TABS} from './houses';
import {openOfficeSheet} from './lights';
import {stopCharging, openFrontDoor, openPopup, pill} from './live';

type Result = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];

const BLOCKING = new Set(['serious', 'critical']);

// A rule is disabled only with the reason and the issue that owns it, and only in the states where it finds something: everywhere
// else it still runs. The list is expected to empty out; the phase-3 gate (#150) is "no serious or critical finding".
const DISABLED_RULES: {rule: string; issue: number; why: string; states: RegExp}[] = [
  {
    rule: 'nested-interactive',
    issue: 192,
    why: 'a light tile and a media card are a button that holds a switch; fixing it moves markup the arrange mode and the baselines rest on',
    states: /^the (lights tab|light sheet|media tab)$/, // the sheet opens over the Lights tab, so its tiles are still in the page
  },
  {
    rule: 'color-contrast',
    issue: 191,
    why: "the Automations 'done' pill is 3.92:1 in the light theme; a colour change moves pixels, so it needs its own baselines",
    states: /^the auto tab$/,
  },
];

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
};

/** scans the open sheet or popup, then closes it with Escape and waits until it is gone */
const scanDialog = async (house: House, state: string, dialog: string) => {
  const open = house.root().locator(dialog);
  await expect(open).toBeVisible();
  await scan(house, state);
  await house.page.keyboard.press('Escape');
  await expect(open).toBeHidden();
};

/** opens a tab the way the screen offers it: the rail or bar, or on a phone More for the tabs the bar does not hold */
const openTab = async (house: House, tab: string) => {
  if (isPhone(house) && !PHONE_TABS.includes(tab)) {
    await house.root().locator('#moretab').click();
    await house.root().locator(`#morelist [data-pane="${tab}"]`).click();
    await expect(house.root().locator(`#pane-${tab}`)).toBeVisible();
  } else await house.tab(tab);
};

const scanTab = async (house: House, tab: string) => {
  if (tab === 'auto') await expect(house.root().locator('#pane-auto svg').first()).toBeVisible({timeout: 10_000});
  await scan(house, `the ${tab} tab`);
};

/** every shown tab: on a phone the four in the bar, then the others, which More lists */
const everyTab = async (house: House) => {
  await eachShownTab(house, tab => scanTab(house, tab));
  if (!isPhone(house)) return;
  await house.root().locator('#moretab').click();
  const held = await house
    .root()
    .locator('#morelist [data-pane]')
    .evaluateAll(l => l.map(e => (e as HTMLElement).dataset.pane!));
  await house.page.keyboard.press('Escape');
  for (const tab of held) {
    await openTab(house, tab);
    await scanTab(house, tab);
  }
};

const settingsPopup = async (house: House) => {
  await house.root().locator('#gear').click();
  await scanDialog(house, 'the settings popup', '#setpop');
};

const moreSheet = async (house: House) => {
  phoneOnly();
  await house.root().locator('#moretab').click();
  await scanDialog(house, 'the More sheet', '#sh-more');
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
      await scanDialog(house, 'the Status checks (charging)', '#attpop');
      await stopCharging(house);
      await openFrontDoor(house);
      await expect(pill(house).locator('.lwarn')).toHaveCount(1); // the attention pill, whatever the language
      await openPopup(house);
      await scanDialog(house, 'the Status checks (needs attention)', '#attpop');
    });

    test('the light sheet has no serious or critical finding', async ({house}) => {
      await openOfficeSheet(house);
      await scanDialog(house, 'the light sheet', '#sh-light');
    });

    test('a weather tile history has no serious or critical finding', async ({house}) => {
      await openTab(house, 'weather');
      await house.root().locator('#pane-weather button[data-wx="wind"]').click();
      await expect(house.root().locator('#sh-wx #c-wx .apexcharts-canvas')).toBeVisible();
      await scanDialog(house, 'the weather history sheet', '#sh-wx');
    });

    test('the camera sheet has no serious or critical finding', async ({house}) => {
      // the test house has no camera: Home Assistant adds one the way it adds any entity
      await house.setState('camera.porch', {
        state: 'idle',
        attributes: {friendly_name: 'Porch', attribution: 'UniFi Protect', access_token: 'x'},
      });
      await openTab(house, 'cams');
      await house.root().locator('#camhost [data-cam]').first().click();
      await scanDialog(house, 'the camera sheet', '#sh-cam');
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
