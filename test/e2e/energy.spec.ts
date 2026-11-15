// The Energy tab (spec 19): <hp-energy-pane>, <hp-energy-card> with <hp-power-flow>, <hp-water-card> and <hp-hilo-card>. The card and the two
// tiles are the phone's, where a tap opens the detail's sheet or a card's; on a tablet the tab is the legacy detail inline (#240 moves it) with
// the water heater's and Hilo's cards beside it. The test house has a 3.24 kW meter, a water heater at 50 degrees idle and a charger at 7.1 kW; it
// has no Hilo until a test adds its rate sensor.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, phoneOnly, tabletOnly, type House} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

const pane = (house: House) => house.root().locator('#pane-energy hp-energy-pane');
const card = (house: House) => pane(house).locator('hp-energy-card');
const flow = (house: House) => card(house).locator('hp-power-flow');
const water = (house: House) => house.root().locator('hp-water-card');
const hilo = (house: House) => house.root().locator('hp-hilo-card');
const STATISTICS = 'recorder/statistics_during_period';
const GRID = 'sensor.house_power';
const HILO_RATE = 'sensor.hilo_gateway_hilo_rate_current';

// Energy is under More on a phone
const openTab = async (house: House) => {
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="energy"] button').click();
  await expect(house.root().locator('#pane-energy')).toBeVisible();
};

// the statistics requests of the history's power windows: the grid with the loads for a week by the hour and for a year by the day, and the
// water heater for a day by five minutes (the meter's two windows name the meter alone)
const powerReads = async (house: House) =>
  (await house.asked(STATISTICS)).filter(m => {
    const ids = m.statistic_ids as string[];
    return ids.includes(GRID) || (m.period === '5minute' && ids.includes('sensor.water_heater_temperature'));
  }).length;

// a house with Hilo: its current-rate sensor is in the states, at the low tier
const addHilo = async (house: House) => {
  await house.setState('sensor.hilo_gateway_hilo_rate_low', {state: '0.0732'});
  await house.setState(HILO_RATE, {state: '0.0732'});
};

test.describe('on a phone', () => {
  test.beforeEach(() => phoneOnly());

  test('the tab shows the house’s grid value in the flow, the rate line and the four tiles', async ({house}) => {
    await openTab(house);
    await expect(pane(house).locator(':scope > hp-pane-header > [slot="sub"]')).toHaveText(
      'Grid supplying 3.24 kW · room heating 2.40 kW · Hilo rate unknown',
    );
    await expect(card(house).locator('.elbl')).toHaveText('Home energy');
    await expect(card(house).locator('.eright')).toHaveText('Grid only · rate unknown›');
    await expect(flow(house).locator('text.big').nth(1)).toHaveText('3.24');
    await expect(flow(house).locator('text.st', {hasText: /^kW · HOME$/})).toHaveText('kW · HOME');
    await expect(card(house).locator('.tile .k')).toHaveText(['Today', 'Room heating', 'Water heating', 'EV charging']);
    // the statistics arrive: today's figure is a number and no longer a dash
    await expect(card(house).locator('.tile .v').first()).not.toHaveText(/^–/);
  });

  test('the flow’s one SVG is bound and not rebuilt: it stays the same node across two updates while its numbers change', async ({
    house,
  }) => {
    await openTab(house);
    const svg = flow(house).locator('svg');
    await expect(svg).toBeVisible();
    await flow(house).evaluate(host => {
      (window as unknown as {flowSvg: Element | null}).flowSvg = host.shadowRoot!.querySelector('svg');
    });
    const gridWidth = () => svg.locator('line').first().getAttribute('stroke-width');
    const before = await gridWidth();
    await house.setState(GRID, {state: '4100'});
    await expect(flow(house).locator('text.big').nth(1)).toHaveText('4.10');
    await house.setState(GRID, {state: '4900'});
    await expect(flow(house).locator('text.big').nth(1)).toHaveText('4.90');
    expect(await gridWidth(), 'the line grows with the power').not.toBe(before);
    expect(
      await flow(house).evaluate(
        host => host.shadowRoot!.querySelector('svg') === (window as unknown as {flowSvg: Element}).flowSvg,
      ),
      'the same svg node',
    ).toBe(true);
  });

  test('a tap on the card asks for the detail’s sheet, and Enter does too', async ({house}) => {
    await openTab(house);
    const box = card(house).getByRole('button', {name: /Home energy/});
    await expect(box).toHaveAttribute('aria-description', 'Open home energy details');
    await box.click();
    await expect(house.root().locator('#sh-energy')).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(house.root().locator('#sh-energy')).toBeHidden();
    await box.focus();
    await house.page.keyboard.press('Enter');
    await expect(house.root().locator('#sh-energy')).toBeVisible();
  });

  test('the water heater’s tile opens its card in a sheet: the same figures as on a tablet, and Close closes it', async ({
    house,
  }) => {
    await openTab(house);
    const tile = pane(house).locator('hp-stat-tile[key="water"]');
    await expect(tile.locator('.tx b')).toHaveText('Water heater');
    await expect(tile.locator('.tx small')).toHaveText('Idle');
    await expect(pane(house).locator('hp-stat-tile')).toHaveCount(1); // the test house has no Hilo
    await expect(water(house)).toHaveCount(0); // a closed sheet holds no card
    await tile.locator('button').click();
    const sheet = pane(house).locator('hp-sheet[open]');
    await expect(sheet.locator('h2')).toHaveText('Water heater');
    await expect(water(house).locator('.hero .v')).toHaveText('50.0°C');
    await expect(water(house).locator('.hero .state')).toHaveText('Idle · 0 W');
    await sheet.locator('.close').click();
    await expect(pane(house).locator('hp-sheet[open]')).toHaveCount(0);
    await expect(water(house)).toHaveCount(0);
  });

  test('Hilo’s tile opens its card with the rate, the tier and three tiles', async ({house}) => {
    await openTab(house);
    await addHilo(house);
    const tile = pane(house).locator('hp-stat-tile[key="hilo"]');
    await expect(tile.locator('.tx b')).toHaveText('Hilo');
    await tile.locator('button').click();
    await expect(hilo(house).locator('.hero .v')).toHaveText('7.32¢/kWh');
    await expect(hilo(house).locator('.hero .state')).toHaveText('Low tier');
    await expect(hilo(house).locator('.tile .k')).toHaveText(['Medium', 'Reward', 'Rewards']);
    await house.page.keyboard.press('Escape');
    await expect(hilo(house)).toHaveCount(0);
  });

  test('Home’s Water heater tile opens the same sheet over Home, and the tab stays Home', async ({house}) => {
    await house.tab('home');
    await house.root().locator('#htiles [data-opens="energy.water"]').click();
    await expect(pane(house).locator('hp-sheet[open] h2')).toHaveText('Water heater');
    await expect(water(house).locator('.hero .v')).toHaveText('50.0°C');
    await expect(house.root().locator('#pane-home')).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(water(house)).toHaveCount(0);
  });

  test('a light change gives zero mutations in the pane, its card and the flow', async ({house}) => {
    await openTab(house);
    await expect(flow(house).locator('svg')).toBeVisible();
    await house.mutations.reset();
    await house.setState('light.living_room_1', {attributes: {brightness: 100}});
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-energy-pane, hp-energy-card, hp-power-flow'), 'mutations').toBe(0);
  });

  test('the tab has no serious or critical accessibility finding, nor has a card’s sheet', async ({house}) => {
    await openTab(house);
    await expect(flow(house).locator('svg')).toBeVisible();
    const serious = async () =>
      (await new AxeBuilder({page: house.page}).include('home-panel').analyze()).violations
        .filter(v => v.impact === 'serious' || v.impact === 'critical')
        .map(v => v.id);
    expect(await serious()).toEqual([]);
    await pane(house).locator('hp-stat-tile[key="water"] button').click();
    await expect(water(house).locator('.hero .v')).toBeVisible();
    expect(await serious()).toEqual([]);
  });
});

test.describe('on a tablet', () => {
  test.beforeEach(() => tabletOnly());

  test('the water heater’s card reads as before, with the last 24 hours once the history is there; no Hilo card without Hilo', async ({
    house,
  }) => {
    await house.tab('energy');
    await expect(water(house).locator('.elbl')).toHaveText('Water heater');
    await expect(water(house).locator('.hero .v')).toHaveText('50.0°C');
    await expect(water(house).locator('.hero .state')).toHaveText('Idle · 0 W');
    await expect(water(house).locator('.whleg span')).toHaveText(['Water temperature', 'Heating power']);
    await expect(water(house).locator('.whline')).toContainText('Last 24 hours:');
    await expect(hilo(house)).toHaveCount(0);
    await expect(card(house)).toHaveCount(0); // the card is the phone's: the detail is the tablet's
  });

  test('Hilo’s card shows the rate and the tier beside the water heater’s once the house has Hilo', async ({house}) => {
    await house.tab('energy');
    await addHilo(house);
    await expect(hilo(house).locator('.hero .v')).toHaveText('7.32¢/kWh');
    await expect(hilo(house).locator('.hero .state')).toHaveText('Low tier');
    await expect(water(house)).toHaveCount(1);
  });

  test('the legacy detail still sits inline above the cards', async ({house}) => {
    await house.tab('energy');
    const inline = house.root().locator('#ehost > .panel');
    await expect(inline).toBeVisible();
    const detail = await inline.boundingBox();
    const cards = await water(house).boundingBox();
    expect(cards!.y, 'the cards come after the detail').toBeGreaterThan(detail!.y + detail!.height - 1);
  });

  // The history is one load for the panel (ADR 0028): the legacy panel asks the shared cache for the power windows when it starts, the
  // pane asks the same cache when it is shown, so opening the tab, and opening it again, read nothing more.
  test('the power windows are read once: opening the tab asks for none, nor does opening it again within the fifteen minutes', async ({
    house,
  }) => {
    await expect.poll(() => powerReads(house)).toBe(3);
    await house.tab('energy');
    await expect(water(house).locator('.whleg')).toBeVisible();
    expect(await powerReads(house), 'opening Energy').toBe(3);
    await house.tab('home');
    await house.tab('energy');
    await expect(water(house).locator('.whleg')).toBeVisible();
    expect(await powerReads(house), 'opening Energy again').toBe(3);
  });

  test('a light change gives zero mutations in the pane', async ({house}) => {
    await house.tab('energy');
    await expect(water(house).locator('.whleg')).toBeVisible();
    await house.mutations.reset();
    await house.setState('light.living_room_1', {attributes: {brightness: 100}});
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-energy-pane, hp-water-card, hp-hilo-card'), 'mutations').toBe(0);
  });

  test('the tab has no serious or critical accessibility finding', async ({house}) => {
    await house.tab('energy');
    await expect(water(house).locator('.whleg')).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});
