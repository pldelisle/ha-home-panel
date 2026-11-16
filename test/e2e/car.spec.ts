// The Car tab (spec 21, #251): <hp-car-pane> and <hp-car-card>. On a phone the pane is the header with the car's name and its summary line and the card, which opens the
// detail; on a tablet it draws nothing of its own and the tab is the legacy detail, inline, until #252. The test house has a car at 64 percent with 280 km of range, locked
// and charging, a limit of 90 percent, and a Wallbox that says Charging.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, phoneOnly, tabletOnly, type House} from './fixtures';
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
    await expect(pane(house).locator('hp-pane-header h2')).toHaveText('Car');
    await expect(pane(house).locator('hp-pane-header [slot="sub"]')).toHaveText(
      'Parked at home · 64.0% · 280 km · charging',
    );
    await expect(card(house).locator('.clbl')).toHaveText('Car');
    await expect(card(house).locator('.cright')).toHaveText('Parked at home›');
    await expect(card(house).locator('.hero .v')).toHaveText('64.0%');
    await expect(card(house).locator('.cline')).toHaveText('280 km range · locked · charging');
    await expect(card(house).locator('.cbar')).toHaveAttribute(
      'aria-label',
      'Battery 64.0 percent, charge limit 90 percent',
    );
    await expect(card(house).locator('.cscale')).toHaveText('0%Limit 90%');
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

  test('a tap on the card, and Enter on it, open the detail, the legacy sheet over the page', async ({house}) => {
    await house.tab('car');
    const sheet = house.root().locator('#sh-car');
    await expect(sheet).toBeHidden();
    await card(house).locator('.box').click();
    await expect(sheet).toBeVisible();
    await sheet.locator('.close').click();
    await expect(sheet).toBeHidden();
    await card(house).locator('.box').focus();
    await house.page.keyboard.press('Enter');
    await expect(sheet).toBeVisible();
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
    await expect(card(house).locator('img.cimg')).toHaveCount(0);
    // Home Assistant sends the picture again at another address: the broken one is not retried, nor is the new one
    await house.setState(PICTURE, {state: 'unknown', attributes: {entity_picture: '/missing/second.png'}});
    await house.page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await house.page.waitForTimeout(250);
    expect(asked, 'the pictures asked for').toEqual(['/missing/first.png']);
    await expect(card(house).locator('img.cimg')).toHaveCount(0);
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

  test('the tab is the legacy detail, inline: the pane draws no header and no card', async ({house}) => {
    await house.tab('car');
    await expect(house.root().locator('#pane-car > .panel')).toBeVisible();
    await expect(pane(house).locator('hp-pane-header, hp-car-card')).toHaveCount(0);
  });

  test('the pane asks for no window of its own: the pane draws nothing from the history, so the days are not read', async ({
    house,
  }) => {
    await house.tab('car');
    await house.page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await house.page.waitForTimeout(250);
    // the Wallbox's year is the legacy panel's shared load, asked at start; the grid's and the charger's days only a pane that draws them asks
    await expect.poll(() => windowReads(house)).toEqual({hours: 1, days: 0});
  });
});
