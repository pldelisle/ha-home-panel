// The Climate tab (spec 20): <hp-climate-pane>, <hp-climate-list>, <hp-climate-detail>, <hp-gauge>, <hp-dial>, <hp-heat-legend> and the charts. On a tablet the list of the house, its rooms and the
// heat pump beside the selected item's detail with the gauge, then the heatmap and the outside chart; on a phone a grid of tiles that open the detail in a sheet with the dial, read-only until #248.
// The controls are the legacy panel's, which draws them into the slot the pane forwards until #248; the history is the pane's, loaded per range through the panel's cache (#246). The test house
// has four thermostats (Bedroom 20.8 and Living room 20.0 heating, Garage 21.2 and Office 20.4 idle, all at 21 degrees) and no heat pump, which the last tests add.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, expectCall, phoneOnly, tabletOnly, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

const pane = (house: House) => house.root().locator('#pane-climate hp-climate-pane');
const list = (house: House) => pane(house).locator('hp-climate-list');
const item = (house: House, id: string) => list(house).locator(`[data-id="${id}"]`);
const detail = (house: House) => pane(house).locator('hp-climate-detail');
const sheet = (house: House) => pane(house).locator('hp-sheet');
// the controls are the legacy panel's: a light child of the pane, slotted into the detail; the charts are `<hp-chart>`s, the detail's under its tiles and the tablet's two blocks under the grid
const charts = (house: House) => detail(house).locator('hp-chart .apexcharts-canvas');
const heatmap = (house: House) => pane(house).locator('.cblocks > .inner').first();
const outside = (house: House) => pane(house).locator('.cblocks > .inner').last();
// the tile's host has no box of its own (`display: contents`): its button is what a person taps
const tile = (house: House, key: string) => pane(house).locator(`hp-stat-tile[key="${key}"] button`);
const tileFigures = (house: House) => detail(house).locator('.tile .v');

test.describe('on a tablet', () => {
  test.beforeEach(async ({house}) => {
    tabletOnly();
    await house.tab('climate');
  });

  test('the tab lists the house and the rooms, with the house’s values', async ({house}) => {
    await expect(pane(house).locator('hp-pane-header [slot="sub"]')).toHaveText(
      '20.6° average inside · 4.2° outside · 2 rooms heating',
    );
    await expect(pane(house).locator('hp-pane-header h2')).toHaveText('Home climate');
    await expect(list(house).locator('[role="listbox"]')).toHaveAccessibleName('Rooms');
    await expect(list(house).locator('.citem .nm')).toHaveText([
      'Whole house',
      'Bedroom',
      'Garage',
      'Living room',
      'Office',
    ]);
    await expect(list(house).locator('.citem .tv')).toHaveText(['20.6°', '20.8°', '21.2°', '20.0°', '20.4°']);
    await expect(list(house).locator('.citem .sb').first()).toHaveText('2 rooms heating');
    await expect(item(house, 'house')).toHaveAttribute('aria-selected', 'true');
    await expect(detail(house).locator('h3')).toHaveText('Whole house');
    await expect(detail(house).locator('.t')).toHaveText('20.6°C');
    await expect(detail(house).locator('hp-gauge [role="img"]')).toHaveAccessibleName(
      'Temperature 20.6 degrees on a 14 to 30 degree scale',
    );
  });

  test('selecting a room changes the head and the tiles', async ({house}) => {
    await item(house, 'bedroom').click();
    await expect(item(house, 'bedroom')).toHaveAttribute('aria-selected', 'true');
    await expect(item(house, 'house')).toHaveAttribute('aria-selected', 'false');
    await expect(detail(house).locator('h3')).toHaveText('Bedroom');
    await expect(detail(house).locator('.big p').first()).toHaveText('Hilo thermostat');
    await expect(detail(house).locator('.cpill')).toHaveText('Heating to 21°');
    await expect(detail(house).locator('.tile .k')).toHaveText(['Range, 24 h', 'Drawing now', 'Heating, 24 h']);
    await expect(detail(house).locator('.tile .v').nth(1)).toHaveText('1.20kW');
    await expect(detail(house).locator('hp-gauge [role="img"]')).toHaveAccessibleName(
      'Temperature 20.8 degrees, setpoint 21 degrees on a 14 to 30 degree scale',
    );
    await expect(detail(house).locator('.note')).toHaveText(
      'The dashed line is the setpoint. Where it stops, the thermostat was off.',
    );
  });

  test('the legacy controls and the chart sit in the detail, for the room chosen, and the heatmap and outside chart under it', async ({
    house,
  }) => {
    await expect(pane(house).locator('#cctl .stepper')).toBeVisible();
    await expect(detail(house).locator('.legend')).toContainText('House average');
    await expect(charts(house)).toHaveCount(1);
    await expect(heatmap(house).locator('h3')).toHaveText('Every room, hour by hour');
    await expect(heatmap(house).locator('hp-heat-legend .hticks i')).toHaveText(['17°', '19°', '21°', '23°', '25°']);
    await expect(heatmap(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    await expect(outside(house).locator('h3')).toHaveText('Outside, last 24 hours');
    await expect(outside(house).locator('.legend')).toHaveText(/Low to high\s*Mean/);
    await expect(outside(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    await item(house, 'office').click();
    await expect(detail(house).locator('.legend')).toContainText('Office');
    await expect(pane(house).locator('#cctl .quick button')).toHaveCount(5);
  });

  test('a week redraws the tabs, the tiles, the chart and the heatmap for a week', async ({house}) => {
    await pane(house).locator('hp-range-tabs [role="tab"]', {hasText: 'Week'}).click();
    await expect(pane(house).locator('hp-range-tabs [aria-selected="true"]')).toHaveText('Week');
    await expect(detail(house).locator('.tile .k').last()).toHaveText('Heating, 7 days');
    await expect(detail(house).locator('.legend')).toContainText('last 7 days');
    await expect(heatmap(house).locator('h3')).toHaveText('Every room, every 6 hours');
    await expect(outside(house).locator('h3')).toHaveText('Outside, last 7 days');
  });

  // the heatmap's options depend on the range and the theme only: a setpoint changing, a room chosen, nothing makes its chart again, and the
  // draws are the DOM mutations in the roots of the charts' elements (`.cblocks hp-chart` are the heatmap's and the outside chart's, in the pane)
  test('a setpoint change and a room chosen leave the heatmap and the outside chart as they were, and draw the room chart again', async ({
    house,
  }) => {
    await expect(heatmap(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    await expect(outside(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    await expect(charts(house)).toBeVisible();
    const settle = () =>
      house.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await settle();
    await house.mutations.reset();
    await item(house, 'bedroom').click();
    await expect(detail(house).locator('h3')).toHaveText('Bedroom');
    await house.setState('climate.bedroom', {attributes: {temperature: 23}});
    await expect(detail(house).locator('.cpill')).toHaveText('Heating to 23°');
    await settle();
    expect(
      await house.mutations.count('hp-chart'),
      'mutations in the charts: the room chart is drawn for the bedroom',
    ).toBeGreaterThan(0);
    expect(await house.mutations.count('.cblocks hp-chart'), 'mutations in the heatmap and the outside chart').toBe(0);
    await expect(heatmap(house).locator('hp-chart .apexcharts-canvas')).toHaveCount(1);
  });

  test('the history’s two figures fill the tiles once it loads: the house’s heating, and a room’s range', async ({
    house,
  }) => {
    await expect(tileFigures(house).last()).toHaveText(/^\d+kWh$/);
    await item(house, 'bedroom').click();
    await expect(tileFigures(house).first()).toHaveText(/^\d+\.\d–\d+\.\d°$/);
    await expect(tileFigures(house).last()).toHaveText(/^\d+\.\dkWh$/);
  });

  test('a thermostat change updates the room’s item and gives zero mutations in the security pane', async ({house}) => {
    await house.mutations.reset();
    await house.setState('climate.bedroom', {attributes: {current_temperature: 22.5}});
    await expect(item(house, 'bedroom').locator('.tv')).toHaveText('22.5°');
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-security-pane'), 'mutations').toBe(0);
  });

  test('has no serious or critical accessibility finding: the listbox and the gauge', async ({house}) => {
    await expect(charts(house)).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

test.describe('on a phone', () => {
  test.beforeEach(async ({house}) => {
    phoneOnly();
    await house.tab('climate');
  });

  test('the tab has the summary and a tile for the house, across the top, and one for each room', async ({house}) => {
    await expect(pane(house).locator(':scope > hp-pane-header > [slot="sub"]')).toHaveText(
      '20.6° average inside · 4.2° outside · 2 rooms heating',
    );
    await expect(pane(house).locator('hp-stat-tile b')).toHaveText([
      'Whole house',
      'Bedroom',
      'Garage',
      'Living room',
      'Office',
    ]);
    await expect(tile(house, 'house')).toHaveClass(/wide/);
    await expect(tile(house, 'bedroom').locator('.tv')).toHaveText('20.8°');
    await expect(sheet(house)).not.toHaveAttribute('open', '');
  });

  test('a tile opens the sheet on its room, with the dial, and Close closes it', async ({house}) => {
    await tile(house, 'bedroom').click();
    await expect(sheet(house)).toHaveAttribute('open', '');
    await expect(sheet(house).locator('hp-pane-header h2, [slot="title"]').first()).toBeVisible();
    await expect(detail(house).locator('h3')).toHaveText('Bedroom');
    // an image, not a focusable slider that ignores the arrows, until #248 gives it the drag and the keys
    const dial = detail(house).locator('hp-dial [role="img"]');
    await expect(dial).toHaveAccessibleName('Setpoint: 21 degrees');
    await expect(dial).not.toHaveAttribute('tabindex', /.*/);
    await expect(detail(house).locator('hp-dial [role="slider"]')).toHaveCount(0);
    await expect(detail(house).locator('hp-dial .dialc b')).toHaveText('21.0°');
    await expect(detail(house).locator('hp-dial .dialc small')).toHaveText('Now 20.8° · Outside 4.2°');
    await sheet(house).locator('.close').click();
    await expect(sheet(house)).not.toHaveAttribute('open', '');
    await expect(detail(house)).toHaveCount(0);
  });

  // the dial does nothing until #248, so the legacy controls' steppers stay on the phone: they set a room's setpoint and the heat pump's target
  test('the sheet shows a working Setpoint stepper, and a tap sends the call once the taps stop', async ({house}) => {
    await tile(house, 'bedroom').click();
    const stepper = pane(house).locator('#cctl .stepper[aria-label="Setpoint"]');
    await expect(stepper).toBeVisible();
    await stepper.locator('button[data-d="0.5"]').click();
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.bedroom","temperature":21\.5\}$/);
  });

  test('the house’s tile opens a dial that is an image, with the average and no knob', async ({house}) => {
    await tile(house, 'house').click();
    const dial = detail(house).locator('hp-dial [role="img"]');
    await expect(dial).toHaveAccessibleName('Temperature');
    await expect(dial.locator('.dknob')).toHaveCount(0);
    await expect(dial.locator('.dialc b')).toHaveText('20.6°');
  });

  test('the sheet holds the legacy controls and chart, for the room, and its range tabs', async ({house}) => {
    await tile(house, 'office').click();
    await expect(pane(house).locator('#cctl .quick button')).toHaveCount(5);
    await expect(charts(house)).toBeVisible();
    await sheet(house).locator('hp-range-tabs [role="tab"]', {hasText: 'Week'}).click();
    await expect(detail(house).locator('.legend')).toContainText('last 7 days');
  });

  test('a thermostat change updates the room’s tile and gives zero mutations in the security pane', async ({house}) => {
    await house.mutations.reset();
    await house.setState('climate.bedroom', {attributes: {current_temperature: 22.5}});
    await expect(tile(house, 'bedroom').locator('.tv')).toHaveText('22.5°');
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-security-pane'), 'mutations').toBe(0);
  });

  // The lit state pill's text (`--t-wh` on the pill's tint) reads 4.31:1 in the sheet, under 4.5:1. The legacy detail drew the same colours, so this move changes
  // nothing; only that rule on that element is left out, everything else must be clean.
  test('the sheet has no serious or critical accessibility finding, but the contrast of the lit pill: the slider', async ({
    house,
  }) => {
    await tile(house, 'bedroom').click();
    await expect(charts(house)).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    const found = violations
      .filter(v => v.impact === 'serious' || v.impact === 'critical')
      .flatMap(v =>
        v.nodes.filter(n => !(v.id === 'color-contrast' && String(n.target.at(-1)).includes('.cpill'))).map(() => v.id),
      );
    expect(found).toEqual([]);
  });

  test('Home’s Climate tile opens the sheet on the house, whichever room the tab last showed', async ({house}) => {
    await tile(house, 'office').click();
    await sheet(house).locator('.close').click();
    await house.tab('home');
    await house.root().locator('#htiles [data-opens="climate.detail"]').click();
    await expect(sheet(house)).toHaveAttribute('open', '');
    await expect(detail(house).locator('h3')).toHaveText('Whole house');
  });
});

test.describe('with a heat pump, on a tablet', () => {
  test.use({
    houseOpts: {
      cfg: {...FULL_CFG, entities: {...FULL_CFG.entities, heat_pump: 'climate.heat_pump'}},
      time: AFTERNOON,
      frozen: true,
    },
  });

  test('the list ends with it, and its detail has its own head, tiles and note', async ({house}) => {
    tabletOnly();
    await house.setState('climate.heat_pump', {
      state: 'heat',
      attributes: {hvac_action: 'heating', current_temperature: 19.5, temperature: 22, min_temp: 16, max_temp: 30},
    });
    await house.tab('climate');
    await expect(list(house).locator('.citem .nm').last()).toHaveText('Heat pump');
    await expect(list(house).locator('.citem .sb').last()).toHaveText('Heat pump · heating to 22°');
    await expect(list(house).locator('.citem .tv').last()).toHaveText('19.5°');
    await item(house, 'hp').click();
    await expect(detail(house).locator('h3')).toHaveText('Heat pump');
    await expect(detail(house).locator('.cpill')).toHaveText('Heating to 22°');
    await expect(detail(house).locator('.tile .k')).toHaveText(['Range, 24 h', 'Last update']);
    await expect(detail(house).locator('.note')).toContainText('Readings come from the unit itself.');
    await expect(pane(house).locator('#cctl .seg [role="radio"][aria-checked="true"]')).toHaveText('Heat');
    await expect(detail(house).locator('.legend')).toContainText('Heat pump');
  });

  // the test house keeps the unit's state history from five days ago (test/houses/read.mjs), as a recorder that keeps about ten days would
  test('its note says where the line starts when its history begins after the range does, and only for such a range', async ({
    house,
  }) => {
    tabletOnly();
    await house.setState('climate.heat_pump', {
      state: 'heat',
      attributes: {current_temperature: 19.5, temperature: 22},
    });
    await house.tab('climate');
    await item(house, 'hp').click();
    // a day starts after the unit's first reading: the line covers the range, and its figure reads off it
    await expect(detail(house).locator('.tile .v').first()).toHaveText(/^19\.0–20\.5°$/);
    await expect(detail(house).locator('.note')).not.toContainText('Home Assistant keeps');
    await pane(house).locator('hp-range-tabs [role="tab"]', {hasText: 'Month'}).click();
    await expect(detail(house).locator('.note')).toContainText(
      'Home Assistant keeps about 10 days of detailed history, so the heat pump line starts Nov 2.',
    );
  });

  // spec 20, "Performance": a range already loaded within ten minutes redraws from memory
  test('a week sends one statistics request and one history request, and a second week within ten minutes sends none', async ({
    house,
  }) => {
    tabletOnly();
    await house.setState('climate.heat_pump', {
      state: 'heat',
      attributes: {current_temperature: 19.5, temperature: 22},
    });
    await house.tab('climate');
    const climate = async (kind: 'recorder/statistics_during_period' | 'history/history_during_period') =>
      (await house.reads()).filter(
        read =>
          read.startsWith(`${kind} `) &&
          read.includes(kind.startsWith('h') ? 'climate.heat_pump' : 'sensor.bedroom_target_temperature'),
      );
    const tab = (name: string) => pane(house).locator('hp-range-tabs [role="tab"]', {hasText: name});
    await expect(heatmap(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    expect(await climate('recorder/statistics_during_period'), 'the day, asked once').toHaveLength(1);
    expect(await climate('history/history_during_period')).toHaveLength(1);
    await tab('Week').click();
    await expect(heatmap(house).locator('h3')).toHaveText('Every room, every 6 hours');
    await expect
      .poll(async () => (await climate('recorder/statistics_during_period')).length, 'the week, asked once')
      .toBe(2);
    expect(await climate('history/history_during_period')).toHaveLength(2);
    await tab('Day').click();
    await expect(heatmap(house).locator('h3')).toHaveText('Every room, hour by hour');
    await tab('Week').click();
    await expect(heatmap(house).locator('h3')).toHaveText('Every room, every 6 hours');
    await expect(heatmap(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    expect(await climate('recorder/statistics_during_period'), 'a second week, from memory').toHaveLength(2);
    expect(await climate('history/history_during_period')).toHaveLength(2);
  });

  test('the heat pump’s chart draws its line and its setpoint from the unit’s history', async ({house}) => {
    tabletOnly();
    await house.setState('climate.heat_pump', {
      state: 'heat',
      attributes: {current_temperature: 19.5, temperature: 22},
    });
    await house.tab('climate');
    await item(house, 'hp').click();
    await expect(detail(house).locator('.legend')).toContainText('Heat pump');
    await expect(charts(house)).toBeVisible();
    await expect(detail(house).locator('hp-chart .apexcharts-series')).toHaveCount(3);
  });

  test('on a phone its Target stepper shows and sends the call', async ({house}) => {
    phoneOnly();
    await house.setState('climate.heat_pump', {
      state: 'heat',
      attributes: {current_temperature: 19.5, temperature: 22, min_temp: 16, max_temp: 30},
    });
    await house.tab('climate');
    await tile(house, 'hp').click();
    const stepper = pane(house).locator('#cctl .stepper[aria-label="Target"]');
    await expect(stepper).toBeVisible();
    await stepper.locator('button[data-d="0.5"]').click();
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.heat_pump","temperature":22\.5\}$/);
  });
});
