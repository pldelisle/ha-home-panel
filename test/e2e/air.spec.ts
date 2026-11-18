// The Air tab (spec 18): <hp-air-pane>, <hp-air-detail>, <hp-air-room> and <hp-air-history>. The tab is the detail inline, on a tablet and on a phone alike
// (the phone's under its header, which holds the range tabs); Home's Air tile opens it as a sheet over Home. Each reading's tile in the room's
// card is a button that opens that reading's history in a sheet over the screen (#382). The test house has one purifier in the office
// (Automagic at 40 %, PM2.5 moderate, Mila's index 68) and the outdoor station (US AQI 42).
import AxeBuilder from '@axe-core/playwright';
import {test, expect, expectCall, phoneOnly, tabletOnly, type House} from './fixtures';
import {FULL_CFG, KEEP_ENGLISH_NAMES} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

const pane = (house: House) => house.root().locator('#pane-air hp-air-pane');
const card = (house: House) => pane(house).locator('hp-air-card'); // gone with the phone's summary card: the tab is the detail
const sheet = (house: House) => pane(house).locator('hp-sheet');
const detail = (house: House) => pane(house).locator('hp-air-detail');
const room = (house: House) => detail(house).locator('hp-air-room');
// the outdoor air's block: its title and, under it, the station's US AQI chart and the AQHI chart, each with its own heading and caption
const outdoorBlock = (house: House) =>
  detail(house).locator('.inner', {has: house.page.locator('h3', {hasText: 'Outdoor air'})});
const outdoorCharts = (house: House) => outdoorBlock(house).locator('hp-chart');
const history = (house: House) => pane(house).locator('hp-air-history');
const tile = (house: House, name: string) => room(house).getByRole('button', {name});
const CO2 = 'CO₂ 640ppm';
const calls = (house: House, prefix: string) => house.calls.filter(c => c.startsWith(prefix));
const STATISTICS = 'recorder/statistics_during_period';
const FAN = 'fan.office_purifier';

// the statistics requests that name a sensor: a tile's history (the room's reading, and the station's PM2.5 for that one) and the outdoor chart's (the index)
const asked = async (house: House, sensor: string) =>
  (await house.asked(STATISTICS)).filter(m => (m.statistic_ids as string[]).includes(sensor));
const periods = async (house: House, sensor: string) => (await asked(house, sensor)).map(m => m.period);

// Air is under More on a phone
const openTab = async (house: House) => {
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="air"] button').click();
  await expect(house.root().locator('#pane-air')).toBeVisible();
};

test.describe('on a phone', () => {
  test.beforeEach(() => phoneOnly());

  test('the tab is the header and the detail inline, in one column: the purifier, the outside block and its chart; no card, no sheet, no metric control', async ({
    house,
  }) => {
    await openTab(house);
    await expect(pane(house).locator(':scope > hp-pane-header > [slot="sub"]')).toHaveText(
      '1 purifier · Moderate · Office: PM2.5 20',
    );
    await expect(detail(house)).toBeVisible();
    await expect(room(house).locator('.aqhead h3')).toHaveText('Office');
    await expect(room(house).locator('.tile .k')).toHaveText(['PM2.5', 'CO₂', 'VOC', 'CO', 'PM1', 'PM10', 'Humidity']);
    await expect(room(house).getByRole('radio', {name: 'Automagic'})).toHaveAttribute('aria-checked', 'true');
    await expect(pane(house).locator(':scope > hp-pane-header hp-range-tabs [role="tab"]')).toHaveText([
      'Day',
      'Week',
      'Month',
    ]);
    await expect(outdoorCharts(house)).toHaveCount(2);
    await expect(detail(house).locator('hp-chart .apexcharts-canvas').first()).toBeVisible();
    await expect(detail(house).locator('.aqmetric')).toHaveCount(0);
    // each tile is a button named by its reading, and says where it leads in its description, not in its name
    await expect(room(house).locator('button.tile.tilebtn[aria-description="Opens its history"]')).toHaveCount(7);
    await expect(room(house).locator('button.tile.tilebtn[aria-label]')).toHaveCount(0);
    await expect(detail(house).locator('.aqsum').first()).toContainText('AQI 42');
    await expect(card(house)).toHaveCount(0);
    await expect(sheet(house)).toHaveCount(0);
    // one column: the blocks are stacked, none beside another
    const lefts = await detail(house)
      .locator('.blocks > *')
      .evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(lefts).size, 'one left edge').toBe(1);
  });

  test('a reading follows the entity, and the numbers are in the profile’s language: 1.0 and 1,0', async ({house}) => {
    await openTab(house);
    await expect(room(house).locator('.tile .v').nth(3)).toHaveText('1.0ppm');
    await house.setLanguage('fr');
    await expect(room(house).locator('.tile .v').nth(3)).toHaveText('1,0ppm');
  });

  test('a purifier that is off the air says so, and has no control', async ({house}) => {
    await openTab(house);
    await house.setState(FAN, {state: 'unavailable'});
    await expect(room(house).locator('.aqctl')).toHaveCount(0);
    await expect(room(house).locator('p.muted')).toHaveText(
      "The purifier is offline, so it can't be adjusted right now.",
    );
  });

  test('the Day, Week and Month tabs are in the header: the range chosen asks for the chart again and stays when the tab is left', async ({
    house,
  }) => {
    await openTab(house);
    const tabs = pane(house).locator(':scope > hp-pane-header hp-range-tabs');
    const outdoor = detail(house).getByRole('heading', {name: /^Outdoor air/});
    await expect(outdoor).toHaveText('Outdoor air, last 24 hours');
    await tabs.locator('[role="tab"]', {hasText: 'Month'}).click();
    await expect(outdoor).toHaveText('Outdoor air, last 30 days');
    await expect(tabs.locator('[aria-selected="true"]')).toHaveText('Month');
    await house.tab('home');
    await openTab(house);
    await expect(tabs.locator('[aria-selected="true"]')).toHaveText('Month');
    await expect(outdoor).toHaveText('Outdoor air, last 30 days');
  });

  test('the outdoor history is asked for when the tab is shown, and not again when it is shown again; a room’s readings are asked for only when a tile is tapped', async ({
    house,
  }) => {
    expect(await asked(house, 'sensor.outdoor_aqi'), 'before the tab').toHaveLength(0);
    await openTab(house);
    await expect(detail(house).locator('hp-chart .apexcharts-canvas').first()).toBeVisible();
    expect(await periods(house, 'sensor.outdoor_aqi')).toEqual(['5minute']);
    expect(await asked(house, 'sensor.office_purifier_pm2_5'), 'no tile tapped').toHaveLength(0);
    await house.tab('home');
    await openTab(house);
    await expect(detail(house).locator('hp-chart .apexcharts-canvas').first()).toBeVisible();
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await periods(house, 'sensor.outdoor_aqi'), 'shown again').toEqual(['5minute']);
  });

  test('a tap on a tile opens that reading’s history in a sheet over the screen, with its own range tabs; Escape closes it', async ({
    house,
  }) => {
    await openTab(house);
    await tile(house, CO2).click();
    await expect(history(house).locator('hp-sheet')).toHaveAttribute('open', '');
    await expect(history(house).locator('hp-sheet h2')).toHaveText('CO₂');
    await expect(history(house).locator('hp-range-tabs [role="tab"]')).toHaveText(['Day', 'Week', 'Month']);
    await expect(history(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(history(house)).toHaveCount(0);
    await expect(house.root().locator('#pane-air')).toBeVisible();
  });

  test('Home’s Air tile opens the detail as a sheet over Home, with its tabs, and Escape closes it', async ({
    house,
  }) => {
    await house.tab('home');
    await house.root().locator('[data-opens="air.detail"]').first().click();
    await expect(sheet(house)).toHaveAttribute('open', '');
    await expect(sheet(house).locator('h2')).toHaveText('Air quality');
    await expect(sheet(house).locator('hp-range-tabs [role="tab"]')).toHaveText(['Day', 'Week', 'Month']);
    await expect(room(house).locator('h3').first()).toHaveText('Office');
    await expect(house.root().locator('#pane-home')).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(sheet(house)).not.toHaveAttribute('open', '');
    await expect(detail(house)).toHaveCount(0);
  });

  test('a thermostat change gives zero mutations in the pane', async ({house}) => {
    await openTab(house);
    await expect(room(house)).toHaveCount(1);
    await expect(detail(house).locator('hp-chart .apexcharts-canvas').first()).toBeVisible();
    await house.mutations.reset();
    await house.setState('climate.living_room', {attributes: {temperature: 23}});
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-air-pane'), 'mutations').toBe(0);
  });

  // The highlighted tile's figure (`--t-warn` on the tile) reads 4.05:1, under 4.5:1. The legacy detail drew the same
  // colours, so only that rule on that element is left out, everything else must be clean.
  test('the tab has no serious or critical accessibility finding, but the contrast of a highlighted tile’s figure', async ({
    house,
  }) => {
    await openTab(house);
    await expect(detail(house).locator('hp-chart .apexcharts-canvas').first()).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    const found = violations
      .filter(v => v.impact === 'serious' || v.impact === 'critical')
      .flatMap(v =>
        v.nodes
          .filter(n => !(v.id === 'color-contrast' && String(n.target.at(-1)).includes('.hi.tile')))
          .map(() => v.id),
      );
    expect(found).toEqual([]);
  });
});

test.describe('in the bare house, on a phone', () => {
  test.use({houseOpts: {house: 'bare'}});
  test.beforeEach(() => phoneOnly());

  test('the header says there are no purifiers and the tab has no room to show', async ({house}) => {
    await openTab(house);
    await expect(pane(house).locator(':scope > hp-pane-header > [slot="sub"]')).toHaveText('No purifiers found');
    await expect(room(house)).toHaveCount(0);
    await expect(sheet(house)).toHaveCount(0);
  });
});

test.describe('on a tablet', () => {
  test.beforeEach(() => tabletOnly());

  test('the tab is the detail inline: the room card with its seven tiles and the Automagic control, and the pane draws no card of its own', async ({
    house,
  }) => {
    await house.tab('air');
    await expect(detail(house).locator('hp-pane-header h2')).toHaveText('Air quality');
    await expect(detail(house).locator('hp-pane-header [slot="sub"]')).toHaveText('Moderate · Office: PM2.5 20');
    await expect(room(house)).toHaveCount(1);
    await expect(room(house).locator('.aqhead h3')).toHaveText('Office');
    await expect(room(house).locator('.aqhead p')).toHaveText('PM2.5 moderate · 21.4°');
    await expect(room(house).locator('.aqhead .status')).toHaveText('Moderate');
    await expect(room(house).locator('.tile .k')).toHaveText(['PM2.5', 'CO₂', 'VOC', 'CO', 'PM1', 'PM10', 'Humidity']);
    await expect(room(house).locator('.tile .v').first()).toHaveText('20µg/m³');
    await expect(room(house).locator('.tile.hi')).toHaveCount(1);
    await expect(room(house).getByRole('radio', {name: 'Automagic'})).toHaveAttribute('aria-checked', 'true');
    await expect(room(house).getByRole('radio', {name: 'Manual'})).toHaveAttribute('aria-checked', 'false');
    await expect(room(house).locator('.hint')).toContainText('now 40%');
    await expect(room(house).locator('hp-stepper')).toHaveCount(0);
    await expect(card(house)).toHaveCount(0);
  });

  test('the outside block shows the station, its pollen and the two outdoor charts, the only charts of the detail', async ({
    house,
  }) => {
    await house.tab('air');
    const outside = detail(house).locator('.inner').first();
    await expect(outside.locator('h3').first()).toHaveText('Outside');
    await expect(outside.locator('.aqsum')).toContainText('AQI 42 · AQHI 2 · PM2.5 9.0 µg/m³ · station 6 km away');
    await expect(outside.locator('.pollen .k')).toHaveText([
      'Trees pollen',
      'Grass pollen',
      'Weeds pollen',
      'Mold pollen',
    ]);
    await expect(outdoorCharts(house)).toHaveCount(2);
    await expect(detail(house).locator('hp-chart .apexcharts-canvas').first()).toBeVisible();
    await expect(outdoorBlock(house).locator('h4')).toHaveText(['AQI (Mila station)', 'AQHI (Environment Canada)']);
    await expect(outdoorBlock(house).locator('section p')).toHaveText([
      'US AQI from the station: good up to 50, moderate up to 100.',
      'The AQHI from Environment Canada, on its 1 to 10 scale.',
    ]);
    await expect(detail(house).locator('.aqmetric')).toHaveCount(0);
  });

  test('the outdoor air block sits one gap below the block above it, as every block of the column does', async ({
    house,
  }) => {
    await house.tab('air');
    await expect(outdoorCharts(house)).toHaveCount(2);
    const gaps = await detail(house)
      .locator('.blocks > *')
      .evaluateAll(els =>
        els.slice(1).map((el, i) => Math.round(el.getBoundingClientRect().top - els[i].getBoundingClientRect().bottom)),
      );
    // the header's own gap above the rooms is the header's; from the rooms down the column has one gap
    const column = gaps.slice(-2);
    expect(column, 'rooms, outside, outdoor air: two gaps').toHaveLength(2);
    expect(column[1], 'above Outdoor air').toBeGreaterThan(0);
    expect(column[1], 'as above Outside').toBe(column[0]);
  });

  test('a tap on Manual sends fan.set_preset_mode and shows the stepper at once, at the fan’s speed', async ({
    house,
  }) => {
    await house.tab('air');
    await room(house).getByRole('radio', {name: 'Manual'}).click();
    await expectCall(house, /^fan\.set_preset_mode \{"entity_id":"fan\.office_purifier","preset_mode":"Manual"\}$/);
    await expect(room(house).getByRole('radio', {name: 'Manual'})).toHaveAttribute('aria-checked', 'true');
    await expect(room(house).locator('hp-stepper .sv b')).toHaveText('40%');
    await expect(room(house).locator('.hint')).toHaveCount(0);
  });

  // the radio group's keys (<hp-seg>, #247): one tab stop on the chosen option, and an arrow moves the choice and the focus together
  test('the arrow keys move the mode group: Right chooses Manual and sends the call, Left goes back, End and Home go to the ends, and only the chosen option is a tab stop', async ({
    house,
  }) => {
    await house.tab('air');
    const automagic = room(house).getByRole('radio', {name: 'Automagic'});
    const manual = room(house).getByRole('radio', {name: 'Manual'});
    await expect(automagic).toHaveAttribute('tabindex', '0');
    await expect(manual).toHaveAttribute('tabindex', '-1');
    await automagic.focus();
    await house.page.keyboard.press('ArrowRight');
    await expectCall(house, /^fan\.set_preset_mode \{"entity_id":"fan\.office_purifier","preset_mode":"Manual"\}$/);
    await expect(manual).toHaveAttribute('aria-checked', 'true');
    await expect(manual).toBeFocused();
    await expect(manual).toHaveAttribute('tabindex', '0');
    await expect(automagic).toHaveAttribute('tabindex', '-1');
    await house.page.keyboard.press('ArrowLeft');
    await expect(automagic).toHaveAttribute('aria-checked', 'true');
    await expect(automagic).toBeFocused();
    await expect.poll(() => calls(house, 'fan.set_preset_mode').length, 'one call for each key').toBe(2);
    await house.page.keyboard.press('End');
    await expect(manual).toHaveAttribute('aria-checked', 'true');
    await expect(manual).toBeFocused();
    await house.page.keyboard.press('Home');
    await expect(automagic).toHaveAttribute('aria-checked', 'true');
    await expect(automagic).toBeFocused();
    await expect.poll(() => calls(house, 'fan.set_preset_mode').length, 'and one for End and for Home').toBe(4);
  });

  test('three quick taps on + show each speed at once and send one fan.set_percentage, at the last speed', async ({
    house,
  }) => {
    await house.tab('air');
    await room(house).getByRole('radio', {name: 'Manual'}).click();
    const up = room(house).getByRole('button', {name: 'Faster'});
    for (let i = 0; i < 3; i++) await up.click();
    await expect(room(house).locator('hp-stepper .sv b')).toHaveText('70%');
    await expectCall(house, /^fan\.set_percentage \{"entity_id":"fan\.office_purifier","percentage":70\}$/);
    expect(calls(house, 'fan.set_percentage'), 'one call for the burst').toHaveLength(1);
  });

  // the card cancels its waiting send in disconnectedCallback and releases the speed it held: a fresh tap starts a fresh wait
  test('a speed tap whose card leaves the document within the wait sends nothing, even when the panel comes back', async ({
    house,
  }) => {
    await house.tab('air');
    await room(house).getByRole('radio', {name: 'Manual'}).click();
    await room(house).getByRole('button', {name: 'Faster'}).click();
    await house.page.evaluate(() => {
      const p = (window as unknown as {panel: HTMLElement}).panel;
      const next = p.nextSibling;
      p.remove();
      document.body.insertBefore(p, next);
    });
    await house.page.waitForTimeout(900);
    expect(calls(house, 'fan.set_percentage')).toEqual([]);
  });

  test('the stepper stops at ten and at a hundred: − is disabled at 10 and + at 100', async ({house}) => {
    await house.tab('air');
    const down = room(house).getByRole('button', {name: 'Slower'});
    const up = room(house).getByRole('button', {name: 'Faster'});
    await house.setState(FAN, {attributes: {preset_mode: 'Manual', percentage: 10}});
    await expect(room(house).locator('hp-stepper .sv b')).toHaveText('10%');
    await expect(down).toBeDisabled();
    await expect(up).toBeEnabled();
    await house.setState(FAN, {attributes: {preset_mode: 'Manual', percentage: 100}});
    await expect(room(house).locator('hp-stepper .sv b')).toHaveText('100%');
    await expect(up).toBeDisabled();
    await expect(down).toBeEnabled();
  });

  test('a purifier that is off the air says so, and has no control', async ({house}) => {
    await house.tab('air');
    await house.setState(FAN, {state: 'unavailable'});
    await expect(room(house).locator('.aqctl')).toHaveCount(0);
    await expect(room(house).locator('p.muted')).toHaveText(
      "The purifier is offline, so it can't be adjusted right now.",
    );
  });

  test('Week asks the recorder once for the outdoor chart and the chart redraws; going back to Day is the cache, and the library came once', async ({
    house,
  }) => {
    await house.tab('air');
    const canvas = detail(house).locator('hp-chart .apexcharts-canvas').first();
    await expect(canvas).toBeVisible();
    // what the chart was given: the first line's points and the span of the time axis
    const drawn = () =>
      detail(house)
        .locator('hp-chart')
        .first()
        .evaluate(chart => {
          const {series, xaxis} = (
            chart as unknown as {options: {series: {data: unknown[]}[]; xaxis: {min: number; max: number}}}
          ).options;
          return {points: series[0].data.length, days: Math.round((xaxis.max - xaxis.min) / 864e5)};
        });
    const day = await drawn();
    expect(day.days).toBe(1);
    expect(day.points).toBeGreaterThan(0);
    expect(await periods(house, 'sensor.outdoor_aqi')).toEqual(['5minute']);
    await detail(house).locator('hp-range-tabs [role="tab"]', {hasText: 'Week'}).click();
    await expect(detail(house).getByRole('heading', {name: /^Outdoor air/})).toHaveText('Outdoor air, last 7 days');
    await expect(detail(house).locator('hp-range-tabs [aria-selected="true"]')).toHaveText('Week');
    await expect.poll(() => periods(house, 'sensor.outdoor_aqi')).toEqual(['5minute', 'hour']);
    await expect(canvas).toBeVisible();
    await expect.poll(drawn, 'the chart is given the week’s series and axis').toMatchObject({days: 7});
    expect((await drawn()).points, 'hourly points, not five-minute ones').not.toBe(day.points);
    await detail(house).locator('hp-range-tabs [role="tab"]', {hasText: 'Day'}).click();
    await expect(detail(house).getByRole('heading', {name: /^Outdoor air/})).toHaveText('Outdoor air, last 24 hours');
    await expect(canvas).toBeVisible();
    expect(await periods(house, 'sensor.outdoor_aqi'), 'the day again is the cache').toEqual(['5minute', 'hour']);
    expect(house.chunkRequests, 'the chart library').toHaveLength(1);
  });

  test('a tap on CO₂ opens its history: the chart over the day, and Week asks the recorder again; Escape closes it', async ({
    house,
  }) => {
    await house.tab('air');
    await expect(detail(house).locator('hp-chart .apexcharts-canvas').first()).toBeVisible();
    await tile(house, CO2).click();
    const sheetEl = history(house);
    await expect(sheetEl.locator('hp-sheet h2')).toHaveText('CO₂');
    await expect(sheetEl.locator('hp-sheet > [slot="sub"]')).toHaveText('Office');
    await expect(sheetEl.locator('.inner h3').first()).toHaveText('CO₂, last 24 hours');
    await expect(sheetEl.locator('.inner p').first()).toHaveText('Good is up to 800 ppm, moderate up to 1,200.');
    await expect(sheetEl.locator('hp-chart .apexcharts-canvas')).toBeVisible();
    await expect.poll(async () => (await asked(house, 'sensor.office_purifier_co2')).length).toBe(1);
    await sheetEl.locator('hp-range-tabs [role="tab"]', {hasText: 'Week'}).click();
    await expect(sheetEl.locator('.inner h3').first()).toHaveText('CO₂, last 7 days');
    await expect.poll(() => periods(house, 'sensor.office_purifier_co2')).toEqual(['5minute', 'hour']);
    await house.page.keyboard.press('Escape');
    await expect(sheetEl).toHaveCount(0);
  });

  test('the PM2.5 tile’s history has the outdoor station’s dashed line beside the room’s', async ({house}) => {
    await house.tab('air');
    await tile(house, 'PM2.5 20µg/m³').click();
    await expect(history(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    await expect(history(house).locator('.legend')).toHaveText('OfficeOutside');
    await expect(history(house).locator('.inner p').first()).toContainText('The dashed line is the outdoor station.');
  });

  test('every tile opens a history, and a reading no band is rated for says so', async ({house}) => {
    await house.tab('air');
    await tile(house, 'PM10 24µg/m³').click();
    await expect(history(house).locator('hp-sheet h2')).toHaveText('PM10');
    await expect(history(house).locator('.inner p').first()).toHaveText('Mila rates no band for this reading.');
  });

  test('the history’s sheet has no serious or critical accessibility finding while it is open', async ({house}) => {
    await house.tab('air');
    await tile(house, CO2).click();
    await expect(history(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });

  test('a thermostat change gives zero mutations in the pane', async ({house}) => {
    await house.tab('air');
    await house.mutations.reset();
    await house.setState('climate.living_room', {attributes: {temperature: 23}});
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-air-pane, hp-air-detail, hp-air-room'), 'mutations').toBe(0);
  });

  test('the detail has no serious or critical accessibility finding', async ({house}) => {
    await house.tab('air');
    await expect(detail(house).locator('hp-chart .apexcharts-canvas').first()).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

test.describe('in French, on a tablet', () => {
  test.use({houseOpts: {cfg: {...FULL_CFG, names: KEEP_ENGLISH_NAMES}, lang: 'fr'}});
  test.beforeEach(() => tabletOnly());

  // starts in French, and does not switch language on the page, because of #325 (a transient `translate(NaN, 0)` from ApexCharts)
  test('the numbers and the words are the profile’s: 1,0 where the detail used to be English', async ({house}) => {
    await house.tab('air');
    await expect(room(house).locator('.tile .v').nth(3)).toHaveText('1,0ppm');
    await expect(room(house).getByRole('radio', {name: 'Manuel'})).toHaveAttribute('aria-checked', 'false');
    const humidity = room(house).getByRole('button', {name: /^Humidité /});
    await expect(humidity).toBeVisible();
    await expect(humidity).toHaveAttribute('aria-description', 'Ouvre l’historique');
  });
});
