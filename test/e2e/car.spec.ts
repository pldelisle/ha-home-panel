// The Car tab (spec 21, #251 to #253, reworked after docs/apple-hig-audit-car-2026-11-17.md): <hp-car-pane> and <hp-car-detail> with the summary, the actions row, the charger, the departure and
// the charging history's rows (each opening a sheet), the status and Ford's messages. The tab shows the detail inline on a phone as on a tablet; the phone's sheet is only for the Home tile and the
// live pill. The test house has a car at 64 percent with 280 km of range, locked and charging, a limit of 90 percent, and a Wallbox that says Charging (32 A of 6 to 40, unlocked).
import AxeBuilder from '@axe-core/playwright';
import {test, expect, expectCall, phoneOnly, tabletOnly, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

const pane = (house: House) => house.root().locator('#pane-car hp-car-pane');
const detail = (house: House) => pane(house).locator('hp-car-detail');
const summary = (house: House) => detail(house).locator('hp-car-summary');
const history = (house: House) => detail(house).locator('hp-car-history');
/** The charging history's sheet: the pane draws it (the kit's `<hp-sheet>`), and what it holds only while it is open. */
const historySheet = (house: House) => pane(house).locator('hp-car-history-sheet');
/** How long the history is kept before the tab asks again (the statistics cache's own, spec 21). */
const FIFTEEN_MINUTES = 15 * 60_000;
const STATISTICS = 'recorder/statistics_during_period';
const CHARGER = 'sensor.charger_power';
const GRID = 'sensor.house_power';
const PICTURE = 'image.fordpass_test_vehicleimage';

// the two windows of the Car's history, as the panel asks the recorder: the Wallbox's hourly power for the sessions, and the grid's and the charger's daily mean for the bars
const windowReads = async (house: House) => {
  const asked = await house.asked(STATISTICS);
  const ids = (ids: unknown) => JSON.stringify(ids);
  return {
    hours: asked.filter(m => m.period === 'hour' && ids(m.statistic_ids) === ids([CHARGER])).length,
    days: asked.filter(m => m.period === 'day' && ids(m.statistic_ids) === ids([GRID, CHARGER])).length,
  };
};
const settle = (house: House) =>
  house.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
/** The history row says how the year went once the history is in. */
const historyLoaded = (house: House) => expect(history(house).locator('.hist .tx small')).not.toBeEmpty();

test.describe('on a phone', () => {
  test.beforeEach(() => phoneOnly());

  test('the tab is the detail, inline, under the header that says where the car is: no card and no sheet', async ({
    house,
  }) => {
    await house.tab('car');
    await expect(pane(house).locator('hp-pane-header h2').first()).toHaveText('Car');
    await expect(pane(house).locator(':scope > hp-pane-header > [slot="sub"]')).toHaveText(
      'Parked at home · 64.0% · 280 km · charging',
    );
    await expect(detail(house)).toBeVisible();
    await expect(pane(house).locator('hp-car-card')).toHaveCount(0);
    await expect(pane(house).locator('hp-sheet .sheet:visible')).toHaveCount(0);
    await expect(summary(house).locator('.carhero .t')).toHaveText('64.0%');
    await expect(summary(house).locator('.socbar')).toHaveAttribute(
      'aria-label',
      'Battery 64.0 percent, charge limit 90 percent',
    );
    await expect(summary(house).locator('.socscale')).toHaveText('0%Limit 90% · set in FordPass100%');
    await expect(summary(house).locator('.facts li')).toHaveText(['Charging', 'Locked']);
  });

  // #427: the phone's sheet over the page stays a modal dialog
  test('the sheet Home’s car tile opens is a modal dialog', async ({house}) => {
    await house.root().locator('[data-opens="car.detail"]').first().click();
    const panel = pane(house).getByRole('dialog', {name: 'Car'});
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-modal', 'true');
  });

  // spec 21, "Performance": the Wallbox's year is the legacy panel's shared load too and the cache answers the second; the grid's and the charger's days are the Car's alone
  test('the two windows are asked once for the panel, the day one when the tab is first shown, and not again when it is shown again', async ({
    house,
  }) => {
    await expect.poll(() => windowReads(house), 'at start, before the tab').toEqual({hours: 1, days: 0});
    await house.tab('car');
    await historyLoaded(house);
    await expect.poll(() => windowReads(house), 'when the tab is shown').toEqual({hours: 1, days: 1});
    await house.tab('home');
    await house.tab('car');
    await settle(house);
    await house.page.waitForTimeout(250);
    await expect.poll(() => windowReads(house), 'when it is shown again').toEqual({hours: 1, days: 1});
  });

  test.describe('after fifteen minutes', () => {
    test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});

    // the clock is Playwright's: the history is read when the tab is shown, and again only once what it holds is fifteen minutes old
    test('the two windows are read again when the tab is shown after fifteen minutes, and not just before', async ({
      house,
    }) => {
      await house.tab('car');
      await historyLoaded(house);
      await expect.poll(() => windowReads(house), 'the first load').toEqual({hours: 1, days: 1});
      await house.clock.fastForward(FIFTEEN_MINUTES - 60_000);
      await house.tab('home');
      await house.tab('car');
      await settle(house);
      await house.page.waitForTimeout(250);
      await expect.poll(() => windowReads(house), 'a minute short of fifteen').toEqual({hours: 1, days: 1});
      await house.clock.fastForward(2 * 60_000);
      await house.tab('home');
      await house.tab('car');
      await expect.poll(() => windowReads(house), 'past fifteen').toEqual({hours: 2, days: 2});
    });
  });

  test('a recorder that is down puts the reason on the history row, and the live values still draw', async ({
    house,
  }) => {
    await house.page.evaluate(() => window.house.failStatistics('day'));
    await house.tab('car');
    await expect(history(house).locator('.hist .err')).toHaveText(
      "History didn't load: the recorder is down. Live values still update.",
    );
    await expect(summary(house).locator('.carhero .t')).toHaveText('64.0%');
    // the failure is logged once, and the fixture would fail on it
    expect(house.errors).toEqual([expect.stringContaining('home-panel car history')]);
    house.errors.length = 0;
  });

  test('the detail opens from Home’s car tile on a phone, over Home, with the history asked for it', async ({
    house,
  }) => {
    await house.tab('home');
    await house.root().locator('[data-opens="car.detail"]').first().click();
    const sheet = pane(house).locator('hp-sheet.detail .sheet');
    await expect(sheet).toBeVisible();
    await expect(pane(house).locator('hp-sheet hp-car-summary .carhero .t')).toHaveText('64.0%');
    await expect.poll(() => windowReads(house)).toEqual({hours: 1, days: 1});
  });

  test('the charger takes a tap on the phone’s tab and sends its service call', async ({house}) => {
    await house.tab('car');
    const amps = detail(house).locator('hp-charger-controls hp-seg button', {hasText: '24 A'});
    await amps.click();
    await expectCall(house, /^number\.set_value \{"entity_id":"number\.charger_max_current","value":24\}$/);
    await expect(amps).toHaveAttribute('aria-checked', 'true');
  });

  test('a photo that does not load gives way to the drawn car for the panel’s life, and a new picture is not tried', async ({
    house,
  }) => {
    const asked: string[] = [];
    house.page.on('request', request => {
      if (request.url().includes('/missing/')) asked.push(new URL(request.url()).pathname);
    });
    await house.tab('car');
    await expect(summary(house).locator('.carside')).toBeVisible();
    await house.setState(PICTURE, {state: 'unknown', attributes: {entity_picture: '/missing/first.png'}});
    await expect.poll(() => asked, 'the first picture is tried').toEqual(['/missing/first.png']);
    await expect(summary(house).locator('.carside')).toBeVisible();
    await expect(summary(house).locator('img.carimg')).toHaveCount(0);
    // Home Assistant sends the picture again at another address: the broken one is not retried, nor is the new one
    await house.setState(PICTURE, {state: 'unknown', attributes: {entity_picture: '/missing/second.png'}});
    await house.tab('home');
    await house.tab('car');
    await settle(house);
    await house.page.waitForTimeout(250);
    expect(asked, 'the pictures asked for').toEqual(['/missing/first.png']);
    await expect(summary(house).locator('img.carimg')).toHaveCount(0);
  });

  test('a light change gives zero mutations in the pane', async ({house}) => {
    await house.tab('car');
    await historyLoaded(house);
    await house.mutations.reset();
    await house.setState('light.living_room_1', {attributes: {brightness: 100}});
    await settle(house);
    expect(await house.mutations.count('hp-car-pane, hp-car-detail, hp-car-summary'), 'mutations').toBe(0);
  });

  test('the tab has no serious or critical accessibility finding', async ({house}) => {
    await house.tab('car');
    await historyLoaded(house);
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

test.describe('on a tablet', () => {
  test.beforeEach(() => tabletOnly());

  /** every element of the detail that has a shadow root of its own, for the mutation counter */
  const DETAIL_HOSTS =
    'hp-car-pane, hp-car-detail, hp-car-summary, hp-car-actions, hp-car-status, hp-car-departure, hp-car-history, hp-car-ford, hp-charger-controls, hp-switch, hp-seg';

  test('the tab is the detail, inline, with its own header and no card', async ({house}) => {
    await house.tab('car');
    await expect(detail(house)).toBeVisible();
    await expect(detail(house).locator('hp-pane-header h2')).toHaveText('Car');
    await expect(detail(house).locator('hp-pane-header [slot="sub"]')).toContainText('Parked at home · locked');
    await expect(pane(house).locator('hp-car-card')).toHaveCount(0);
    await expect(house.root().locator('#pane-car > .panel')).toHaveCount(0);
  });

  // #427: inline, the panel is a labelled region: a screen reader says "Car, region" for the tab, not "Car, dialog"
  test('the detail is a labelled region, not a dialog, and no modal', async ({house}) => {
    await house.tab('car');
    const panel = pane(house).getByRole('region', {name: 'Car'});
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute('aria-modal', /.*/);
    await expect(pane(house).getByRole('dialog')).toHaveCount(0);
  });

  // a tablet's tile has no `data-opens` (that is the phone's): it names the pane, and the shell shows the tab, whose detail is inline
  test('a tap on Home’s car tile lands on the Car tab, with the detail inline', async ({house}) => {
    await house.tab('home');
    await expect(house.root().locator('#htiles [data-opens="car.detail"]')).toHaveCount(0);
    await house.root().locator('#htiles [data-pane="car"]').click();
    await expect(house.root().locator('#pane-car')).toBeVisible();
    await expect(detail(house)).toBeVisible();
    await expect(house.root().locator('hp-sheet .sheet:visible')).toHaveCount(0);
  });

  test('the detail shows each fact once: the summary, the tires and the odometer, the departure row, and no message from Ford', async ({
    house,
  }) => {
    await house.tab('car');
    const d = detail(house);
    await expect(d.locator('hp-car-summary .carhero .t')).toHaveText('64.0%');
    await expect(d.locator('hp-car-summary .autonomy')).toHaveText('280 km range');
    await expect(d.locator('hp-car-summary .socscale')).toHaveText('0%Limit 90% · set in FordPass100%');
    await expect(d.locator('hp-car-status .tp .k')).toHaveText([
      'Front left',
      'Front right',
      'Rear left',
      'Rear right',
    ]);
    await expect(d.locator('hp-car-status svg[role="img"]')).toHaveAttribute('aria-label', 'Car seen from above');
    await expect(d.locator('hp-car-status .vrow', {hasText: 'Odometer'})).toContainText('12,000');
    await expect(d.locator('hp-car-departure .open b')).toHaveText('Departure');
    await expect(d.locator('hp-car-ford')).toHaveCount(0);
    // the read-only charge limit is the bar's, not a control
    await expect(d.getByRole('radiogroup', {name: /Charge limit/})).toHaveCount(0);
  });

  // twelve runs of charging twelve hours apart, each three hours at 7.2 kW (the recorder's hourly rows go back a week): the rule keeps a run of at least one kWh as a session
  test.describe('with twelve charging sessions', () => {
    test.use({
      houseOpts: {
        cfg: FULL_CFG,
        charges: {id: CHARGER, runs: Array.from({length: 12}, (_, i) => ({hoursAgo: 20 + 12 * i, hours: 3, kw: 7.2}))},
      },
    });

    test('the history row counts them, and its sheet, the host’s, shows the latest ten, all twelve, and the latest ten again', async ({
      house,
    }) => {
      await house.tab('car');
      await expect(history(house).locator('.hist .tx small')).toHaveText(/^12 sessions · \d+ kWh$/);
      await history(house).locator('.hist').click();
      const sessions = historySheet(house).locator('hp-car-sessions');
      const rows = sessions.locator('tbody tr');
      const toggle = sessions.locator('.showall');
      // the sheet opens on Month, the last 30 days: all twelve sessions are within a week; Year is the months' chart and the same table
      const tabs = pane(house).locator('hp-range-tabs');
      await expect(tabs.getByRole('tab', {name: 'Month'})).toHaveAttribute('aria-selected', 'true');
      await expect(sessions.locator('hp-chart')).toHaveCount(0);
      await expect(sessions.locator('.stiles .tile .v').first()).toHaveText('12');
      await tabs.getByRole('tab', {name: 'Year'}).click();
      await expect(sessions.locator('hp-chart .apexcharts-bar-area').first()).toBeVisible();
      await expect(rows).toHaveCount(10);
      await expect(toggle).toHaveText('Show all 12 sessions');
      await toggle.click();
      await expect(rows).toHaveCount(12);
      await expect(toggle).toHaveText('Show the latest 10');
      await toggle.click();
      await expect(rows).toHaveCount(10);
      // the bars of the last 30 days and the monthly chart, in the charger's colour
      await expect(historySheet(house).locator('.spark rect')).toHaveCount(30);
      await expect(sessions.locator('hp-chart .apexcharts-bar-area').first()).toBeVisible();
      // Done closes the sheet, and its charts go with it; Escape does too, the host's one key for the sheet open
      await pane(house).getByRole('button', {name: 'Done'}).click();
      await expect(historySheet(house)).toHaveCount(0);
      await history(house).locator('.hist').click();
      await expect(historySheet(house).locator('hp-car-sessions')).toBeVisible();
      await house.page.keyboard.press('Escape');
      await expect(historySheet(house)).toHaveCount(0);
    });
  });

  // two sessions this week and two from two months ago: Month shows the first pair, Year all four
  test.describe('with sessions older than a month', () => {
    test.use({
      houseOpts: {
        cfg: FULL_CFG,
        charges: {
          id: CHARGER,
          runs: [20, 44, 1500, 1580].map(hoursAgo => ({hoursAgo, hours: 3, kw: 7.2})),
        },
      },
    });

    test('the history sheet opens on Month, Year adds the older sessions and the months’ chart, and the choice stays when it closes', async ({
      house,
    }) => {
      await house.tab('car');
      await expect(history(house).locator('.hist .tx small')).toHaveText(/^4 sessions · \d+ kWh$/);
      await history(house).locator('.hist').click();
      const sessions = historySheet(house).locator('hp-car-sessions');
      const tabs = pane(house).locator('hp-range-tabs');
      await expect(tabs.getByRole('tab', {name: 'Month'})).toHaveAttribute('aria-selected', 'true');
      await expect(sessions.locator('tbody tr')).toHaveCount(2);
      await expect(sessions.locator('.stiles .tile .v').first()).toHaveText('2');
      await expect(sessions.locator('hp-chart')).toHaveCount(0);
      await tabs.getByRole('tab', {name: 'Year'}).click();
      await expect(sessions.locator('tbody tr')).toHaveCount(4);
      await expect(sessions.locator('.stiles .tile .v').first()).toHaveText('4');
      await expect(sessions.locator('hp-chart .apexcharts-bar-area').first()).toBeVisible();
      // the pane holds the window for the panel's life: the row on the tab still says the year, and the sheet opens on Year again
      await pane(house).getByRole('button', {name: 'Done'}).click();
      await expect(history(house).locator('.hist .tx small')).toHaveText(/^4 sessions · \d+ kWh$/);
      await history(house).locator('.hist').click();
      await expect(tabs.getByRole('tab', {name: 'Year'})).toHaveAttribute('aria-selected', 'true');
      await expect(sessions.locator('tbody tr')).toHaveCount(4);
    });
  });

  test('the tab asks for both windows when it is shown, the detail being drawn from them', async ({house}) => {
    await house.tab('car');
    await historyLoaded(house);
    await settle(house);
    await house.page.waitForTimeout(250);
    await expect.poll(() => windowReads(house)).toEqual({hours: 1, days: 1});
  });

  test('nothing is drawn again while nothing the detail shows changes: a light and the clock give zero mutations', async ({
    house,
  }) => {
    await house.tab('car');
    await historyLoaded(house);
    await house.mutations.reset();
    await house.setState('light.living_room_1', {attributes: {brightness: 100}});
    // the legacy panel redraws once a second: more than two ticks pass, and the detail's blocks stay as they were
    await house.page.waitForTimeout(2500);
    expect(await house.mutations.count(DETAIL_HOSTS), 'mutations').toBe(0);
  });

  test('a change of one entity redraws only the block that shows it', async ({house}) => {
    await house.tab('car');
    await expect(detail(house).locator('hp-car-status .vrow').first()).toBeVisible();
    await house.mutations.reset();
    await house.setState('sensor.fordpass_test_odometer', {state: '12010'});
    await expect(detail(house).locator('hp-car-status .vrow', {hasText: 'Odometer'})).toContainText('12,010');
    await house.page.waitForTimeout(250);
    expect(await house.mutations.count('hp-car-status'), 'the status block').toBeGreaterThan(0);
    expect(
      await house.mutations.count('hp-car-summary, hp-car-history, hp-car-ford, hp-charger-controls'),
      'the other blocks',
    ).toBe(0);
  });

  test('the detail has no serious or critical accessibility finding', async ({house}) => {
    await house.tab('car');
    await historyLoaded(house);
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

// The controls: the actions row, the charger and the departure, on a tablet and on a phone alike (the tab is the detail on both). The test house has a locked car with none of the comfort
// switches, which these tests add as Ford's integration would.
test.describe('the controls', () => {
  const IGNITION = 'switch.fordpass_test_ignition';
  const DEPARTURE = 'switch.fordpass_test_departuretimes';
  const SCHEDULE = 'sensor.fordpass_test_departureschedules';

  const actions = (house: House) => detail(house).locator('hp-car-actions');
  const charger = (house: House) => detail(house).locator('hp-charger-controls');
  const departure = (house: House) => detail(house).locator('hp-car-departure');
  const editor = (house: House) => departure(house).locator('dialog');
  const action = (house: House, name: string | RegExp) => actions(house).getByRole('button', {name});
  const toast = (house: House) => house.root().locator('#toast');
  /** the service calls the panel has sent that start with `prefix`: a command the panel did not send is not in the list */
  const sent = (house: House, prefix: string) => house.calls.filter(c => c.startsWith(prefix));
  const openTab = async (house: House) => {
    await house.tab('car');
    await expect(charger(house).locator('h3')).toHaveText('Home charger');
  };
  /** the switches, the select and the horn of a car whose integration has them: a remote start that is off, the departure times off */
  const addComfort = async (house: House) => {
    await house.setState(IGNITION, {state: 'off'});
    await house.setState('switch.fordpass_test_rccdefrostfront', {state: 'off'});
    await house.setState('switch.fordpass_test_rccdefrostrear', {state: 'off'});
    await house.setState('switch.fordpass_test_rccsteeringwheel', {state: 'off'});
    await house.setState('select.fordpass_test_rcctemperature', {state: 'hi'});
    await house.setState('select.fordpass_test_rccseatfrontleft', {state: 'heated2'});
    await house.setState('button.fordpass_test_hafdefault', {state: 'unknown'});
    await house.setState(DEPARTURE, {state: 'off'});
  };

  test('the charger has the current limit and its lock; the charge limit is the bar’s and the pause the actions row’s', async ({
    house,
  }) => {
    await openTab(house);
    const card = charger(house);
    await expect(card.locator('p').first()).toHaveText('Wallbox Pulsar Plus · charging');
    // the Wallbox's own range is 6 to 40 amps: 48 is not offered
    await expect(card.getByRole('radiogroup', {name: 'Charging current limit'}).getByRole('radio')).toHaveText([
      '16 A3.8 kW',
      '24 A5.8 kW',
      '32 A7.7 kW',
      '40 A9.6 kW',
    ]);
    await expect(card.getByRole('radio', {name: /^32 A/})).toHaveAttribute('aria-checked', 'true');
    await expect(card.locator('.hint').first()).toHaveText('kW at 240 V.');
    await expect(card.getByRole('switch', {name: 'Lock charger'})).toHaveAttribute('aria-checked', 'false');
    await expect(card.getByRole('switch', {name: 'Charging'})).toHaveCount(0);
    await expect(action(house, /^Pause charging/)).toBeVisible();
  });

  test('the actions row: Unlock says the car is locked now; with the car’s comfort switches, Start… and Honk & flash', async ({
    house,
  }) => {
    await openTab(house);
    await expect(action(house, /^Unlock/)).toHaveText(/Unlock\s*Locked now/);
    await expect(action(house, /^Start/)).toHaveCount(0);
    await addComfort(house);
    await expect(action(house, /^Start…/)).toHaveText(/Start…\s*Engine off/);
    await expect(action(house, 'Honk & flash')).toBeVisible();
  });

  test('a tap on 24 A sends number.set_value once, shows it at once and says so', async ({house}) => {
    await openTab(house);
    await charger(house).getByRole('radio', {name: /^24 A/}).click();
    await expectCall(house, /^number\.set_value \{"entity_id":"number\.charger_max_current","value":24\}$/);
    await expect(charger(house).getByRole('radio', {name: /^24 A/})).toHaveAttribute('aria-checked', 'true');
    await expect(charger(house).getByRole('radio', {name: /^32 A/})).toHaveAttribute('aria-checked', 'false');
    await expect(toast(house)).toHaveText('Wallbox limit set to 24 A');
    expect(sent(house, 'number.')).toHaveLength(1);
  });

  test('Pause charging sends switch.turn_off, turns into Resume charging at once and says so', async ({house}) => {
    await openTab(house);
    await action(house, /^Pause charging/).click();
    await expectCall(house, /^switch\.turn_off \{"entity_id":"switch\.charger_pause"\}$/);
    await expect(action(house, /^Resume charging/)).toHaveText(/Resume charging\s*Paused/);
    await expect(toast(house)).toHaveText('Charging off');
  });

  test('the charger’s lock sends lock.lock and flips at once', async ({house}) => {
    await openTab(house);
    const lock = charger(house).getByRole('switch', {name: 'Lock charger'});
    await lock.click();
    await expectCall(house, /^lock\.lock \{"entity_id":"lock\.charger_lock"\}$/);
    await expect(lock).toHaveAttribute('aria-checked', 'true');
    await expect(charger(house).locator('hp-switch-row')).toContainText('Locked, needs the app or RFID card');
    await expect(toast(house)).toHaveText('Charger locked');
  });

  test('Start… asks first and sends nothing until Start; Cancel sends nothing; a running engine stops with one tap', async ({
    house,
  }) => {
    await addComfort(house);
    await openTab(house);
    const dialog = actions(house).locator('hp-dialog[data-ask="start"] dialog');
    await action(house, /^Start…/).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h4')).toHaveText('Start the car?');
    await house.page.waitForTimeout(300);
    expect(sent(house, 'switch.'), 'opening the question changes nothing').toEqual([]);
    await dialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(dialog).toBeHidden();
    expect(sent(house, 'switch.'), 'Cancel changes nothing').toEqual([]);
    await action(house, /^Start…/).click();
    await dialog.getByRole('button', {name: 'Start', exact: true}).click();
    await expectCall(house, /^switch\.turn_on \{"entity_id":"switch\.fordpass_test_ignition"\}$/);
    await expect(toast(house)).toHaveText('Remote start sent to the car');
    await expect(action(house, /^Stop engine/)).toHaveText(/Stop engine\s*Running/);
    await action(house, /^Stop engine/).click();
    await expectCall(house, /^switch\.turn_off \{"entity_id":"switch\.fordpass_test_ignition"\}$/);
    await expect(toast(house)).toHaveText('Remote start stopped');
  });

  test('the heaters are switches in the Start question, each sending its own; Honk & flash presses its button', async ({
    house,
  }) => {
    await addComfort(house);
    await openTab(house);
    await action(house, /^Start…/).click();
    const question = actions(house).locator('hp-dialog[data-ask="start"]');
    const dialog = question.locator('dialog');
    await expect(question.getByRole('switch')).toHaveCount(3);
    await question.getByRole('switch', {name: 'Heated wheel'}).click();
    await expectCall(house, /^switch\.turn_on \{"entity_id":"switch\.fordpass_test_rccsteeringwheel"\}$/);
    await expect(question.getByRole('switch', {name: 'Heated wheel'})).toHaveAttribute('aria-checked', 'true');
    await expect(toast(house)).toHaveText('Heated wheel on');
    expect(sent(house, 'switch.turn_on {"entity_id":"switch.fordpass_test_ignition"'), 'no start').toEqual([]);
    await dialog.getByRole('button', {name: 'Cancel'}).click();
    await action(house, 'Honk & flash').click();
    await expectCall(house, /^button\.press \{"entity_id":"button\.fordpass_test_hafdefault"\}$/);
    await expect(toast(house)).toHaveText('Honk and flash sent');
  });

  test('Unlock asks first and sends nothing until Unlock; Lock does not ask', async ({house}) => {
    await openTab(house);
    const dialog = actions(house).locator('hp-dialog[data-ask="unlock"] dialog');
    await action(house, /^Unlock/).click();
    await expect(dialog.locator('h4')).toHaveText('Unlock the car?');
    await house.page.waitForTimeout(300);
    expect(sent(house, 'lock.'), 'opening the question changes nothing').toEqual([]);
    await dialog.getByRole('button', {name: 'Unlock'}).click();
    await expectCall(house, /^lock\.unlock \{"entity_id":"lock\.fordpass_test_doorlock"\}$/);
    await expect(action(house, /^Lock/)).toHaveText(/Lock\s*Unlocked now/);
    await expect(toast(house)).toHaveText('Unlock sent to the car');
    await action(house, /^Lock/).click();
    await expectCall(house, /^lock\.lock \{"entity_id":"lock\.fordpass_test_doorlock"\}$/);
    await expect(toast(house)).toHaveText('Lock sent to the car');
  });

  test('a tap on the backdrop cancels the Unlock question and sends nothing; a tap inside it does not', async ({
    house,
  }) => {
    await openTab(house);
    const dialog = actions(house).locator('hp-dialog[data-ask="unlock"] dialog');
    await action(house, /^Unlock/).click();
    await dialog.locator('p').click();
    await expect(dialog).toBeVisible();
    await house.page.mouse.click(5, 5);
    await expect(dialog).toBeHidden();
    expect(sent(house, 'lock.')).toEqual([]);
  });

  test('Escape cancels the Unlock question and sends nothing, and the question opens again on the next tap', async ({
    house,
  }) => {
    await openTab(house);
    const dialog = actions(house).locator('hp-dialog[data-ask="unlock"] dialog');
    await action(house, /^Unlock/).click();
    await expect(dialog).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(sent(house, 'lock.')).toEqual([]);
    await action(house, /^Unlock/).click();
    await expect(dialog).toBeVisible();
  });

  test('Escape in the editor opened in the phone’s detail sheet closes the editor alone, and the sheet stays', async ({
    house,
  }) => {
    phoneOnly();
    await house.tab('home');
    await house.root().locator('[data-opens="car.detail"]').first().click();
    const sheet = pane(house).locator('hp-sheet.detail .sheet');
    await expect(sheet).toBeVisible();
    const inSheet = pane(house).locator('hp-sheet.detail hp-car-departure');
    await inSheet.locator('button.open').click();
    await expect(inSheet.locator('dialog')).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(inSheet.locator('dialog')).toBeHidden();
    await expect(sheet).toBeVisible();
  });

  test('a rejected unlock says why in a toast that stays, and the button goes back to Unlock', async ({house}) => {
    await openTab(house);
    await action(house, /^Unlock/).click();
    await house.failNext('lock.unlock');
    await actions(house).locator('hp-dialog[data-ask="unlock"] dialog').getByRole('button', {name: 'Unlock'}).click();
    await expect(toast(house)).toContainText("Didn't work: the service call failed on purpose");
    await expect(toast(house)).toHaveAttribute('role', 'alert');
    await expect(action(house, /^Unlock/)).toHaveText(/Locked now/);
    expect(sent(house, 'lock.'), 'a failed call is not recorded').toEqual([]);
  });

  test('the departure row is one button, with no switch; the switch is the editor’s first row, sends switch.turn_on at once and flips', async ({
    house,
  }) => {
    await addComfort(house);
    await openTab(house);
    const row = departure(house).locator('button.open');
    await expect(departure(house).locator('button:not(dialog button)')).toHaveCount(1);
    await expect(departure(house).locator('hp-switch:not(dialog hp-switch)')).toHaveCount(0);
    await expect(row.locator('small')).toHaveText('No times saved · Off');
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await row.click();
    const toggle = editor(house).getByRole('switch', {name: 'Departure times'});
    await expect(editor(house).locator('.lrow').first()).toContainText('Departure times');
    await toggle.click();
    await expectCall(house, /^switch\.turn_on \{"entity_id":"switch\.fordpass_test_departuretimes"\}$/);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toast(house)).toHaveText('Departure times on');
    // it acted at once: Save was not pressed, and the row behind says On
    expect(sent(house, 'fordpass.')).toEqual([]);
    await editor(house).getByRole('button', {name: 'Cancel'}).click();
    await expect(row.locator('small')).toHaveText('No times saved · On');
  });

  test('the editor saves only on Save: it waits for a cabin and a day and says why, then sends one call in five-minute steps', async ({
    house,
  }) => {
    await openTab(house);
    await departure(house).locator('button.open').click();
    const sheet = editor(house);
    const save = sheet.getByRole('button', {name: 'Save'});
    await expect(save).toBeDisabled();
    await expect(sheet.locator('.foot b')).toHaveText('Pick a cabin temperature first.');
    await sheet.getByRole('combobox').selectOption('medium');
    await expect(sheet.locator('.foot b')).toHaveText('Pick at least one day.');
    await sheet.getByRole('checkbox', {name: 'Every Monday'}).click();
    await expect(sheet.getByRole('checkbox', {name: 'Every Monday'})).toHaveAttribute('aria-checked', 'true');
    await sheet.locator('input[type="time"]').fill('08:03');
    await expect(save).toBeEnabled();
    await house.page.waitForTimeout(300);
    expect(sent(house, 'fordpass.'), 'nothing is sent before Save').toEqual([]);
    await save.click();
    await expectCall(
      house,
      /^fordpass\.update_departure_schedule \{"hour":8,"minute":5,"schedule_days":\["monday"\],"precondition_temperature":"medium"\}$/,
    );
    await expect(toast(house)).toHaveText('Departure schedule saved: Mon at 8:05 am');
    await expect(sheet).toBeHidden();
    expect(sent(house, 'fordpass.')).toHaveLength(1);
  });

  test('Cancel sends nothing and starts the draft again from what Ford saved', async ({house}) => {
    await house.setState(SCHEDULE, {
      state: 'ok',
      attributes: {schedule: {tuesday: {timeOfDay: {hours: 7, minutes: 15}}}},
    });
    await openTab(house);
    await expect(departure(house).locator('.open small')).toHaveText('Tue at 7:15 am · Off');
    await departure(house).locator('button.open').click();
    const day = (name: string) => editor(house).getByRole('checkbox', {name});
    await expect(day('Every Tuesday')).toHaveAttribute('aria-checked', 'true');
    await expect(editor(house).locator('input[type="time"]')).toHaveValue('07:15');
    await day('Every Monday').click();
    await expect(day('Every Monday')).toHaveAttribute('aria-checked', 'true');
    await editor(house).getByRole('button', {name: 'Cancel'}).click();
    await expect(editor(house)).toBeHidden();
    await departure(house).locator('button.open').click();
    await expect(day('Every Monday')).toHaveAttribute('aria-checked', 'false');
    expect(sent(house, 'fordpass.')).toEqual([]);
  });

  test('the draft keeps an edit through other changes, and starts again when Ford’s saved schedule changes', async ({
    house,
  }) => {
    const saved = (days: Record<string, object>) => ({state: 'ok', attributes: {schedule: days}});
    await house.setState(SCHEDULE, saved({tuesday: {timeOfDay: {hours: 7, minutes: 15}}}));
    await openTab(house);
    await departure(house).locator('button.open').click();
    const day = (name: string) => editor(house).getByRole('checkbox', {name});
    await day('Every Monday').click();
    // an entity that is none of the schedule's changes: the edit stays
    await house.setState('sensor.fordpass_test_odometer', {state: '12010'});
    await house.page.waitForTimeout(250);
    await expect(day('Every Monday')).toHaveAttribute('aria-checked', 'true');
    // Ford's schedule changes: the draft begins again from it
    await house.setState(SCHEDULE, saved({friday: {timeOfDay: {hours: 6, minutes: 30}}}));
    await expect(day('Every Friday')).toHaveAttribute('aria-checked', 'true');
    await expect(day('Every Monday')).toHaveAttribute('aria-checked', 'false');
    await expect(editor(house).locator('input[type="time"]')).toHaveValue('06:30');
  });

  test('a save followed by Ford’s own schedule update keeps the cabin choice, which Ford does not report', async ({
    house,
  }) => {
    await openTab(house);
    await departure(house).locator('button.open').click();
    await editor(house).getByRole('combobox').selectOption('high');
    await editor(house).getByRole('checkbox', {name: 'Every Monday'}).click();
    await editor(house).getByRole('button', {name: 'Save'}).click();
    await expectCall(house, /^fordpass\.update_departure_schedule .*"precondition_temperature":"high"\}$/);
    // the house answers the save: the schedule sensor now says what was sent
    await house.setState(SCHEDULE, {
      state: 'ok',
      attributes: {schedule: {monday: {timeOfDay: {hours: 8, minutes: 0}}}},
    });
    await expect(departure(house).locator('.open small')).toHaveText('Mon at 8:00 am · Off');
    await departure(house).locator('button.open').click();
    await expect(editor(house).getByRole('combobox')).toHaveValue('high');
  });

  test('the tab left and come back to begins the draft again', async ({house}) => {
    tabletOnly();
    await openTab(house);
    await departure(house).locator('button.open').click();
    await editor(house).getByRole('checkbox', {name: 'Every Wednesday'}).click();
    await editor(house).getByRole('button', {name: 'Cancel'}).click();
    await house.tab('home');
    await house.tab('car');
    await departure(house).locator('button.open').click();
    await expect(editor(house).getByRole('checkbox', {name: 'Every Wednesday'})).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('the controls and their sheets have no serious or critical accessibility finding', async ({house}) => {
    await addComfort(house);
    await openTab(house);
    const scan = async () => {
      const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
      return violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id);
    };
    expect(await scan(), 'the tab').toEqual([]);
    await departure(house).locator('button.open').click();
    expect(await scan(), 'the departure editor').toEqual([]);
    await editor(house).getByRole('button', {name: 'Cancel'}).click();
    await action(house, /^Start…/).click();
    expect(await scan(), 'the Start question').toEqual([]);
  });
});

test.describe('in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, lang: 'fr'}});

  test('the charger, the actions and the editor say their words in French, and Save says why it waits', async ({
    house,
  }) => {
    await house.tab('car');
    await expect(detail(house).locator('hp-charger-controls h3')).toHaveText('Borne à la maison');
    await expect(detail(house).locator('hp-charger-controls p').first()).toHaveText(
      'Wallbox Pulsar Plus · en recharge',
    );
    await expect(
      detail(house)
        .locator('hp-car-actions')
        .getByRole('button', {name: /^Déverrouiller/}),
    ).toHaveText(/Déverrouiller\s*Verrouillée/);
    const departure = detail(house).locator('hp-car-departure');
    await departure.locator('button.open').click();
    const sheet = departure.locator('dialog');
    await expect(sheet.locator('h4')).toHaveText('Départ');
    await expect(sheet.getByRole('checkbox')).toHaveText([
      'Chaque lundi',
      'Chaque mardi',
      'Chaque mercredi',
      'Chaque jeudi',
      'Chaque vendredi',
      'Chaque samedi',
      'Chaque dimanche',
    ]);
    await expect(sheet.locator('.foot b')).toHaveText("Choisissez d'abord une température d'habitacle.");
    await expect(sheet.getByRole('button', {name: 'Enregistrer'})).toBeDisabled();
  });
});
