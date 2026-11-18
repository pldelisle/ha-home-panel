// The Climate tab (spec 20): <hp-climate-pane>, <hp-climate-list>, <hp-climate-detail>, <hp-climate-controls>, <hp-gauge>, <hp-dial>, <hp-heat-legend> and the charts. On a tablet the list of the house, its rooms and the
// heat pump beside the selected item's detail with the gauge and the controls, then the heatmap; on a phone a grid of tiles that open the detail in a sheet with the dial, which is the slider
// that sets a room's setpoint and the heat pump's target. The history is the pane's, loaded per range through the panel's cache (#246). The test house
// has four thermostats (Bedroom 20.8 and Living room 20.0 heating, Garage 21.2 and Office 20.4 idle, all at 21 degrees) and no heat pump, which the last tests add.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, expectCall, phoneOnly, tabletOnly, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';
import {callData, callsMessage} from './lights';

test.use({houseOpts: {cfg: FULL_CFG}});

const pane = (house: House) => house.root().locator('#pane-climate hp-climate-pane');
const list = (house: House) => pane(house).locator('hp-climate-list');
const item = (house: House, id: string) => list(house).locator(`[data-id="${id}"]`);
const detail = (house: House) => pane(house).locator('hp-climate-detail');
const sheet = (house: House) => pane(house).locator('hp-sheet');
// the controls are the detail's own element; the charts are `<hp-chart>`s, the detail's under its tiles and the tablet's two blocks under the grid
const controls = (house: House) => detail(house).locator('hp-climate-controls');
// every `climate.set_temperature` the panel has sent so far, as the data it carried
const setpoints = (house: House) =>
  house.calls.filter(c => c.startsWith('climate.set_temperature ')).map(c => callData(c));
// exactly one setpoint call, counted after the debounce (1,100 ms) has had time to send a second one: the first to arrive is no proof of the only one
const expectOneSetpoint = async (house: House, what: string) => {
  await house.page.waitForTimeout(1300);
  await expect.poll(() => setpoints(house).length, {message: callsMessage(house, what)}).toBe(1);
};
const charts = (house: House) => detail(house).locator('hp-chart .apexcharts-canvas');
const heatmap = (house: House) => pane(house).locator('.cblocks > .inner').first();
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
    await expect(detail(house).locator('.t')).toHaveText('20.6°');
    await expect(detail(house).locator('hp-gauge [role="img"]')).toHaveAccessibleName(
      'Temperature 20.6 degrees on a 14 to 30 degree scale',
    );
  });

  test('the selected room is a neutral filled row, with no outline and no blue ring', async ({house}) => {
    const selected = item(house, 'house');
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    const look = await selected.evaluate(el => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--nav-sel-bg)';
      el.parentElement!.append(probe);
      const fill = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const style = getComputedStyle(el);
      return {fill, background: style.backgroundColor, outline: style.outlineStyle, shadow: style.boxShadow};
    });
    expect(look.background).toBe(look.fill);
    expect(look.outline).toBe('none');
    expect(look.shadow).not.toContain('inset');
  });

  test('selecting a room changes the head and the tiles', async ({house}) => {
    await item(house, 'bedroom').click();
    await expect(item(house, 'bedroom')).toHaveAttribute('aria-selected', 'true');
    await expect(item(house, 'house')).toHaveAttribute('aria-selected', 'false');
    await expect(detail(house).locator('h3')).toHaveText('Bedroom');
    await expect(detail(house).locator('.big p').first()).toHaveText('Hilo thermostat');
    await expect(detail(house).locator('.big .status')).toHaveText('Heating to 21°');
    await expect(detail(house).locator('.tile .k')).toHaveText(['Range, 24 h', 'Drawing now', 'Heating, 24 h']);
    await expect(detail(house).locator('.tile .v').nth(1)).toHaveText('1.2kW');
    await expect(detail(house).locator('hp-gauge [role="img"]')).toHaveAccessibleName(
      'Temperature 20.8 degrees, setpoint 21 degrees on a 14 to 30 degree scale',
    );
    await expect(detail(house).locator('.note')).toHaveText(
      'The dashed line is the setpoint. Where it stops, the thermostat was off.',
    );
  });

  test('the house’s Warmest and Coolest are buttons that select that room; the other tiles are plain', async ({
    house,
  }) => {
    const buttons = detail(house).locator('button.tile');
    await expect(buttons).toHaveCount(2);
    await expect(buttons.first()).toHaveAccessibleName(/^Warmest.*21\.2.*Garage/);
    await expect(buttons.first()).toHaveAccessibleDescription('Shows its chart');
    await buttons.nth(1).click();
    await expect(detail(house).locator('h3')).toHaveText('Living room');
    await expect(item(house, 'living_room')).toHaveAttribute('aria-selected', 'true');
    await expect(charts(house)).toBeVisible();
    // a room's own tiles lead nowhere
    await expect(detail(house).locator('button.tile')).toHaveCount(0);
  });

  test('the controls and the chart sit in the detail, for the room chosen, and the heatmap alone under it (the outside is the chart’s line)', async ({
    house,
  }) => {
    await expect(controls(house).locator('hp-stepper')).toBeVisible();
    await expect(detail(house).locator('.legend')).toContainText('House average');
    await expect(charts(house)).toHaveCount(1);
    await expect(heatmap(house).locator('h3')).toHaveText('Every room, hour by hour');
    await expect(heatmap(house).locator('hp-heat-legend .hticks i')).toHaveText(['17°', '19°', '21°', '23°', '25°']);
    await expect(heatmap(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    await expect(pane(house).locator('.cblocks > .inner')).toHaveCount(1);
    await expect(detail(house).locator('.legend')).toContainText('Outside');
    await item(house, 'office').click();
    await expect(detail(house).locator('.legend')).toContainText('Office');
    await expect(controls(house).locator('.quick button')).toHaveCount(5);
  });

  test('a week redraws the tabs, the tiles, the chart and the heatmap for a week', async ({house}) => {
    await pane(house).locator('hp-range-tabs [role="tab"]', {hasText: 'Week'}).click();
    await expect(pane(house).locator('hp-range-tabs [aria-selected="true"]')).toHaveText('Week');
    await expect(detail(house).locator('.tile .k').last()).toHaveText('Heating, 7 days');
    await expect(detail(house).locator('.legend')).toContainText('last 7 days');
    await expect(heatmap(house).locator('h3')).toHaveText('Every room, every 6 hours');
  });

  // the heatmap's options depend on the range and the theme only: a setpoint changing, a room chosen, nothing makes its chart again, and the
  // draws are the DOM mutations in the roots of the charts' elements (`.cblocks hp-chart` is the heatmap's, in the pane)
  test('a setpoint change and a room chosen leave the heatmap as it was, and draw the room chart again', async ({
    house,
  }) => {
    await expect(heatmap(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    await expect(charts(house)).toBeVisible();
    const settle = () =>
      house.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await settle();
    await house.mutations.reset();
    await item(house, 'bedroom').click();
    await expect(detail(house).locator('h3')).toHaveText('Bedroom');
    await house.setState('climate.bedroom', {attributes: {temperature: 23}});
    await expect(detail(house).locator('.big .status')).toHaveText('Heating to 23°');
    await settle();
    expect(
      await house.mutations.count('hp-chart'),
      'mutations in the charts: the room chart is drawn for the bedroom',
    ).toBeGreaterThan(0);
    expect(await house.mutations.count('.cblocks hp-chart'), 'mutations in the heatmap').toBe(0);
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

  test('has no serious or critical accessibility finding: the listbox, the gauge and the controls', async ({house}) => {
    await expect(charts(house)).toBeVisible();
    await expect(controls(house).locator('hp-stepper')).toBeVisible();
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
    // a slider: focusable, named for what it sets, with its ends, its value and the words that say it
    const dial = detail(house).locator('hp-dial [role="slider"]');
    await expect(dial).toHaveAccessibleName('Setpoint');
    await expect(dial).toHaveAttribute('tabindex', '0');
    await expect(dial).toHaveAttribute('aria-valuemin', '5');
    await expect(dial).toHaveAttribute('aria-valuemax', '30');
    await expect(dial).toHaveAttribute('aria-valuenow', '21');
    await expect(dial).toHaveAttribute('aria-valuetext', '21 degrees');
    await expect(detail(house).locator('hp-dial [role="img"]')).toHaveCount(0);
    await expect(detail(house).locator('hp-dial .dialc b')).toHaveText('21.0°');
    await expect(detail(house).locator('hp-dial .dialc small')).toHaveText('Now 20.8° · Outside 4.2°');
    await sheet(house).locator('.close').click();
    await expect(sheet(house)).not.toHaveAttribute('open', '');
    await expect(detail(house)).toHaveCount(0);
  });

  // the dial sets a room's setpoint on the phone, so the Setpoint stepper is not drawn there: the quick buttons and the dial are the room's controls
  test('the sheet has the quick buttons and no Setpoint stepper: the dial is the setpoint', async ({house}) => {
    await tile(house, 'bedroom').click();
    await expect(controls(house).locator('.quick button')).toHaveText(['Off', '19°', '20°', '21°', '22°']);
    await expect(controls(house).locator('hp-stepper')).toHaveCount(0);
  });

  test('ArrowUp on the dial raises the setpoint by half a degree, at once, and one call follows once the keys stop', async ({
    house,
  }) => {
    await tile(house, 'bedroom').click();
    const dial = detail(house).locator('hp-dial [role="slider"]');
    await dial.focus();
    await house.page.keyboard.press('ArrowUp');
    await expect(dial).toHaveAttribute('aria-valuenow', '21.5');
    await expect(detail(house).locator('hp-dial .dialc b')).toHaveText('21.5°');
    await house.page.keyboard.press('ArrowUp');
    await expect(dial).toHaveAttribute('aria-valuenow', '22');
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.bedroom","temperature":22\}$/);
    await expectOneSetpoint(house, 'two keys in a burst are one call');
    await expect(dial, 'the focus stays on the dial').toBeFocused();
  });

  test('Home and End take the dial to the ends of its scale', async ({house}) => {
    await tile(house, 'bedroom').click();
    const dial = detail(house).locator('hp-dial [role="slider"]');
    await dial.focus();
    await house.page.keyboard.press('End');
    await expect(dial).toHaveAttribute('aria-valuenow', '30');
    await house.page.keyboard.press('Home');
    await expect(dial).toHaveAttribute('aria-valuenow', '5');
    await expect(dial).toHaveAttribute('aria-valuetext', 'Off');
    await expect(detail(house).locator('hp-dial .dialc b')).toHaveText('Off');
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.bedroom","temperature":5\}$/);
    await expectOneSetpoint(house, 'the two keys are one call, at the last value');
    // up from off is 15, as the stepper's
    await house.page.keyboard.press('ArrowUp');
    await expect(dial).toHaveAttribute('aria-valuenow', '15');
  });

  // the finger's value is held in the overlay, so a thermostat reporting meanwhile does not move the knob under it
  test('dragging the dial shows the value under the finger at once, holds it against a state change, and sends one call after the finger rests', async ({
    house,
  }) => {
    await tile(house, 'bedroom').click();
    const dial = detail(house).locator('hp-dial [role="slider"]');
    const box = (await detail(house).locator('hp-dial svg').boundingBox())!;
    // the pointer at a setpoint of the 5 to 30 scale: 270 degrees round from 135, at some way out from the centre
    const at = (value: number) => {
      const angle = ((135 + ((value - 5) / 25) * 270) * Math.PI) / 180;
      return {
        x: box.x + box.width / 2 + Math.cos(angle) * box.width * 0.38,
        y: box.y + box.height / 2 + Math.sin(angle) * box.width * 0.38,
      };
    };
    await house.page.mouse.move(at(21).x, at(21).y);
    await house.page.mouse.down();
    for (const value of [22, 23, 24, 25]) await house.page.mouse.move(at(value).x, at(value).y, {steps: 3});
    await expect(detail(house).locator('hp-dial .dialc b')).toHaveText('25.0°');
    await house.setState('climate.bedroom', {attributes: {temperature: 18}});
    await expect(detail(house).locator('.big .status'), 'the thermostat reported another setpoint').toHaveText(
      'Heating to 18°',
    );
    await expect(dial, 'the held value wins under the finger').toHaveAttribute('aria-valuenow', '25');
    await expect(detail(house).locator('hp-dial .dialc b')).toHaveText('25.0°');
    await house.page.mouse.up();
    expect(
      setpoints(house),
      callsMessage(house, 'nothing is sent while the finger is down or has only just lifted'),
    ).toEqual([]);
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.bedroom","temperature":25\}$/);
    await expectOneSetpoint(house, 'a drag is one call');
  });

  // a dial taken out of the page and put back, with the finger down, is not still being dragged: a move reaching it says nothing
  test('a dial put back after a drag was under way is not dragged by the next move', async ({house}) => {
    await tile(house, 'bedroom').click();
    const box = (await detail(house).locator('hp-dial svg').boundingBox())!;
    await house.page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.1);
    await house.page.mouse.down();
    const inputs = await detail(house)
      .locator('hp-dial')
      .evaluate(
        (dial, at) => {
          let count = 0;
          dial.addEventListener('dial-input', () => count++);
          const {parentNode: parent, nextSibling: next} = dial;
          dial.remove();
          parent!.insertBefore(dial, next);
          dial
            .shadowRoot!.querySelector('.dial')!
            .dispatchEvent(new PointerEvent('pointermove', {bubbles: true, clientX: at.x, clientY: at.y}));
          return count;
        },
        {x: box.x + box.width * 0.2, y: box.y + box.height * 0.8},
      );
    await house.page.mouse.up();
    expect(inputs, 'no drag survives the dial leaving the page').toBe(0);
  });

  test('the house’s tile opens a dial that is an image, with the average and no knob', async ({house}) => {
    await tile(house, 'house').click();
    const dial = detail(house).locator('hp-dial [role="img"]');
    await expect(dial).toHaveAccessibleName('Temperature');
    await expect(dial.locator('.dknob')).toHaveCount(0);
    await expect(dial.locator('.dialc b')).toHaveText('20.6°');
  });

  test('the house’s Coolest tile, in the sheet, shows that room', async ({house}) => {
    await tile(house, 'house').click();
    await detail(house)
      .getByRole('button', {name: /^Coolest.*20\.0.*Living room/})
      .click();
    await expect(detail(house).locator('h3')).toHaveText('Living room');
  });

  test('the sheet holds the controls and chart, for the room, and its range tabs', async ({house}) => {
    await tile(house, 'office').click();
    await expect(controls(house).locator('.quick button')).toHaveCount(5);
    await expect(charts(house)).toBeVisible();
    // the heatmap is the tablet's: the sheet holds the room's chart alone
    await expect(charts(house)).toHaveCount(1);
    await expect(pane(house).locator('.cblocks')).toHaveCount(0);
    await expect(pane(house).locator('hp-heat-legend')).toHaveCount(0);
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

  // the state is plain text with a dot since #393, so no rule of the audit is left out
  test('the sheet has no serious or critical accessibility finding', async ({house}) => {
    await tile(house, 'bedroom').click();
    await expect(charts(house)).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    const found = violations
      .filter(v => v.impact === 'serious' || v.impact === 'critical')
      .flatMap(v => v.nodes.map(() => v.id));
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
    await expect(detail(house).locator('.big .status')).toHaveText('Heating to 22°');
    await expect(detail(house).locator('.tile .k')).toHaveText(['Range, 24 h', 'Last update']);
    await expect(detail(house).locator('.note')).toContainText('Readings come from the unit itself.');
    await expect(controls(house).locator('hp-seg [role="radio"][aria-checked="true"]')).toHaveText('Heat');
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
    // a request that came late would show after a settle: the reads are polled, once the frames have passed
    await house.page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await house.page.waitForTimeout(250);
    await expect
      .poll(async () => (await climate('recorder/statistics_during_period')).length, 'a second week, from memory')
      .toBe(2);
    await expect.poll(async () => (await climate('history/history_during_period')).length).toBe(2);
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

  test('on a phone the dial sets its target: ArrowUp raises it by half a degree and sends the call', async ({
    house,
  }) => {
    phoneOnly();
    await house.setState('climate.heat_pump', {
      state: 'heat',
      attributes: {current_temperature: 19.5, temperature: 22, min_temp: 16, max_temp: 30},
    });
    await house.tab('climate');
    await tile(house, 'hp').click();
    await expect(controls(house).locator('hp-stepper'), 'the dial is the target on a phone').toHaveCount(0);
    const dial = detail(house).locator('hp-dial [role="slider"]');
    await expect(dial).toHaveAttribute('aria-valuemin', '16');
    await dial.focus();
    await house.page.keyboard.press('ArrowUp');
    await expect(dial).toHaveAttribute('aria-valuenow', '22.5');
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.heat_pump","temperature":22\.5\}$/);
  });
});

// the heat pump's controls: its mode, target, fan, preset and louvers, each a command of its own; the unit here offers what these test
test.describe('the heat pump’s controls, on a tablet', () => {
  test.use({
    houseOpts: {cfg: {...FULL_CFG, entities: {...FULL_CFG.entities, heat_pump: 'climate.heat_pump'}}},
  });

  const UNIT = {
    state: 'heat',
    attributes: {
      hvac_action: 'heating',
      current_temperature: 19.5,
      temperature: 22,
      min_temp: 16,
      max_temp: 30,
      hvac_modes: ['off', 'heat', 'cool', 'dry', 'heat_cool', 'fan_only'],
      fan_modes: ['quiet', 'low', 'auto'],
      preset_modes: ['none', 'boost'],
      swing_modes: ['off', 'vertical', 'vertical_3'],
      fan_mode: 'auto',
      preset_mode: 'none',
      swing_mode: 'off',
    },
  };

  test.beforeEach(async ({house}) => {
    tabletOnly();
    await house.setState('climate.heat_pump', UNIT);
    await house.tab('climate');
    await item(house, 'hp').click();
  });

  test('its mode group sends the mode, shows it at once and says it in lower case', async ({house}) => {
    const group = controls(house).locator('hp-seg').first();
    const radios = group.getByRole('radio');
    await expect(radios).toHaveText(['Off', 'Heat', 'Cool', 'Dry', 'Auto', 'Fan']);
    await expect(group.getByRole('radiogroup')).toHaveAccessibleName('Heat pump mode');
    await radios.nth(2).click();
    await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
    await expectCall(house, /^climate\.set_hvac_mode \{"entity_id":"climate\.heat_pump","hvac_mode":"cool"\}$/);
    await expect(house.root().locator('#toast')).toHaveText('Heat pump: cool');
  });

  test('its target stepper sends one call for a burst of taps, and the fan, the preset and the louvers send theirs', async ({
    house,
  }) => {
    const target = controls(house).locator('hp-stepper[aria-label="Target"]');
    await expect(target.locator('.sv b')).toHaveText('22.0°');
    for (let tap = 0; tap < 3; tap++) await target.getByRole('button', {name: 'Raise target'}).click();
    await expect(target.locator('.sv b')).toHaveText('23.5°');
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.heat_pump","temperature":23\.5\}$/);
    await expectOneSetpoint(house, 'three taps are one call');
    await controls(house).locator('hp-seg').nth(1).getByRole('radio', {name: 'Quiet'}).click();
    await expectCall(house, /^climate\.set_fan_mode \{"entity_id":"climate\.heat_pump","fan_mode":"quiet"\}$/);
    await controls(house).locator('hp-seg').nth(2).getByRole('radio', {name: 'Boost'}).click();
    await expectCall(house, /^climate\.set_preset_mode \{"entity_id":"climate\.heat_pump","preset_mode":"boost"\}$/);
    await controls(house).getByLabel('Louver position').selectOption({label: 'Swing up and down'});
    await expectCall(house, /^climate\.set_swing_mode \{"entity_id":"climate\.heat_pump","swing_mode":"vertical"\}$/);
    await expect(house.root().locator('#toast')).toHaveText('Louvers: swing up and down');
  });

  test('a mode with no target has no stepper, and off has no fan, preset or louvers', async ({house}) => {
    const radios = controls(house).locator('hp-seg').first().getByRole('radio');
    await radios.nth(3).click();
    await expect(controls(house).locator('hp-stepper'), 'dry has no target').toHaveCount(0);
    await expect(controls(house).locator('hp-seg')).toHaveCount(3);
    await radios.nth(0).click();
    await expect(controls(house).locator('hp-seg'), 'off leaves the modes alone').toHaveCount(1);
    await expect(controls(house).locator('select')).toHaveCount(0);
  });

  test('offline it says so and has no control', async ({house}) => {
    await house.setState('climate.heat_pump', {state: 'unavailable'});
    await expect(controls(house)).toContainText("The heat pump is offline, so it can't be adjusted right now.");
    await expect(controls(house).locator('hp-seg, hp-stepper, select')).toHaveCount(0);
  });
});

// a room's controls and the house's: the quick buttons, the setpoint stepper with the frost guard's rules, and the two buttons that ask in a dialog
test.describe('a room’s and the house’s controls, on a tablet', () => {
  test.beforeEach(async ({house}) => {
    tabletOnly();
    await house.tab('climate');
  });

  test('five taps on + are one climate.set_temperature, at the last value, and the value shows at once', async ({
    house,
  }) => {
    await item(house, 'bedroom').click();
    const stepper = controls(house).locator('hp-stepper[aria-label="Setpoint"]');
    await expect(stepper.locator('.sv b')).toHaveText('21.0°');
    for (let tap = 0; tap < 5; tap++) await stepper.getByRole('button', {name: 'Raise setpoint'}).click();
    await expect(stepper.locator('.sv b'), 'shown before it is sent').toHaveText('23.5°');
    await expect(controls(house).locator('.quick button[aria-pressed="true"]')).toHaveCount(0);
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.bedroom","temperature":23\.5\}$/);
    await expectOneSetpoint(house, 'five taps are one call');
    await expect(house.root().locator('#toast')).toHaveText('Bedroom set to 23.5°');
  });

  test('a quick button sends its setpoint, Off is the frost guard, and a step up from off is 15', async ({house}) => {
    await item(house, 'bedroom').click();
    const quick = controls(house).locator('.quick button');
    await expect(quick.filter({hasText: '21°'})).toHaveAttribute('aria-pressed', 'true');
    await quick.filter({hasText: 'Off'}).click();
    await expect(quick.filter({hasText: 'Off'})).toHaveAttribute('aria-pressed', 'true');
    const stepper = controls(house).locator('hp-stepper[aria-label="Setpoint"]');
    await expect(stepper.locator('.sv b')).toHaveText('Off');
    await expect(stepper.getByRole('button', {name: 'Lower setpoint'})).toBeDisabled();
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.bedroom","temperature":5\}$/);
    await expect(house.root().locator('#toast')).toHaveText('Bedroom off');
    await stepper.getByRole('button', {name: 'Raise setpoint'}).click();
    await expect(stepper.locator('.sv b')).toHaveText('15.0°');
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.bedroom","temperature":15\}$/);
    await quick.filter({hasText: '22°'}).click();
    await expectCall(house, /^climate\.set_temperature \{"entity_id":"climate\.bedroom","temperature":22\}$/);
  });

  test('a thermostat that is unavailable says so and has no control', async ({house}) => {
    await house.setState('climate.garage', {state: 'unavailable'});
    await item(house, 'garage').click();
    await expect(controls(house)).toContainText('This thermostat is unavailable');
    await expect(controls(house).locator('hp-stepper, .quick')).toHaveCount(0);
  });

  test('“All off” asks in a dialog and sends nothing; its Turn off sends one call with every room’s id', async ({
    house,
  }) => {
    const dialog = controls(house).locator('hp-dialog[data-ask="alloff"] dialog');
    await expect(dialog).toBeHidden();
    await controls(house).getByRole('button', {name: 'All off'}).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h4')).toHaveText('Turn every room off?');
    await expect(dialog.locator('p')).toHaveText('Each room drops to the 5° frost guard.');
    await house.page.waitForTimeout(300);
    expect(setpoints(house), callsMessage(house, 'the question alone changes nothing')).toEqual([]);
    await dialog.getByRole('button', {name: 'Turn off'}).click();
    await expect(dialog).toBeHidden();
    await expectCall(house, /^climate\.set_temperature /);
    await expectOneSetpoint(house, 'the confirmation is one call');
    const [data] = setpoints(house);
    expect(data.temperature).toBe(5);
    expect([...(data.entity_id as string[])].sort()).toEqual([
      'climate.bedroom',
      'climate.garage',
      'climate.living_room',
      'climate.office',
    ]);
    await expect(house.root().locator('#toast')).toHaveText('All rooms off (5° frost guard)');
  });

  test('“Set all” names its value in the dialog, a stepper changes it, and Set all sends it to every room', async ({
    house,
  }) => {
    const stepper = controls(house).locator('hp-stepper[aria-label="Set every room to"]');
    const dialog = controls(house).locator('hp-dialog[data-ask="allset"] dialog');
    await expect(stepper.locator('.sv b')).toHaveText('21.0°');
    await controls(house).getByRole('button', {name: 'Set all to 21.0°'}).click();
    await expect(dialog.locator('h4')).toHaveText('Set every room to 21.0°?');
    await dialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(dialog).toBeHidden();
    await stepper.getByRole('button', {name: 'Raise set every room to'}).click();
    await expect(stepper.locator('.sv b')).toHaveText('21.5°');
    await controls(house).getByRole('button', {name: 'Set all to 21.5°'}).click();
    await expect(dialog.locator('h4')).toHaveText('Set every room to 21.5°?');
    await dialog.getByRole('button', {name: 'Set all', exact: true}).click();
    await expectCall(house, /^climate\.set_temperature /);
    await expectOneSetpoint(house, 'the confirmation of Set all is one call');
    expect(setpoints(house)[0]?.temperature).toBe(21.5);
    await expect(house.root().locator('#toast')).toHaveText('All rooms set to 21.5°');
  });

  test('Cancel, Escape and the backdrop send nothing, and a tap inside the dialog does not close it', async ({
    house,
  }) => {
    const dialog = controls(house).locator('hp-dialog[data-ask="alloff"] dialog');
    const open = () => controls(house).getByRole('button', {name: 'All off'}).click();
    await open();
    await dialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(dialog).toBeHidden();
    await open();
    await house.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await open();
    await dialog.locator('p').click();
    await expect(dialog).toBeVisible();
    await house.page.mouse.click(5, 5);
    await expect(dialog).toBeHidden();
    await house.page.waitForTimeout(1300);
    expect(setpoints(house), callsMessage(house, 'a question that was not confirmed')).toEqual([]);
  });

  test('the tab no longer asks for a second tap, and the frost guard’s note stays', async ({house}) => {
    await expect(controls(house)).not.toContainText('second tap');
    await expect(controls(house)).not.toContainText('Tap again');
    await expect(controls(house)).toContainText('Off means the 5° frost guard');
  });

  test('the dialog open has no serious or critical accessibility finding', async ({house}) => {
    await controls(house).getByRole('button', {name: 'All off'}).click();
    await expect(controls(house).locator('hp-dialog[data-ask="alloff"] dialog')).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});
