// The Car tab (spec 21, #251 to #253): <hp-car-pane>, <hp-car-card>, <hp-car-detail> and the control cards, <hp-charger-controls> and <hp-car-comfort>. On a phone the pane is the header with the car's name and its summary line and the card, which opens the
// detail in a sheet; on a tablet the tab is the detail, inline. The test house has a car at 64 percent with 280 km of range, locked and charging, a limit of 90 percent, and a Wallbox that says Charging.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, expectCall, isPhone, phoneOnly, tabletOnly, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

const pane = (house: House) => house.root().locator('#pane-car hp-car-pane');
const card = (house: House) => pane(house).locator('hp-car-card');
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

test.describe('on a phone', () => {
  test.beforeEach(() => phoneOnly());

  test('the card shows the house’s charge, range, lock, charger state and odometer, and the header says where the car is', async ({
    house,
  }) => {
    await house.tab('car');
    await expect(pane(house).locator('hp-pane-header h2').first()).toHaveText('Car');
    await expect(pane(house).locator(':scope > hp-pane-header > [slot="sub"]')).toHaveText(
      'Parked at home · 64.0% · 280 km · charging',
    );
    await expect(card(house).locator('.clbl')).toHaveText('Car');
    await expect(card(house).locator('.cright')).toHaveText('Parked at home›');
    await expect(card(house).locator('.hero .v')).toHaveText('64.0%');
    await expect(card(house).locator('.cline')).toHaveText('280 km range · locked · charging');
    await expect(card(house).locator('.socbar')).toHaveAttribute(
      'aria-label',
      'Battery 64.0 percent, charge limit 90 percent',
    );
    await expect(card(house).locator('.socscale')).toHaveText('0%Limit 90%');
    await expect(card(house).locator('.tile .k')).toHaveText(['Charger', 'Last charge', 'Odometer']);
    await expect(card(house).locator('.tile .v').first()).toHaveText('Charging');
    await expect(card(house).locator('.tile .v').last()).toHaveText('12,000km');
  });

  test('the bars draw once the statistics arrive: thirty of them, each with its day, and the line that counts the charging days', async ({
    house,
  }) => {
    await house.tab('car');
    await expect(card(house).locator('.spark rect')).toHaveCount(30);
    await expect(card(house).locator('.spark rect title').first()).toHaveText(/^[A-Z][a-z]{2} \d{1,2}: \d+\.\d kWh$/);
    await expect(card(house).locator('.spark')).toHaveAttribute('aria-label', /^Daily kWh bars, highest \d+\.\d kWh$/);
    await expect(card(house).locator('.cnote')).toHaveText(
      /^Daily EV energy, last 30 days: \d+ charging days?, [\d,]+ kWh\.$/,
    );
  });

  // spec 21, "Performance": the Wallbox's year is the legacy panel's shared load too and the cache answers the second; the grid's and the charger's days are the Car's alone
  test('the two windows are asked once for the panel, the day one when the tab is first shown, and not again when it is shown again', async ({
    house,
  }) => {
    await expect.poll(() => windowReads(house), 'at start, before the tab').toEqual({hours: 1, days: 0});
    await house.tab('car');
    await expect(card(house).locator('.spark rect')).toHaveCount(30);
    await expect.poll(() => windowReads(house), 'when the tab is shown').toEqual({hours: 1, days: 1});
    await house.tab('home');
    await house.tab('car');
    await expect(card(house).locator('.spark rect')).toHaveCount(30);
    // a request that came late would show after a settle: the reads are polled, once the frames have passed
    await house.page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
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
      await expect(card(house).locator('.spark rect')).toHaveCount(30);
      await expect.poll(() => windowReads(house), 'the first load').toEqual({hours: 1, days: 1});
      await house.clock.fastForward(FIFTEEN_MINUTES - 60_000);
      await house.tab('home');
      await house.tab('car');
      await house.page.evaluate(
        () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await house.page.waitForTimeout(250);
      await expect.poll(() => windowReads(house), 'a minute short of fifteen').toEqual({hours: 1, days: 1});
      await house.clock.fastForward(2 * 60_000);
      await house.tab('home');
      await house.tab('car');
      await expect.poll(() => windowReads(house), 'past fifteen').toEqual({hours: 2, days: 2});
    });
  });

  test('a recorder that is down puts the reason under the card, and the live values still draw', async ({house}) => {
    await house.page.evaluate(() => window.house.failStatistics('day'));
    await house.tab('car');
    await expect(card(house).locator('.cerr')).toHaveText(
      "History didn't load: the recorder is down. Live values still update.",
    );
    await expect(card(house).locator('.hero .v')).toHaveText('64.0%');
    await expect(card(house).locator('.spark')).toHaveCount(0);
    // the failure is logged once, and the fixture would fail on it
    expect(house.errors).toEqual([expect.stringContaining('home-panel car history')]);
    house.errors.length = 0;
  });

  test('a tap on the card, and Enter on it, open the detail in a sheet over the page, and Close shuts it', async ({
    house,
  }) => {
    await house.tab('car');
    const sheet = pane(house).locator('hp-sheet .sheet');
    await expect(sheet).toBeHidden();
    await card(house).locator('.box').click();
    await expect(sheet).toBeVisible();
    await expect(pane(house).locator('hp-sheet hp-car-detail')).toHaveCount(1);
    await pane(house).locator('hp-sheet .close').click();
    await expect(sheet).toBeHidden();
    // a closed sheet holds no detail, so no chart and no request is made for it
    await expect(pane(house).locator('hp-sheet hp-car-detail')).toHaveCount(0);
    await card(house).locator('.box').focus();
    await house.page.keyboard.press('Enter');
    await expect(sheet).toBeVisible();
  });

  test('the sheet shows the same blocks as the tablet, and the charger’s and comfort’s cards between them, from the sheet’s first draw', async ({
    house,
  }) => {
    await house.tab('car');
    await card(house).locator('.box').click();
    const detail = pane(house).locator('hp-car-detail');
    await expect(detail.locator('hp-car-battery h3')).toHaveText('Battery');
    await expect(detail.locator('hp-car-status h3')).toHaveText('Car status');
    await expect(detail.locator('hp-car-sessions h3')).toHaveText('Charging history');
    await expect(detail.locator('hp-car-ford h3')).toHaveText('From Ford');
    await expect(detail.locator('hp-car-last-plug h3')).toHaveText('Last plug-in'); // Ford has reported no plug-in in the test house
    await expect(detail.locator('hp-charger-controls h3')).toHaveText('Home charger');
    await expect(detail.locator('hp-car-comfort h3')).toHaveText('Comfort and access');
  });

  test('the detail opens from Home’s car tile on a phone, over Home, with the history asked for it', async ({
    house,
  }) => {
    await house.tab('home');
    await house.root().locator('[data-opens="car.detail"]').first().click();
    await expect(pane(house).locator('hp-sheet .sheet')).toBeVisible();
    await expect(pane(house).locator('hp-car-sessions .stiles .tile')).toHaveCount(4);
    await expect.poll(() => windowReads(house)).toEqual({hours: 1, days: 1});
  });

  // the cards are elements of the detail, so they take a tap in the phone's sheet as they do inline on a tablet
  test('the charger card in the phone’s sheet takes a tap and sends its service call', async ({house}) => {
    await house.tab('car');
    await card(house).locator('.box').click();
    const amps = pane(house).locator('hp-charger-controls hp-seg button', {hasText: '32 A'});
    await expect(amps).toBeVisible();
    await amps.click();
    await expectCall(house, /^number\.set_value \{"entity_id":"number\.charger_max_current","value":32\}$/);
    await expect(amps).toHaveAttribute('aria-checked', 'true');
  });

  test('a photo that does not load is asked for once: the sheet opened again, from Home or the tab, tries it no more', async ({
    house,
  }) => {
    const asked: string[] = [];
    house.page.on('request', request => {
      if (request.url().includes('/missing/')) asked.push(new URL(request.url()).pathname);
    });
    await house.setState(PICTURE, {state: 'unknown', attributes: {entity_picture: '/missing/photo.png'}});
    await house.tab('car');
    await expect.poll(() => asked, 'the card tries the photo').toEqual(['/missing/photo.png']);
    const sheet = pane(house).locator('hp-sheet .sheet');
    for (let opening = 0; opening < 2; opening++) {
      await card(house).locator('.box').click();
      await expect(sheet).toBeVisible();
      await expect(pane(house).locator('hp-car-battery .carside')).toBeVisible();
      await expect(pane(house).locator('hp-car-battery img.carimg')).toHaveCount(0);
      await pane(house).locator('hp-sheet .close').click();
      await expect(sheet).toBeHidden();
    }
    await house.tab('home');
    await house.tab('car');
    await expect(card(house).locator('.carside')).toBeVisible();
    await house.page.waitForTimeout(250);
    expect(asked, 'the photo asked for across two openings and a second visit').toEqual(['/missing/photo.png']);
  });

  test('a light change gives zero mutations in the pane', async ({house}) => {
    await house.tab('car');
    await expect(card(house).locator('.spark rect')).toHaveCount(30);
    await house.mutations.reset();
    await house.setState('light.living_room_1', {attributes: {brightness: 100}});
    await house.page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    expect(await house.mutations.count('hp-car-pane, hp-car-card'), 'mutations').toBe(0);
  });

  test('a photo that does not load gives way to the drawn car for the card’s life, and a new picture is not tried', async ({
    house,
  }) => {
    const asked: string[] = [];
    house.page.on('request', request => {
      if (request.url().includes('/missing/')) asked.push(new URL(request.url()).pathname);
    });
    await house.tab('car');
    await expect(card(house).locator('.carside')).toBeVisible();
    await house.setState(PICTURE, {state: 'unknown', attributes: {entity_picture: '/missing/first.png'}});
    await expect.poll(() => asked, 'the first picture is tried').toEqual(['/missing/first.png']);
    await expect(card(house).locator('.carside')).toBeVisible();
    await expect(card(house).locator('img.carimg')).toHaveCount(0);
    // Home Assistant sends the picture again at another address: the broken one is not retried, nor is the new one
    await house.setState(PICTURE, {state: 'unknown', attributes: {entity_picture: '/missing/second.png'}});
    await house.page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await house.page.waitForTimeout(250);
    expect(asked, 'the pictures asked for').toEqual(['/missing/first.png']);
    await expect(card(house).locator('img.carimg')).toHaveCount(0);
  });

  test('the tab has no serious or critical accessibility finding', async ({house}) => {
    await house.tab('car');
    await expect(card(house).locator('.spark rect')).toHaveCount(30);
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

test.describe('on a tablet', () => {
  test.beforeEach(() => tabletOnly());

  const detail = (house: House) => pane(house).locator('hp-car-detail');
  /** every element of the detail that has a shadow root of its own, for the mutation counter */
  const DETAIL_HOSTS =
    'hp-car-pane, hp-car-detail, hp-car-battery, hp-car-status, hp-car-sessions, hp-car-ford, hp-car-last-plug, hp-charger-controls, hp-car-comfort, hp-switch-row, hp-seg';

  test('the tab is the detail, inline, with its own header and no card', async ({house}) => {
    await house.tab('car');
    await expect(detail(house)).toBeVisible();
    await expect(detail(house).locator('hp-pane-header h2')).toHaveText('Car');
    await expect(detail(house).locator('hp-pane-header [slot="sub"]')).toContainText('Parked at home · locked');
    await expect(pane(house).locator('hp-car-card')).toHaveCount(0);
    await expect(house.root().locator('#pane-car > .panel')).toHaveCount(0);
  });

  // a tablet's tile has no `data-opens` (that is the phone's): it names the pane, and the shell shows the tab, whose detail is inline
  test('a tap on Home’s car tile lands on the Car tab, with the detail inline', async ({house}) => {
    await house.tab('home');
    await expect(house.root().locator('#htiles [data-opens="car.detail"]')).toHaveCount(0);
    await house.root().locator('#htiles [data-pane="car"]').click();
    await expect(house.root().locator('#pane-car')).toBeVisible();
    await expect(detail(house)).toBeVisible();
    await expect(detail(house).locator('hp-pane-header h2')).toHaveText('Car');
    await expect(house.root().locator('hp-sheet .sheet:visible')).toHaveCount(0);
  });

  test('the detail shows the car’s battery, tires and chips, and the departure line, from the house’s entities', async ({
    house,
  }) => {
    await house.tab('car');
    const d = detail(house);
    await expect(d.locator('hp-car-battery .carhero .t')).toHaveText('64.0%');
    await expect(d.locator('hp-car-battery .autonomy')).toHaveText('280 km range');
    await expect(d.locator('hp-car-battery .socscale')).toHaveText('0%Charge limit 90%100%');
    await expect(d.locator('hp-car-battery .tile .k', {hasText: 'Plug'})).toHaveCount(1);
    await expect(d.locator('hp-car-status .tp .k')).toHaveText([
      'Front left',
      'Front right',
      'Rear left',
      'Rear right',
    ]);
    await expect(d.locator('hp-car-status .clear span').first()).toBeVisible();
    await expect(d.locator('hp-car-status svg[role="img"]')).toHaveAttribute('aria-label', 'Car seen from above');
    await expect(d.locator('hp-car-ford .arow').last().locator('b')).toHaveText(/^Departure times (on|off)$/);
  });

  // twelve runs of charging twelve hours apart, each three hours at 7.2 kW (the recorder's hourly rows go back a week): the rule keeps a run of at least one kWh as a session
  test.describe('with twelve charging sessions', () => {
    test.use({
      houseOpts: {
        cfg: FULL_CFG,
        charges: {id: CHARGER, runs: Array.from({length: 12}, (_, i) => ({hoursAgo: 20 + 12 * i, hours: 3, kw: 7.2}))},
      },
    });

    test('the sessions table shows the latest ten, “Show all 12 sessions” shows every one, and “Show the latest 10” goes back', async ({
      house,
    }) => {
      await house.tab('car');
      const sessions = detail(house).locator('hp-car-sessions');
      const rows = sessions.locator('tbody tr');
      const toggle = sessions.locator('.showall');
      await expect(sessions.locator('.stiles .tile .v').first()).toHaveText('12');
      await expect(rows).toHaveCount(10);
      await expect(toggle).toHaveText('Show all 12 sessions');
      const newest = await rows.first().locator('td').first().textContent();
      await toggle.click();
      await expect(rows).toHaveCount(12);
      await expect(toggle).toHaveText('Show the latest 10');
      await expect(rows.first().locator('td').first()).toHaveText(newest ?? '');
      await toggle.click();
      await expect(rows).toHaveCount(10);
      await expect(toggle).toHaveText('Show all 12 sessions');
    });
  });

  test('the monthly chart draws from the sessions, in the charger’s colour', async ({house}) => {
    await house.tab('car');
    const chart = detail(house).locator('hp-car-sessions hp-chart');
    await expect(chart.locator('.apexcharts-bar-area').first()).toBeVisible();
  });

  test('the tab asks for both windows when it is shown, the detail being drawn from them', async ({house}) => {
    await house.tab('car');
    await expect(detail(house).locator('hp-car-sessions tbody tr').first()).toBeVisible();
    await house.page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await house.page.waitForTimeout(250);
    await expect.poll(() => windowReads(house)).toEqual({hours: 1, days: 1});
  });

  test('nothing is drawn again while nothing the detail shows changes: a light and the clock give zero mutations', async ({
    house,
  }) => {
    await house.tab('car');
    await expect(detail(house).locator('hp-car-sessions tbody tr').first()).toBeVisible();
    await expect(detail(house).locator('hp-car-sessions .apexcharts-bar-area').first()).toBeVisible();
    await house.mutations.reset();
    await house.setState('light.living_room_1', {attributes: {brightness: 100}});
    // the legacy panel redraws once a second: more than two ticks pass, and the detail's blocks stay as they were
    await house.page.waitForTimeout(2500);
    expect(await house.mutations.count(DETAIL_HOSTS), 'mutations').toBe(0);
  });

  test('a change of one entity redraws only the block that shows it', async ({house}) => {
    await house.tab('car');
    await expect(detail(house).locator('hp-car-status .tiles .tile').first()).toBeVisible();
    await house.mutations.reset();
    await house.setState('sensor.fordpass_test_odometer', {state: '12010'});
    await expect(detail(house).locator('hp-car-status .tile', {hasText: 'Odometer'}).locator('.v')).toContainText(
      '12,010',
    );
    await house.page.waitForTimeout(250);
    expect(await house.mutations.count('hp-car-status'), 'the status block').toBeGreaterThan(0);
    expect(
      await house.mutations.count(
        'hp-car-battery, hp-car-sessions, hp-car-ford, hp-car-last-plug, hp-charger-controls, hp-car-comfort',
      ),
      'the other blocks, the control cards too',
    ).toBe(0);
  });

  test('the detail has no serious or critical accessibility finding', async ({house}) => {
    await house.tab('car');
    await expect(detail(house).locator('hp-car-sessions tbody tr').first()).toBeVisible();
    await expect(detail(house).locator('hp-car-sessions .apexcharts-bar-area').first()).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

// The controls (#253): the charger's card and the comfort and access card are elements of the detail, on a tablet inline and on a phone in the sheet, with every control in both. The test house has
// the Wallbox (32 A of 6 to 40, charging, unlocked) and a locked car with none of the comfort switches, which these tests add as Ford's integration would.
test.describe('the controls', () => {
  const IGNITION = 'switch.fordpass_test_ignition';
  const DEPARTURE = 'switch.fordpass_test_departuretimes';
  const SCHEDULE = 'sensor.fordpass_test_departureschedules';

  const charger = (house: House) => pane(house).locator('hp-charger-controls');
  const comfort = (house: House) => pane(house).locator('hp-car-comfort');
  /** the detail on screen: a tablet's tab is it, a phone's card opens it in a sheet */
  const openDetail = async (house: House) => {
    await house.tab('car');
    if (isPhone(house)) await card(house).locator('.box').click();
    await expect(charger(house).locator('h3')).toHaveText('Home charger');
  };
  const button = (house: House, name: string | RegExp) => comfort(house).getByRole('button', {name});
  const departureRow = (house: House) => comfort(house).locator('hp-switch-row');
  const toast = (house: House) => house.root().locator('#toast');
  /** the service calls the panel has sent that start with `prefix`: a command the panel did not send is not in the list */
  const sent = (house: House, prefix: string) => house.calls.filter(c => c.startsWith(prefix));
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

  test('the charger’s card has the current limit, the charge limit the car reports and the two switches, as the legacy card did', async ({
    house,
  }) => {
    await openDetail(house);
    const cardOf = charger(house);
    await expect(cardOf.locator('p').first()).toHaveText('Wallbox Pulsar Plus · charging');
    // the Wallbox's own range is 6 to 40 amps: 48 is not offered
    await expect(cardOf.getByRole('radiogroup', {name: 'Charging current limit'}).getByRole('radio')).toHaveText([
      '16 A3.8 kW',
      '24 A5.8 kW',
      '32 A7.7 kW',
      '40 A9.6 kW',
    ]);
    await expect(cardOf.getByRole('radio', {name: /^32 A/})).toHaveAttribute('aria-checked', 'true');
    await expect(cardOf.locator('.hint').first()).toHaveText('Sets the Wallbox maximum current. kW assumes 240 V.');
    const limit = cardOf.getByRole('radiogroup', {name: 'Charge limit, read only'});
    await expect(limit.getByRole('radio')).toHaveText(['50%', '60%', '70%', '80%', '90%', 'Full']);
    await expect(limit.getByRole('radio', {name: '90%'})).toHaveAttribute('aria-checked', 'true');
    await expect(limit.getByRole('radio').first()).toBeDisabled();
    await expect(cardOf.getByRole('switch', {name: 'Charging'})).toHaveAttribute('aria-checked', 'true');
    await expect(cardOf.getByRole('switch', {name: 'Lock charger'})).toHaveAttribute('aria-checked', 'false');
    await expect(cardOf.locator('hp-switch-row').first()).toContainText('On. Turn off to pause');
  });

  test('the comfort card has the four buttons, the lock row, the seven days, the time, the cabin settings and Save', async ({
    house,
  }) => {
    await addComfort(house);
    await openDetail(house);
    await expect(comfort(house).locator('h3')).toHaveText('Comfort and access');
    await expect(comfort(house).locator('.ctls button')).toHaveCount(4);
    await expect(button(house, /^Remote start/)).toContainText('Off · cabin HI');
    await expect(button(house, /^Heated windshield/)).toContainText('With remote start: off');
    await expect(comfort(house).locator('.hint').first()).toHaveText('Front seats heat at level 2 with remote start.');
    await expect(comfort(house).locator('.access b')).toHaveText('Locked');
    await expect(button(house, 'Honk & flash')).toBeVisible();
    await expect(button(house, 'Unlock')).toBeVisible();
    await expect(comfort(house).getByRole('switch', {name: 'Departure times'})).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(comfort(house).getByRole('group', {name: 'Departure days'}).getByRole('button')).toHaveCount(7);
    await expect(comfort(house).getByLabel('Departure time', {exact: true})).toHaveValue('08:00');
    await expect(
      comfort(house).getByRole('radiogroup', {name: 'Cabin temperature at departure'}).getByRole('radio'),
    ).toHaveText(['Cool', 'Medium', 'Warm', 'Off']);
    await expect(button(house, 'Save schedule')).toBeVisible();
  });

  test('a tap on 24 A sends number.set_value once, shows it at once and says so', async ({house}) => {
    await openDetail(house);
    await charger(house).getByRole('radio', {name: /^24 A/}).click();
    await expectCall(house, /^number\.set_value \{"entity_id":"number\.charger_max_current","value":24\}$/);
    await expect(charger(house).getByRole('radio', {name: /^24 A/})).toHaveAttribute('aria-checked', 'true');
    await expect(charger(house).getByRole('radio', {name: /^32 A/})).toHaveAttribute('aria-checked', 'false');
    await expect(toast(house)).toHaveText('Wallbox limit set to 24 A');
    expect(sent(house, 'number.')).toHaveLength(1);
  });

  test('the charging switch sends switch.turn_off, flips at once and says what it does now', async ({house}) => {
    await openDetail(house);
    const charging = charger(house).getByRole('switch', {name: 'Charging'});
    await charging.click();
    await expectCall(house, /^switch\.turn_off \{"entity_id":"switch\.charger_pause"\}$/);
    await expect(charging).toHaveAttribute('aria-checked', 'false');
    await expect(charger(house).locator('hp-switch-row').first()).toContainText('Paused. Turn on to resume');
    await expect(toast(house)).toHaveText('Charging off');
  });

  test('the charger’s lock sends lock.lock and flips at once', async ({house}) => {
    await openDetail(house);
    const lock = charger(house).getByRole('switch', {name: 'Lock charger'});
    await lock.click();
    await expectCall(house, /^lock\.lock \{"entity_id":"lock\.charger_lock"\}$/);
    await expect(lock).toHaveAttribute('aria-checked', 'true');
    await expect(charger(house).locator('hp-switch-row').nth(1)).toContainText('Locked, needs the app or RFID card');
    await expect(toast(house)).toHaveText('Charger locked');
  });

  test('remote start once says “Tap again to start” and sends nothing; twice sends switch.turn_on', async ({house}) => {
    await addComfort(house);
    await openDetail(house);
    await button(house, /^Remote start/).click();
    const again = button(house, /^Tap again to start/);
    await expect(again).toHaveClass(/armed/);
    await house.page.waitForTimeout(300);
    expect(sent(house, 'switch.'), 'one tap changes nothing').toEqual([]);
    await again.click();
    await expectCall(house, /^switch\.turn_on \{"entity_id":"switch\.fordpass_test_ignition"\}$/);
    await expect(button(house, /^Remote start/)).not.toHaveClass(/armed/);
    await expect(button(house, /^Remote start/)).toHaveAttribute('aria-pressed', 'true');
    await expect(button(house, /^Remote start/)).toContainText('Running · cabin HI');
    await expect(toast(house)).toHaveText('Remote start sent to the car');
    // a car that runs is stopped with one tap
    await button(house, /^Remote start/).click();
    await expectCall(house, /^switch\.turn_off \{"entity_id":"switch\.fordpass_test_ignition"\}$/);
    await expect(toast(house)).toHaveText('Remote start stopped');
  });

  test('unlock needs a second tap too, a lock does not, and the status line follows what was sent', async ({house}) => {
    await openDetail(house);
    await button(house, 'Unlock').click();
    await expect(button(house, 'Tap again to unlock')).toHaveClass(/armed/);
    await house.page.waitForTimeout(300);
    expect(sent(house, 'lock.'), 'one tap changes nothing').toEqual([]);
    await button(house, 'Tap again to unlock').click();
    await expectCall(house, /^lock\.unlock \{"entity_id":"lock\.fordpass_test_doorlock"\}$/);
    await expect(comfort(house).locator('.access b')).toHaveText('Unlocked');
    await expect(toast(house)).toHaveText('Unlock sent to the car');
    await button(house, 'Lock').click();
    await expectCall(house, /^lock\.lock \{"entity_id":"lock\.fordpass_test_doorlock"\}$/);
    await expect(comfort(house).locator('.access b')).toHaveText('Locked');
    await expect(toast(house)).toHaveText('Lock sent to the car');
  });

  test('arming the unlock then the remote start leaves only the second armed', async ({house}) => {
    await addComfort(house);
    await openDetail(house);
    await button(house, 'Unlock').click();
    await button(house, /^Remote start/).click();
    await expect(button(house, /^Tap again to start/)).toBeVisible();
    await expect(button(house, 'Unlock')).toBeVisible();
    expect(sent(house, 'lock.')).toEqual([]);
  });

  test('a heater turns its own switch and says its name; the horn presses its button', async ({house}) => {
    await addComfort(house);
    await openDetail(house);
    await button(house, /^Heated wheel/).click();
    await expectCall(house, /^switch\.turn_on \{"entity_id":"switch\.fordpass_test_rccsteeringwheel"\}$/);
    await expect(button(house, /^Heated wheel/)).toHaveAttribute('aria-pressed', 'true');
    await expect(toast(house)).toHaveText('Heated wheel on');
    await button(house, 'Honk & flash').click();
    await expectCall(house, /^button\.press \{"entity_id":"button\.fordpass_test_hafdefault"\}$/);
    await expect(toast(house)).toHaveText('Honk and flash sent');
  });

  test('a rejected unlock says why in a toast that stays, and the status goes back to locked', async ({house}) => {
    await openDetail(house);
    await button(house, 'Unlock').click();
    await house.failNext('lock.unlock');
    await button(house, 'Tap again to unlock').click();
    await expect(toast(house)).toContainText("Didn't work: the service call failed on purpose");
    await expect(toast(house)).toHaveAttribute('role', 'alert');
    await expect(comfort(house).locator('.access b')).toHaveText('Locked');
    await expect(button(house, 'Unlock')).toBeVisible();
    expect(sent(house, 'lock.'), 'a failed call is not recorded').toEqual([]);
  });

  test('the departure switch sends switch.turn_on and flips at once, with its line', async ({house}) => {
    await addComfort(house);
    await openDetail(house);
    const row = departureRow(house);
    await row.getByRole('switch', {name: 'Departure times'}).click();
    await expectCall(house, /^switch\.turn_on \{"entity_id":"switch\.fordpass_test_departuretimes"\}$/);
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expect(row.locator('.tx span')).toHaveText('On · no days at 8:00 am');
    await expect(toast(house)).toHaveText('Departure times on');
  });

  test('a cleared departure time leaves the description without a time and the card alive', async ({house}) => {
    await openDetail(house);
    const description = departureRow(house).locator('.tx span');
    await comfort(house).getByLabel('Departure time', {exact: true}).fill('');
    await expect(description).toHaveText('Off · no days saved');
    // still alive: a day tapped after the time was cleared is drawn
    await comfort(house).getByRole('button', {name: 'monday'}).click();
    await expect(description).toHaveText('Off · Mon saved');
    await comfort(house).getByLabel('Departure time', {exact: true}).fill('08:30');
    await expect(description).toHaveText('Off · Mon at 8:30 am saved');
    await expect(comfort(house).getByRole('button', {name: 'monday'})).toHaveAttribute('aria-pressed', 'true');
  });

  test('saving with no cabin setting, no day or no time says what is missing and sends nothing; with all three it sends one call, the time in five-minute steps', async ({
    house,
  }) => {
    await openDetail(house);
    const save = button(house, 'Save schedule');
    await save.click();
    await expect(toast(house)).toHaveText('Pick a cabin temperature first');
    await comfort(house).getByRole('radio', {name: 'Medium'}).click();
    await save.click();
    await expect(toast(house)).toHaveText('Pick at least one day');
    await comfort(house).getByRole('button', {name: 'monday'}).click();
    await comfort(house).getByLabel('Departure time', {exact: true}).fill('');
    await save.click();
    await expect(toast(house)).toHaveText('Pick a departure time first');
    await house.page.waitForTimeout(300);
    expect(sent(house, 'fordpass.'), 'a draft that is refused is not sent').toEqual([]);
    await comfort(house).getByLabel('Departure time', {exact: true}).fill('08:03');
    await save.click();
    await expectCall(
      house,
      /^fordpass\.update_departure_schedule \{"hour":8,"minute":5,"schedule_days":\["monday"\],"precondition_temperature":"medium"\}$/,
    );
    await expect(toast(house)).toHaveText('Departure schedule saved: Mon at 8:05 am');
    await expect(comfort(house).getByLabel('Departure time', {exact: true})).toHaveValue('08:05');
    expect(sent(house, 'fordpass.')).toHaveLength(1);
  });

  test('the draft starts from Ford’s saved schedule, keeps an edit through other changes, and starts again when the saved schedule changes', async ({
    house,
  }) => {
    const saved = (days: Record<string, object>) => ({state: 'ok', attributes: {schedule: days}});
    await house.setState(SCHEDULE, saved({tuesday: {timeOfDay: {hours: 7, minutes: 15}}}));
    await openDetail(house);
    const day = (name: string) => comfort(house).getByRole('button', {name});
    await expect(day('tuesday')).toHaveAttribute('aria-pressed', 'true');
    await expect(day('monday')).toHaveAttribute('aria-pressed', 'false');
    await expect(comfort(house).getByLabel('Departure time', {exact: true})).toHaveValue('07:15');
    await day('monday').click();
    await expect(day('monday')).toHaveAttribute('aria-pressed', 'true');
    // an entity that is none of the schedule's changes: the edit stays
    await house.setState('sensor.fordpass_test_odometer', {state: '12010'});
    await house.page.waitForTimeout(250);
    await expect(day('monday')).toHaveAttribute('aria-pressed', 'true');
    // Ford's schedule changes: the draft begins again from it
    await house.setState(SCHEDULE, saved({friday: {timeOfDay: {hours: 6, minutes: 30}}}));
    await expect(day('friday')).toHaveAttribute('aria-pressed', 'true');
    await expect(day('monday')).toHaveAttribute('aria-pressed', 'false');
    await expect(comfort(house).getByLabel('Departure time', {exact: true})).toHaveValue('06:30');
  });

  test('the tab left and come back to begins the draft again and keeps no second tap waiting', async ({house}) => {
    tabletOnly();
    await openDetail(house);
    await comfort(house).getByRole('button', {name: 'wednesday'}).click();
    await button(house, 'Unlock').click();
    await expect(button(house, 'Tap again to unlock')).toBeVisible();
    await house.tab('home');
    await house.tab('car');
    await expect(comfort(house).getByRole('button', {name: 'wednesday'})).toHaveAttribute('aria-pressed', 'false');
    await expect(button(house, 'Unlock')).toBeVisible();
  });

  test('the controls have no serious or critical accessibility finding', async ({house}) => {
    await addComfort(house);
    await openDetail(house);
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

test.describe('the second tap lapses after four seconds', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  test('“Unlock” says “Unlock” again, and a tap then arms it again and sends nothing', async ({house}) => {
    await house.tab('car');
    if (isPhone(house)) await card(house).locator('.box').click();
    const unlock = pane(house).locator('hp-car-comfort').getByRole('button', {name: 'Unlock'});
    await unlock.click();
    const again = pane(house).locator('hp-car-comfort').getByRole('button', {name: 'Tap again to unlock'});
    await expect(again).toBeVisible();
    await house.clock.runFor(3900);
    await expect(again).toBeVisible();
    await house.clock.runFor(200);
    await expect(unlock).toBeVisible();
    await unlock.click();
    await expect(again).toBeVisible();
    expect(house.calls.filter(c => c.startsWith('lock.'))).toEqual([]);
  });
});

test.describe('in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, lang: 'fr'}});

  test('the cards say their words in French, the days with the initials LMMJVSD, and a refused save says why', async ({
    house,
  }) => {
    await house.tab('car');
    if (isPhone(house)) await card(house).locator('.box').click();
    const comfort = pane(house).locator('hp-car-comfort');
    await expect(pane(house).locator('hp-charger-controls h3')).toHaveText('Borne à la maison');
    await expect(pane(house).locator('hp-charger-controls p').first()).toHaveText('Wallbox Pulsar Plus · en recharge');
    await expect(comfort.locator('h3')).toHaveText('Confort et accès');
    await expect(comfort.getByRole('group', {name: 'Jours de départ'}).getByRole('button')).toHaveText([
      'L',
      'M',
      'M',
      'J',
      'V',
      'S',
      'D',
    ]);
    await comfort.getByRole('button', {name: "Enregistrer l'horaire"}).click();
    await expect(house.root().locator('#toast')).toHaveText("Choisissez d'abord une température d'habitacle");
  });
});
