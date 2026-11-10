// The Weather pane (spec 15, pull request 1): `<hp-weather-pane>`, what a person reads and does on it, and what it costs the tablet.
// The pane draws the header, the summary card and the eight tiles on the phone; on a tablet it holds the detail panel's place, which the
// guest still draws. Spec: docs/specs/15-weather.md, "The elements" and "Performance, by construction".
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
    await expect(pane(house).locator('[slot="sub"]')).toHaveText(
      'Mainly sunny · observed 1:30 pm · pressure rising · no alerts',
    );
  });
});

test.describe('in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, lang: 'fr', time: AFTERNOON, frozen: true}});

  test('the sub-line, the card and the tiles are in French from the first paint', async ({house}) => {
    await openWeather(house);
    await expect(pane(house).locator('[slot="sub"]')).toHaveText(
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

test('a tile opens its history sheet with its title, and Escape closes it', async ({house}) => {
  await openWeather(house);
  await tiles(house).nth(0).locator('button').click();
  await expect(house.root().locator('#sh-wx')).toBeVisible();
  await expect(house.root().locator('#sh-wx #wxh')).toHaveText('Wind');
  await house.page.keyboard.press('Escape');
  await expect(house.root().locator('#sh-wx')).toBeHidden();
});

test('the summary card opens the detail sheet by a tap and by the keyboard', async ({house}) => {
  await openWeather(house);
  await pane(house).locator('.wxcard').click();
  await expect(house.root().locator('#sh-weather')).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(house.root().locator('#sh-weather')).toBeHidden();
  await pane(house).locator('.wxcard').focus();
  await house.page.keyboard.press('Enter');
  await expect(house.root().locator('#sh-weather')).toBeVisible();
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
