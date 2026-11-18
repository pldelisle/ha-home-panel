// The Energy tab (spec 19): <hp-energy-pane>, <hp-energy-detail> with <hp-power-flow> and <hp-sankey>, <hp-water-card> and
// <hp-hilo-card>. The two tiles are the phone's, where a tap opens a card's sheet; the detail is inline on both (a phone's under its header); on a tablet the tab is the detail
// inline with the water heater's and Hilo's cards after it. The test house has a 3.24 kW meter, a water heater at 50 degrees idle and a charger at
// 7.1 kW; it has no Hilo until a test adds its rate sensor.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, phoneOnly, tabletOnly, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

// before noon: the test house's recorder writes each daily row from the instant it is asked, so a clock before noon puts the last row on today (a Sankey of today needs one)
const MORNING = '2026-11-07T08:00:00-05:00';

test.use({houseOpts: {cfg: FULL_CFG}});

const pane = (house: House) => house.root().locator('#pane-energy hp-energy-pane');
const detail = (house: House) => pane(house).locator('hp-energy-detail');
const flow = (house: House) => detail(house).locator('hp-power-flow');
const water = (house: House) => house.root().locator('hp-water-card');
const hilo = (house: House) => house.root().locator('hp-hilo-card');
const STATISTICS = 'recorder/statistics_during_period';
const GRID = 'sensor.house_power';
const METER = 'sensor.hilo_energy_total';
const HILO_RATE = 'sensor.hilo_gateway_hilo_rate_current';

/** How big the chart's axis texts are drawn, in pixels: they are HTML over the svg, so they share one size whatever the card's width. */
const axisPixels = (house: House) =>
  water(house)
    .locator('.whbox .axis')
    .first()
    .evaluate(text => parseFloat(getComputedStyle(text).fontSize));

// Energy is under More on a phone
const openTab = async (house: House) => {
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="energy"] button').click();
  await expect(house.root().locator('#pane-energy')).toBeVisible();
};

// the statistics requests of the history's power windows: the grid with the loads for a week by the hour and for a year by the day, and the
// water heater for a day by five minutes (every one names the water heater's power; the legacy panel's own reads, the Car card's daily
// bars among them, do not)
const WATER_POWER = 'sensor.water_heater_power';
const powerReads = async (house: House) =>
  (await house.asked(STATISTICS)).filter(m => (m.statistic_ids as string[]).includes(WATER_POWER)).length;

// the one window only Energy reads, the year of daily power, which the card asks when it first connects
const yearReads = async (house: House) =>
  (await house.asked(STATISTICS)).filter(m => m.period === 'day' && (m.statistic_ids as string[]).includes(WATER_POWER))
    .length;

// the energy windows as a whole: the power windows and the meter's 33 days (the meter's today, by the hour, is not counted)
const energyReads = async (house: House) =>
  (await powerReads(house)) +
  (await house.asked(STATISTICS)).filter(m => m.period === 'day' && (m.statistic_ids as string[]).join() === METER)
    .length;

// the energy reads once they stopped coming: the same count twice, 300 ms apart (the meter's second read, when there is one, lands late)
const settledEnergyReads = async (house: House) => {
  let last = -1;
  for (;;) {
    const now = await energyReads(house);
    if (now === last) return now;
    last = now;
    await house.page.waitForTimeout(300);
  }
};

// a house with Hilo: its current-rate sensor is in the states, at the low tier
const addHilo = async (house: House) => {
  await house.setState('sensor.hilo_gateway_hilo_rate_low', {state: '0.0732'});
  await house.setState(HILO_RATE, {state: '0.0732'});
};

test.describe('on a phone', () => {
  test.beforeEach(() => phoneOnly());

  test('the tab is the header and the detail inline: the range, the flow with the grid value, the charts and the totals; no card, no sheet', async ({
    house,
  }) => {
    await openTab(house);
    await expect(pane(house).locator(':scope > hp-pane-header > [slot="sub"]')).toHaveText(
      'Grid supplying 3.2 kW · room heating 2.4 kW · Hilo rate unknown',
    );
    await expect(pane(house).locator(':scope > hp-range-tabs').getByRole('tab')).toHaveText([
      'Now',
      'Today',
      'Week',
      'Month',
      'Year',
    ]);
    await expect(detail(house)).toBeVisible();
    await expect(flow(house).locator('text.big').nth(1)).toHaveText('3.2kW');
    await expect(flow(house).locator('text.st', {hasText: /^kW · Home$/})).toHaveText('kW · Home');
    await expect(detail(house).locator('.inner > hp-chart .apexcharts-canvas')).toBeVisible();
    // today has no row in this clock's recorder, so its donut would say so: the week has days
    await pane(house).locator(':scope > hp-range-tabs').getByRole('tab', {name: 'Week'}).click();
    await expect(detail(house).locator('.donutchart .apexcharts-canvas')).toBeVisible();
    await expect(detail(house).locator('.totals .tile')).toHaveCount(6);
    await expect(pane(house).locator('hp-sheet[open]')).toHaveCount(0);
    // the header of the detail is the tablet's: on a phone the pane's header is the only one
    await expect(detail(house).locator('hp-pane-header')).toHaveCount(0);
  });

  test('a total that has a range sets the tab to it; the car and the rate stay plain tiles', async ({house}) => {
    await openTab(house);
    const totals = detail(house).locator('.totals');
    await expect(totals.locator('button.tile')).toHaveCount(4);
    await expect(totals.locator('.tile')).toHaveCount(6);
    const tabs = pane(house).locator(':scope > hp-range-tabs');
    await totals.getByRole('button', {name: /^30 days/}).click();
    await expect(tabs.getByRole('tab', {name: 'Month'})).toHaveAttribute('aria-selected', 'true');
    await totals.getByRole('button', {name: /^Yesterday/}).click();
    await expect(tabs.getByRole('tab', {name: 'Week'})).toHaveAttribute('aria-selected', 'true');
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
    await expect(flow(house).locator('text.big').nth(1)).toHaveText('4.1kW');
    await house.setState(GRID, {state: '4900'});
    await expect(flow(house).locator('text.big').nth(1)).toHaveText('4.9kW');
    expect(await gridWidth(), 'the line grows with the power').not.toBe(before);
    expect(
      await flow(house).evaluate(
        host => host.shadowRoot!.querySelector('svg') === (window as unknown as {flowSvg: Element}).flowSvg,
      ),
      'the same svg node',
    ).toBe(true);
  });

  test('the range tabs under the header choose the detail’s range, and the choice stays across a visit to another tab', async ({
    house,
  }) => {
    await openTab(house);
    const tab = pane(house).locator(':scope > hp-range-tabs').getByRole('tab', {name: 'Month'});
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(detail(house).locator('.inner h3').first()).toHaveText('Last 30 days, day by day');
    await house.tab('home');
    await openTab(house);
    await expect(detail(house).locator('.inner h3').first()).toHaveText('Last 30 days, day by day');
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
    await expect(water(house).locator('.hero .v')).toHaveText('50.0°');
    await expect(water(house).locator('.hero .status')).toHaveText('Idle · 0 W');
    expect(await axisPixels(house), 'the chart axis is 11 px').toBe(11);
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
    await expect(hilo(house).locator('.hero .status')).toHaveText('Low tier');
    await expect(hilo(house).locator('.tile .k')).toHaveText(['Medium', 'Reward', 'Rewards']);
    await house.page.keyboard.press('Escape');
    await expect(hilo(house)).toHaveCount(0);
  });

  test('Home’s Water heater tile opens the same sheet over Home, and the tab stays Home', async ({house}) => {
    await house.tab('home');
    await house.root().locator('#htiles [data-opens="energy.water"]').click();
    await expect(pane(house).locator('hp-sheet[open] h2')).toHaveText('Water heater');
    await expect(water(house).locator('.hero .v')).toHaveText('50.0°');
    await expect(house.root().locator('#pane-home')).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(water(house)).toHaveCount(0);
  });

  // the history is the pane's `EnergyHistory`: the windows the legacy panel shares are in the cache from the start, and the year of
  // daily power, which only Energy reads, is asked when the pane first connects
  test('the totals fill from the shared windows, and the year of days is asked when the tab first opens', async ({
    house,
  }) => {
    await expect.poll(() => powerReads(house)).toBe(2);
    const atStart = await energyReads(house);
    expect(await yearReads(house), 'at start').toBe(0);
    await openTab(house);
    await expect(detail(house).locator('.totals .tile .v').first()).not.toHaveText(/^No reading/);
    await expect.poll(() => yearReads(house), 'opening Energy').toBe(1);
    expect(await energyReads(house), 'opening Energy').toBe(atStart + 1);
  });

  test('a light change gives zero mutations in the pane, its detail and the flow', async ({house}) => {
    await openTab(house);
    await expect(flow(house).locator('svg')).toBeVisible();
    await house.mutations.reset();
    await house.setState('light.living_room_1', {attributes: {brightness: 100}});
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-energy-pane, hp-energy-detail, hp-power-flow'), 'mutations').toBe(0);
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

test.describe('on a phone in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, lang: 'fr'}});
  test.beforeEach(() => phoneOnly());

  // French says Direct and Jour, short enough that the five fit a phone's width: none is hidden past the pill's edge
  test('the five range tabs are French and all fit on the screen, and the last one can be chosen', async ({house}) => {
    await openTab(house);
    const tabs = pane(house).locator(':scope > hp-range-tabs');
    await expect(tabs.getByRole('tab')).toHaveText(['Direct', 'Jour', 'Semaine', 'Mois', 'Année']);
    const pill = (await tabs.getByRole('tablist').boundingBox())!;
    const last = (await tabs.getByRole('tab', {name: 'Année'}).boundingBox())!;
    expect(last.x + last.width, 'the last tab ends inside the pill').toBeLessThanOrEqual(pill.x + pill.width + 0.5);
    expect(pill.x + pill.width, 'the pill ends inside the screen').toBeLessThanOrEqual(
      house.page.viewportSize()!.width,
    );
    await tabs.getByRole('tab', {name: 'Année'}).click();
    await expect(tabs.getByRole('tab', {name: 'Année'})).toHaveAttribute('aria-selected', 'true');
    await expect(detail(house).locator('.inner h3').first()).toHaveText('Mois par mois');
  });
});

test.describe('on a tablet', () => {
  test.beforeEach(() => tabletOnly());

  test('the water heater’s card reads as before, with the last 24 hours once the history is there; no Hilo card without Hilo', async ({
    house,
  }) => {
    await house.tab('energy');
    await expect(water(house).locator('.elbl')).toHaveText('Water heater');
    await expect(water(house).locator('.hero .v')).toHaveText('50.0°');
    await expect(water(house).locator('.hero .status')).toHaveText('Idle · 0 W');
    await expect(water(house).locator('.whleg span')).toHaveText(['Water temperature', 'Heating power']);
    await expect(water(house).locator('.whline')).toContainText('Last 24 hours:');
    expect(await axisPixels(house), 'the chart axis is 11 px').toBe(11);
    await expect(hilo(house)).toHaveCount(0);
  });

  test('the chart’s axis texts stay 11 px as the card gets wider, in the secondary colour, and follow Larger text', async ({
    house,
  }) => {
    await house.tab('energy');
    // the secondary text colour as this card resolves it: a probe painted in it
    const secondary = await water(house).evaluate(card => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--fg2)';
      card.shadowRoot!.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    for (const width of [800, 1024, 1366]) {
      await house.page.setViewportSize({width, height: 900});
      await expect(water(house).locator('.whbox .axis').first()).toBeVisible();
      const cardWidth = (await water(house).locator('svg.whchart').boundingBox())!.width;
      expect(await axisPixels(house), `at a ${Math.round(cardWidth)} px chart`).toBe(11);
    }
    const colour = await water(house)
      .locator('.whbox .axis')
      .first()
      .evaluate(text => getComputedStyle(text).color);
    expect(colour, 'the secondary text colour').toBe(secondary);
    await house
      .root()
      .locator('#app')
      .evaluate(app => app.style.setProperty('--tx', '1.3'));
    expect(await axisPixels(house), 'at Larger text').toBeCloseTo(14.3, 1);
  });

  test('Hilo’s card shows the rate and the tier beside the water heater’s once the house has Hilo', async ({house}) => {
    await house.tab('energy');
    await addHilo(house);
    await expect(hilo(house).locator('.hero .v')).toHaveText('7.32¢/kWh');
    await expect(hilo(house).locator('.hero .status')).toHaveText('Low tier');
    await expect(water(house)).toHaveCount(1);
  });

  test('the detail sits inline above the cards, and is no sheet over the page', async ({house}) => {
    await house.tab('energy');
    await expect(detail(house)).toBeVisible();
    await expect(detail(house).getByRole('region', {name: 'Home energy'})).not.toHaveAttribute('aria-modal', /.*/);
    const inline = await detail(house).boundingBox();
    const cards = await water(house).boundingBox();
    expect(cards!.y, 'the cards come after the detail').toBeGreaterThan(inline!.y + inline!.height - 1);
  });

  // The history is one load for the panel (ADR 0028). The legacy panel asks the shared windows at start (its header, the stack and the Home
  // tiles read them), and Energy asks the year of daily power when its card first connects, not at start. Each window is read once for the
  // panel, the meter's 33 days included, however often the tab is opened within the fifteen minutes.
  test('opening the tab asks the year of days once, the shared windows no more, and opening it again nothing', async ({
    house,
  }) => {
    await expect.poll(() => powerReads(house)).toBe(2);
    await expect.poll(() => energyReads(house), 'the shared windows at start').toBeGreaterThanOrEqual(3);
    const atStart = await settledEnergyReads(house);
    // the hourly week and the water heater's day (the two power reads) and the meter's 33 days, once or twice: when the panel's first
    // load runs under the config it has before the house's own arrives, the shell empties the cache with the new one and the meter is
    // read again. It must: the first load's replies are the old generation's and reject as StaleReply. Whether that first load starts
    // before the house's config arrives is the page's timing (#276 moved the idle clock out of the guest's first draw and made it rarer).
    expect([3, 4], 'the shared windows at start').toContain(atStart);
    expect(await yearReads(house), 'at start').toBe(0);
    await house.tab('energy');
    await expect(water(house).locator('.whleg')).toBeVisible();
    await expect.poll(() => yearReads(house), 'opening Energy').toBe(1);
    expect(await energyReads(house), 'opening Energy').toBe(atStart + 1);
    await house.tab('home');
    await house.tab('energy');
    await expect(water(house).locator('.whleg')).toBeVisible();
    expect(await energyReads(house), 'opening Energy again').toBe(atStart + 1);
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

// The detail (#240): the test house's recorder answers with made-up smooth curves relative to its clock, so a frozen clock gives the same
// figures at every run.
test.describe('the detail on a tablet', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: MORNING, frozen: true}});
  test.beforeEach(() => tabletOnly());

  const charts = (house: House) => detail(house).locator('.inner > hp-chart .apexcharts-canvas');
  const mainTitle = (house: House) => detail(house).locator('.inner h3').first();
  const rangeTab = (house: House, name: string) => detail(house).locator('hp-range-tabs').getByRole('tab', {name});

  // the statistics the panel asked for so far, as the harness saw them
  const asked = async (house: House) => (await house.asked(STATISTICS)).length;

  const openDetail = async (house: House) => {
    await house.tab('energy');
    await expect(charts(house)).toHaveCount(1); // the main chart; the donut is in its own card
    await expect(detail(house).locator('.donutchart .apexcharts-canvas')).toBeVisible();
  };

  test('a total’s tap sets the range tabs and brings the main chart into view', async ({house}) => {
    await openDetail(house);
    const totals = detail(house).locator('.totals');
    await expect(totals.locator('button.tile')).toHaveCount(4);
    await totals.getByRole('button', {name: /^30 days/}).click();
    await expect(rangeTab(house, 'Month')).toHaveAttribute('aria-selected', 'true');
    await expect(mainTitle(house)).toHaveText('Last 30 days, day by day');
    await totals.getByRole('button', {name: /^Today so far/}).click();
    await expect(rangeTab(house, 'Today')).toHaveAttribute('aria-selected', 'true');
    await expect(mainTitle(house)).toBeInViewport();
  });

  test('Week, Month and Year redraw the main chart from the loaded slices, and ask the recorder for nothing more', async ({
    house,
  }) => {
    await openDetail(house);
    await expect(mainTitle(house)).toHaveText('Today, hour by hour');
    const before = await asked(house);
    const reads = (await house.reads()).length;
    await rangeTab(house, 'Week').click();
    await expect(mainTitle(house)).toHaveText('Last 7 days, hour by hour');
    await expect(rangeTab(house, 'Week')).toHaveAttribute('aria-selected', 'true');
    await expect(detail(house).locator('.apexcharts-xaxis-label').first()).toBeVisible();
    await rangeTab(house, 'Month').click();
    await expect(mainTitle(house)).toHaveText('Last 30 days, day by day');
    await expect(
      detail(house)
        .locator('.apexcharts-xaxis-label', {hasText: /(Oct|Nov) \d+/})
        .first(),
    ).toBeVisible();
    await rangeTab(house, 'Year').click();
    await expect(mainTitle(house)).toHaveText('Month by month');
    await expect(detail(house).locator('.apexcharts-yaxis-label', {hasText: 'MWh'}).first()).toBeVisible();
    await rangeTab(house, 'Today').click();
    await expect(mainTitle(house)).toHaveText('Today, hour by hour');
    expect(await asked(house), 'statistics requests after four taps').toBe(before);
    expect((await house.reads()).length, 'reads after four taps').toBe(reads);
  });

  test('the tab’s one range drives the Sankey: Now shows the live flow, the other ranges the ribbons of their days, and none asks the recorder for anything', async ({
    house,
  }) => {
    await openDetail(house);
    const before = await asked(house);
    const note = detail(house).locator('.sankeyblock p');
    // no control of its own: the detail's only tabs are the header's five
    await expect(detail(house).getByRole('tab')).toHaveCount(5);
    await expect(detail(house).locator('.sankeyblock').getByRole('tab')).toHaveCount(0);
    await expect(rangeTab(house, 'Now')).toHaveAttribute('aria-selected', 'true');
    await expect(detail(house).locator('.sankeyblock hp-power-flow svg')).toBeVisible();
    await expect(detail(house).locator('hp-sankey')).toHaveCount(0);
    await expect(note).toHaveText("Live power: the Hilo meter on the left, each device's own sensor on the right.");
    await rangeTab(house, 'Month').click();
    await expect(detail(house).locator('hp-power-flow')).toHaveCount(0);
    const ribbons = detail(house).locator('hp-sankey svg path');
    await expect(ribbons.first()).toBeVisible();
    expect(await ribbons.count(), 'a ribbon for each use and each room').toBeGreaterThan(4);
    await expect(note).toHaveText(/^Last 30 days, [\d,\u202f\u00a0 ]+ kWh in all\.$/);
    await expect(detail(house).locator('hp-sankey text', {hasText: /^Grid$/})).toBeVisible();
    await rangeTab(house, 'Week').click();
    await expect(note).toHaveText(/^Last 7 days, [\d,\u202f\u00a0 ]+ kWh in all\.$/);
    await rangeTab(house, 'Year').click();
    await expect(note).toHaveText(/^Last 365 days, [\d,\u202f\u00a0 ]+ kWh in all\.$/);
    await rangeTab(house, 'Today').click();
    await expect(note).toHaveText(/^Energy since midnight, [\d.]+ kWh so far\.$/);
    await expect(detail(house).locator('hp-sankey svg path').first()).toBeVisible();
    await rangeTab(house, 'Now').click();
    await expect(detail(house).locator('hp-sankey')).toHaveCount(0);
    await expect(detail(house).locator('.sankeyblock hp-power-flow svg')).toBeVisible();
    expect(await asked(house), 'statistics requests after six taps').toBe(before);
  });

  test('the donut’s table and the totals read as literals', async ({house}) => {
    await openDetail(house);
    const rows = detail(house).locator('.donut tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.locator('td:first-child')).toHaveText([
      'Room heating',
      'Water heating',
      'EV charging',
      'Rest of home',
    ]);
    // Now draws today's hours, so the donut is today's (eight hours into the day)
    await expect(detail(house).locator('.donut').locator('xpath=..').locator('p')).toHaveText(
      /^Today so far\. Rest of home/,
    );
    await expect(rows.locator('td.r:nth-child(2)')).toHaveText(['70.7 kWh', '17.7 kWh', '17.7 kWh', '0.0 kWh']);
    await expect(rows.locator('td.r:nth-child(3)')).toHaveText(['67%', '17%', '17%', '0%']);
    // the Month tab is the 30 days the donut always drew
    await rangeTab(house, 'Month').click();
    await expect(detail(house).locator('.donut').locator('xpath=..').locator('p')).toHaveText(
      /^Last 30 days\. Rest of home/,
    );
    await expect(rows.locator('td.r:nth-child(2)')).toHaveText([
      '4,400.1 kWh',
      '1,100.0 kWh',
      '1,100.0 kWh',
      '0.0 kWh',
    ]);
    await expect(rows.locator('td.r:nth-child(3)')).toHaveText(['67%', '17%', '17%', '0%']);
    await expect(detail(house).locator('.totals .tile .k')).toHaveText([
      'Today so far',
      'Yesterday',
      '30 days',
      'November',
      'EV, 30 days',
      'Rate now',
    ]);
    // a figure is `.v` with its unit; no reading is the kit's `.na`, with no unit
    await expect(detail(house).locator('.totals .tile .v, .totals .tile .na')).toHaveText([
      '0.0kWh',
      'No reading',
      '0kWh',
      '0kWh',
      '1,100kWh',
      'No reading',
    ]);
    await expect(detail(house).locator('.totals .tile .na')).toHaveCount(2);
    await expect(detail(house).locator('.totals .tile .s')).toHaveText([
      'until 8:00 am',
      '0.0 kWh a day',
      'so far',
      '30 charging days',
      'Hilo rate unknown',
    ]);
  });

  // <hp-chart>'s `shape` and its width-gated first draw (ADR 0029): the element is proven by the harness (ADR 0005)
  test('a change of shape draws a new chart instance, and a change of options of the same shape updates the one it has', async ({
    house,
  }) => {
    await openDetail(house);
    const mainChart = detail(house).locator('.inner > hp-chart');
    // tag the instance the element holds (`chart`, private): the same object after an update, another after a new draw
    await mainChart.evaluate(el => {
      const chart = el as unknown as {chart: object; options: object; probe: object};
      chart.probe = chart.chart;
      chart.options = {...chart.options}; // new options, same shape
    });
    await house.page.waitForTimeout(300);
    expect(
      await mainChart.evaluate(
        el => (el as unknown as {chart: object; probe: object}).chart === (el as unknown as {probe: object}).probe,
      ),
      'same shape',
    ).toBe(true);
    await rangeTab(house, 'Week').click(); // the same kind of axis: the instance stays
    await expect(mainTitle(house)).toHaveText('Last 7 days, hour by hour');
    await house.page.waitForTimeout(300);
    expect(
      await mainChart.evaluate(
        el => (el as unknown as {chart: object; probe: object}).chart === (el as unknown as {probe: object}).probe,
      ),
      'same shape, another range',
    ).toBe(true);
    await rangeTab(house, 'Month').click(); // categories: a new instance
    await expect(mainTitle(house)).toHaveText('Last 30 days, day by day');
    await expect
      .poll(
        () =>
          mainChart.evaluate(
            el => (el as unknown as {chart: object; probe: object}).chart !== (el as unknown as {probe: object}).probe,
          ),
        'another shape',
      )
      .toBe(true);
  });

  test('a chart in a hidden place is drawn once the place has a width, and writes no error while it waits', async ({
    house,
  }) => {
    await openDetail(house);
    // a chart of the detail's own kind, put in a hidden box of the detail's root (the context still reaches it), then shown
    await detail(house).evaluate(el => {
      const chart = el.shadowRoot!.querySelector('.donutchart hp-chart') as HTMLElement & {options: object};
      const box = document.createElement('div');
      box.id = 'probe';
      box.hidden = true;
      const probe = Object.assign(document.createElement('hp-chart'), {options: chart.options, height: 190});
      box.append(probe);
      el.shadowRoot!.append(box);
    });
    const probe = detail(house).locator('#probe hp-chart');
    await house.page.waitForTimeout(500);
    await expect(probe.locator('.apexcharts-canvas')).toHaveCount(0);
    await detail(house).evaluate(el => ((el.shadowRoot!.querySelector('#probe') as HTMLElement).hidden = false));
    await expect(probe.locator('.apexcharts-canvas')).toBeVisible();
  });

  test('the detail has no serious or critical accessibility finding, charts drawn', async ({house}) => {
    await openDetail(house);
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

test.describe('the detail on a phone', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});
  test.beforeEach(() => phoneOnly());

  test('the charts draw inline in the tab, under the range tabs', async ({house}) => {
    await openTab(house);
    await expect(detail(house).locator('.inner > hp-chart .apexcharts-canvas')).toBeVisible();
    // today has no row in this clock's recorder, so its donut would say so: the week has days
    await pane(house).locator(':scope > hp-range-tabs').getByRole('tab', {name: 'Week'}).click();
    await expect(detail(house).locator('.donutchart .apexcharts-canvas')).toBeVisible();
    const tabs = await pane(house).locator(':scope > hp-range-tabs').getByRole('tablist').boundingBox();
    const inline = await detail(house).boundingBox();
    expect(inline!.y, 'the detail comes after the range tabs').toBeGreaterThan(tabs!.y + tabs!.height - 1);
  });

  test('Home’s Energy tile still opens the detail in a sheet over Home, with the range tabs in its header', async ({
    house,
  }) => {
    await house.tab('home');
    await house.root().locator('#htiles [data-opens="energy.detail"]').click();
    const sheet = pane(house).locator('hp-sheet:has(hp-energy-detail)');
    await expect(sheet).toHaveAttribute('open', '');
    await expect(detail(house).locator('.inner > hp-chart .apexcharts-canvas')).toBeVisible();
    await expect(sheet.locator(':scope > [slot="sub"]')).toContainText('Grid supplying 3.2 kW');
    await sheet.locator('hp-range-tabs').getByRole('tab', {name: 'Month'}).click();
    await expect(detail(house).locator('.inner h3').first()).toHaveText('Last 30 days, day by day');
    await expect(house.root().locator('#pane-home')).toBeVisible();
    await sheet.getByRole('button', {name: 'Close'}).click();
    await expect(detail(house)).toHaveCount(0);
  });

  test('the tab has no serious or critical accessibility finding', async ({house}) => {
    await openTab(house);
    await expect(detail(house).locator('.inner > hp-chart .apexcharts-canvas')).toBeVisible();
    // today has no row in this clock's recorder, so its donut would say so: the week has days
    await pane(house).locator(':scope > hp-range-tabs').getByRole('tab', {name: 'Week'}).click();
    await expect(detail(house).locator('.donutchart .apexcharts-canvas')).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

// The bare house has no meter and no recorded history: each chart card says so once, and no card draws empty axes, a donut or tiles of 0 kWh (#385).
test.describe('the bare house, with no history yet', () => {
  test.use({houseOpts: {house: 'bare'}});

  const NO_HISTORY = 'No history yet. It fills in as Home Assistant records the next hour.';
  const openBare = async (house: House) => {
    if (test.info().project.name === 'phone') {
      await house.root().locator('#moretab').click();
      await house.root().locator('#morelist hp-stat-tile[key="energy"] button').click();
      await expect(house.root().locator('#pane-energy')).toBeVisible();
    } else await house.tab('energy');
  };

  test('the main chart, the donut and the totals are each a title and the one sentence, on every range', async ({
    house,
  }) => {
    await openBare(house);
    const cards = detail(house).locator('.inner');
    // Now: the live flow has no reading from the grid, so the Sankey says that; the three others say the one sentence
    await expect(cards.locator('p.loading', {hasText: NO_HISTORY})).toHaveCount(3);
    await expect(cards.locator('h3')).toHaveText([
      'Today, hour by hour',
      'Where the power goes',
      'Where it went',
      'Totals',
    ]);
    await expect(detail(house).locator('.sankey p.loading')).toHaveText('No reading');
    for (const range of ['Week', 'Month', 'Year']) {
      await house.root().locator('#pane-energy').getByRole('tab', {name: range}).first().click();
      await expect(cards.locator('p.loading', {hasText: NO_HISTORY})).toHaveCount(4);
    }
    // nothing of what an empty chart drew: no chart (axes), no donut's table, no tile of 0 kWh, no legend
    await expect(detail(house).locator('hp-chart')).toHaveCount(0);
    await expect(detail(house).locator('.donut, .totals, .tile, .legend')).toHaveCount(0);
  });
});

// The Hilo card of a house whose rate sensor reads nothing says "No reading" in the line's style, with no unit, where the rate and the tiles would be a dash and a unit (#418).
test.describe('the Hilo card with no reading', () => {
  test.use({houseOpts: {house: 'bare'}});
  test.beforeEach(() => tabletOnly());

  test('the rate and the three tiles say "No reading", and the rate comes back with a reading', async ({house}) => {
    await house.setState(HILO_RATE, {state: 'unavailable'});
    await house.tab('energy');
    await expect(hilo(house).locator('.hero .na')).toHaveText('No reading');
    await expect(hilo(house).locator('.hero .v')).toHaveCount(0);
    await expect(hilo(house).locator('.tile .na')).toHaveText(['No reading', 'No reading', 'No reading']);
    await addHilo(house);
    await expect(hilo(house).locator('.hero .v')).toHaveText('7.32¢/kWh');
    await expect(hilo(house).locator('.hero .na')).toHaveCount(0);
  });
});

// A tile of Home whose sensor reads nothing says "No reading" in the line's style, never a dash as its big figure (#385).
test.describe('Home’s tiles with no reading', () => {
  test.use({houseOpts: {house: 'bare', cfg: {entities: {grid_power: 'sensor.house_power'}}}});

  test('the Energy tile says "No reading" in its line style, and the big figure comes back with a reading', async ({
    house,
  }) => {
    await house.tab('home');
    const energy = house.root().locator('#htiles hp-glance-tile[data-key="energy"] button.htile');
    await expect(energy.locator('.hv')).toHaveCount(0);
    await expect(energy.locator('.hs').first()).toHaveText('No reading');
    await house.setState('sensor.house_power', {state: '850', attributes: {unit_of_measurement: 'W'}});
    await expect(energy.locator('.hv')).toBeVisible();
  });
});

// The phone's Energy tiles say "No reading" in the line's style when their sensor reads nothing, never a dash as the big figure (#396).
test.describe('the phone’s Energy tiles with no reading', () => {
  test.use({houseOpts: {house: 'bare', cfg: {entities: {water_heater_temperature: 'sensor.tank_temperature'}}}});
  test.beforeEach(() => phoneOnly());

  test('the water heater tile says "No reading" in its line style, and its figure comes back with a reading', async ({
    house,
  }) => {
    await house.setState('sensor.tank_temperature', {state: 'unavailable'});
    await openTab(house);
    const tile = pane(house).locator('hp-stat-tile[key="water"]');
    await expect(tile.locator('.tv.num')).toHaveCount(0);
    await expect(tile.locator('.tv')).toHaveText('No reading');
    await house.setState('sensor.tank_temperature', {state: '48.5', attributes: {unit_of_measurement: '°C'}});
    await expect(tile.locator('.tv.num')).toHaveText('48.5°');
  });
});
