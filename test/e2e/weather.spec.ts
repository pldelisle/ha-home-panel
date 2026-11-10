// The Weather pane (spec 15): `<hp-weather-pane>` on the phone, what a person reads and does on it, and what it costs. The pane draws the
// header, the summary card and the eight tiles, and the detail in a sheet; on a tablet it holds the detail inline (weather-detail.spec.ts).
// Spec: docs/specs/15-weather.md, "The elements" and "Performance, by construction".
import {test, expect, phoneOnly, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});
test.beforeEach(() => phoneOnly());

const pane = (house: House) => house.root().locator('hp-weather-pane');
const tiles = (house: House) => pane(house).locator('hp-stat-tile');
// the weather entity's own reading comes first, then the outdoor sensor
const entityId = 'weather.springfield_forecast';
const warmer = () => ({attributes: {temperature: 9.1}});

// More holds Weather on the phone
async function openWeather(house: House) {
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="weather"] button').click();
  await expect(house.root().locator('#pane-weather')).toBeVisible();
}

test("the Weather tab shows the eight tiles with the house's readings", async ({house}) => {
  await openWeather(house);
  await expect(tiles(house)).toHaveCount(8);
  await expect(tiles(house).locator('.tx b')).toHaveText([
    'Wind',
    'Humidity',
    'Feels like',
    'Pressure',
    'UV index',
    'Air quality',
    'Rain or snow',
    'Normal',
  ]);
  await expect(tiles(house).locator('.tv')).toHaveText([
    '14 km/h',
    '71%',
    '4°',
    '101.9 kPa',
    '1',
    '2',
    '–',
    '6° / -2°',
  ]);
});

test.describe('the bare house', () => {
  test.use({houseOpts: {house: 'bare'}});

  test('has only a weather entity: it shows what the entity knows, the air for feels like, and a dash for the rest', async ({
    house,
  }) => {
    await openWeather(house);
    await expect(tiles(house).locator('.tv')).toHaveText(['14 km/h', '71%', '4°', '101.9 kPa', '–', '–', '–', '–']);
  });
});

test.describe('in English', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});

  test('the sub-line says the condition, the observation, the pressure and the alerts', async ({house}) => {
    await openWeather(house);
    await expect(pane(house).locator('[slot="sub"]').first()).toHaveText(
      'Mainly sunny · observed 1:30 pm · pressure rising · no alerts',
    );
  });
});

test.describe('in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, lang: 'fr', time: AFTERNOON, frozen: true}});

  test('the sub-line, the card and the tiles are in French from the first paint', async ({house}) => {
    await openWeather(house);
    await expect(pane(house).locator('[slot="sub"]').first()).toHaveText(
      'Généralement ensoleillé · observé à 13 h 30 · pression en hausse · aucune alerte',
    );
    await expect(pane(house).locator('.wxcond')).toHaveText('Généralement ensoleillé');
    await expect(tiles(house).locator('.tx b').first()).toHaveText('Vent');
    await expect(tiles(house).locator('.tv').nth(3)).toHaveText('101,9 kPa');
  });
});

test.describe('with a forecast', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T17:00:00Z', frozen: true}});

  const days = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'].map((day, i) => ({
    datetime: `${day}T17:00:00Z`,
    condition: 'cloudy',
    temperature: 8 + i,
    templow: i - 2,
  }));

  test('a forecast message shows four days on the card', async ({house}) => {
    await openWeather(house);
    await expect(pane(house).locator('.wxd > div')).toHaveCount(0);
    await house.page.evaluate(entries => window.house.forecast('daily', entries), days);
    await expect(pane(house).locator('.wxd > div')).toHaveCount(4);
    await expect(pane(house).locator('.wxd > div > span')).toHaveText(['Today', 'Sun', 'Mon', 'Tue']);
    await expect(pane(house).locator('.wxd > div > b')).toHaveText(['8°', '9°', '10°', '11°']);
  });

  test('a forecast a day later keeps the nodes of the days it still has (the days are keyed)', async ({house}) => {
    await openWeather(house);
    await house.page.evaluate(entries => window.house.forecast('daily', entries), days);
    await expect(pane(house).locator('.wxd > div')).toHaveCount(4);
    // mark the four nodes, then let a day go by in the forecast: the second, third and fourth are now the first, second and third
    await pane(house)
      .locator('.wxd > div')
      .evaluateAll(nodes => nodes.forEach((node, i) => ((node as HTMLElement & {mark?: number}).mark = i)));
    await house.page.evaluate(entries => window.house.forecast('daily', entries), days.slice(1));
    await expect(pane(house).locator('.wxd > div > span')).toHaveText(['Sun', 'Mon', 'Tue', 'Wed']);
    const marks = await pane(house)
      .locator('.wxd > div')
      .evaluateAll(nodes => nodes.map(node => (node as HTMLElement & {mark?: number}).mark));
    expect(marks).toEqual([1, 2, 3, undefined]);
  });

  test('the pane holds the one pair of forecast subscriptions, and the guest none of its own', async ({house}) => {
    await openWeather(house);
    expect(await house.subscribed('weather/subscribe_forecast')).toBe(2);
  });
});

const detail = (house: House) => pane(house).locator('hp-weather-detail');
const sheet = (house: House) => pane(house).locator('hp-sheet');

test('the summary card opens the detail in a sheet by a tap and by the keyboard, and Escape closes it', async ({
  house,
}) => {
  await openWeather(house);
  await expect(detail(house)).toHaveCount(0);
  await pane(house).locator('.wxcard').click();
  await expect(sheet(house)).toHaveAttribute('open', '');
  await expect(detail(house)).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(detail(house)).toHaveCount(0);
  await pane(house).locator('.wxcard').focus();
  await house.page.keyboard.press('Enter');
  await expect(detail(house)).toBeVisible();
});

test('the detail on the phone shows the sun block, and its Close button closes it', async ({house}) => {
  await openWeather(house);
  await pane(house).locator('.wxcard').click();
  await expect(detail(house).locator('.sunarc')).toBeVisible();
  await expect(detail(house).locator('.sunarc + .tiles .k')).toHaveText(['Sunrise', 'Solar noon', 'Sunset']);
  await sheet(house).locator('.close').click();
  await expect(detail(house)).toHaveCount(0);
});

test('the Home card opens the detail over Home: Home stays the tab, a reload returns on Home, and Escape gives the focus back to the card', async ({
  house,
}) => {
  const card = house.root().locator('#hwx');
  await expect(house.root().locator('#pane-home')).toBeVisible();
  await card.click();
  await expect(detail(house)).toBeVisible();
  await expect(house.root().locator('#pane-home')).toBeVisible();
  await expect(house.root().locator('#pane-weather')).toBeHidden();
  expect(await house.page.evaluate(() => localStorage.getItem('home-panel-tab'))).not.toBe('weather');
  await house.page.reload();
  await expect(house.root().locator('#pane-home')).toBeVisible();
  await expect(house.root().locator('#pane-weather')).toBeHidden();
  await card.click();
  await expect(detail(house)).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(detail(house)).toHaveCount(0);
  await expect(card).toBeFocused();
});

// the detail over Home has tiles of its own, and one of them opens a history: the pane stays behind both and Home stays the tab
test("a tile of the detail opened from Home's card opens its history over Home, and Escape closes it", async ({
  house,
}) => {
  await house.root().locator('#hwx').click();
  await detail(house).locator('button[data-wx="wind"]').click();
  await expect(house.root().locator('hp-weather-history hp-sheet h2')).toHaveText('Wind');
  await expect(detail(house)).toHaveCount(0);
  await expect(house.root().locator('#pane-home')).toBeVisible();
  await expect(house.root().locator('#pane-weather')).toBeHidden();
  await house.page.keyboard.press('Escape');
  await expect(house.root().locator('hp-weather-history')).toHaveCount(0);
  await expect(house.root().locator('#pane-home')).toBeVisible();
});

test.describe('what it costs', () => {
  test('a change of the temperature of the weather entity reaches the pane and shows', async ({house}) => {
    await openWeather(house);
    await expect(pane(house).locator('.wxtemp')).toHaveText('4.2°');
    await house.setState(entityId, warmer());
    await expect(pane(house).locator('.wxtemp')).toHaveText('9.1°');
  });

  // a paused pane is not told: without the pause its update would draw the new reading while the tab is hidden
  test('a pane on another tab is not told of its entities, and is current when it comes back', async ({house}) => {
    await openWeather(house);
    await expect(pane(house).locator('.wxtemp')).toHaveText('4.2°');
    await house.tab('home');
    await house.mutations.reset();
    await house.setState(entityId, warmer());
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-weather-pane'), 'while away').toBe(0);
    await openWeather(house);
    await expect(pane(house).locator('.wxtemp')).toHaveText('9.1°');
  });
});
