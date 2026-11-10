// A Weather tile's history (spec 15, pull request 3): `<hp-weather-history>` over the screen, on the phone from a pane tile and on a tablet
// from a tile of the detail. What a person reads and does in it, and what it costs: each test proves a mechanism by what it saves or sends.
// Spec: docs/specs/15-weather.md, "The elements" (`<hp-weather-history>`) and "Performance, by construction".
import {test, expect, isPhone, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

const STATISTICS = 'recorder/statistics_during_period';
const history = (house: House) => house.root().locator('hp-weather-history');
const tab = (house: House, name: string) => history(house).locator('[role="tab"]', {hasText: name});

// the Wind tile: the pane's on the phone, the detail's button on a tablet; the phone's Weather tab sits under More
const windTile = (house: House) =>
  isPhone(house)
    ? house.root().locator('hp-weather-pane hp-stat-tile[key="wind"] button')
    : house.root().locator('hp-weather-detail button[data-wx="wind"]');

async function openWind(house: House) {
  if (isPhone(house)) {
    await house.root().locator('#moretab').click();
    await house.root().locator('#morelist hp-stat-tile[key="weather"] button').click();
    await expect(house.root().locator('#pane-weather')).toBeVisible();
  } else await house.tab('weather');
  await windTile(house).click();
  await expect(history(house).locator('hp-sheet .sheet')).toBeVisible();
}

// the history's own requests: the ones that name the wind and the gust, and no more (the detail's name the wind among six, and the gust with the air)
const mine = async (house: House) =>
  (await house.asked(STATISTICS)).filter(m => {
    const ids = m.statistic_ids as string[];
    return ids.length === 2 && ids.includes('sensor.springfield_wind_speed');
  });

test('a tile opens its history: the title, the four tabs with the week chosen, the chart and the low, mean and high of each line', async ({
  house,
}) => {
  await openWind(house);
  await expect(history(house).locator('hp-sheet h2')).toHaveText('Wind');
  await expect(history(house).locator('hp-sheet > [slot="sub"]')).toHaveText('Environment Canada, hourly observations');
  await expect(history(house).locator('[role="tablist"]')).toHaveCount(1);
  await expect(history(house).locator('[role="tab"]')).toHaveText(['Day', 'Week', 'Month', 'Year']);
  await expect(history(house).locator('[role="tab"][aria-selected="true"]')).toHaveText('Week');
  await expect(history(house).locator('.inner h3').first()).toHaveText('Wind, last 7 days');
  await expect(history(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
  await expect(history(house).locator('.legend span')).toHaveText(['Wind', 'Gusts']);
  await expect(history(house).locator('.tiles .k')).toHaveText([
    'Wind · low',
    'Wind · mean',
    'Wind · high',
    'Gusts · low',
    'Gusts · mean',
    'Gusts · high',
  ]);
});

test('a range is read from the recorder once: Month asks, going back to Week is the cache, and the chart library came once', async ({
  house,
}) => {
  await openWind(house);
  await expect(history(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
  expect((await mine(house)).map(m => m.period)).toEqual(['hour']);
  // the keyboard chooses a tab as a click does
  await tab(house, 'Month').focus();
  await house.page.keyboard.press('Enter');
  await expect(history(house).locator('[role="tab"][aria-selected="true"]')).toHaveText('Month');
  await expect(history(house).locator('.inner h3').first()).toHaveText('Wind, last 30 days');
  await expect.poll(async () => (await mine(house)).length).toBe(2);
  await tab(house, 'Week').click();
  await expect(history(house).locator('.inner h3').first()).toHaveText('Wind, last 7 days');
  await expect(history(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
  expect((await mine(house)).length, 'the week again').toBe(2);
  expect(house.chunkRequests, 'the chart library').toHaveLength(1);
});

test('closing it frees the chart, and each closing, opening and range is one notification', async ({house}) => {
  await house.page.evaluate(() => {
    const w = window as unknown as {heard: string[]};
    w.heard = [];
    for (const type of ['sheet-request', 'sheet-dismiss', 'toast'])
      document.addEventListener(type, e => w.heard.push(`${type} ${JSON.stringify((e as CustomEvent).detail)}`), true);
  });
  await openWind(house);
  await expect(history(house).locator('hp-chart .apexcharts-canvas')).toBeVisible();
  await history(house).locator('hp-sheet .close').click();
  await expect(history(house)).toHaveCount(0);
  expect(await house.page.evaluate(() => (window as unknown as {heard: string[]}).heard)).toEqual([
    'sheet-request {"id":"weather.history","detail":{"key":"wind"}}',
    'sheet-dismiss {"id":"weather.history"}',
  ]);
});

test('Escape closes it and gives the focus back to the tile that opened it', async ({house}) => {
  await openWind(house);
  await house.page.keyboard.press('Escape');
  await expect(history(house)).toHaveCount(0);
  await expect(windTile(house)).toBeFocused();
});

test.describe('a house that has no wind sensor', () => {
  test.use({houseOpts: {house: 'bare', time: AFTERNOON, frozen: true}});

  test('says the sensor is not there, and asks the recorder for nothing', async ({house}) => {
    await openWind(house);
    await expect(history(house).locator('.inner').first()).toContainText(
      'That sensor is not in Home Assistant right now.',
    );
    await expect(history(house).locator('hp-chart')).toHaveCount(0);
    expect(await mine(house)).toEqual([]);
  });
});
