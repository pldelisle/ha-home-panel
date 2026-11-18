// The Weather pane (spec 15): `<hp-weather-pane>` on the phone, what a person reads and does on it, and what it costs. The pane draws the
// header and the whole detail inline, as a tablet's does (weather-detail.spec.ts); Home's card and the stack's cards switch to the tab.
// Spec: docs/specs/15-weather.md, "The elements" and "Performance, by construction".
import {test, expect, phoneOnly, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});
test.beforeEach(() => phoneOnly());

const pane = (house: House) => house.root().locator('hp-weather-pane');
const detail = (house: House) => pane(house).locator('hp-weather-detail');
const tiles = (house: House) => detail(house).locator('button.tilebtn');
// the weather entity's own reading comes first, then the outdoor sensor
const entityId = 'weather.springfield_forecast';
const warmer = () => ({attributes: {temperature: 9.1}});

// More holds Weather on the phone
async function openWeather(house: House) {
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="weather"] button').click();
  await expect(house.root().locator('#pane-weather')).toBeVisible();
}

test('the Weather tab shows the forecast, the sun and the radar in the tab, with no sheet', async ({house}) => {
  await openWeather(house);
  await expect(detail(house).locator('.wnow .num')).toHaveText('4.2°');
  await expect(detail(house).locator('.sunarc')).toBeVisible();
  await expect(detail(house).locator('.sunarc + .tiles .k')).toHaveText(['Sunrise', 'Solar noon', 'Sunset']);
  await expect(detail(house).locator('.radar')).toBeVisible();
  await expect(detail(house).locator('#wdays')).toBeVisible();
  await expect(pane(house).locator('hp-sheet')).toHaveCount(0);
  await expect(pane(house).locator('.wxcard, hp-stat-tile')).toHaveCount(0);
});

test("the Weather tab's eight tiles are the detail's, with the house's readings, and each opens its history", async ({
  house,
}) => {
  await openWeather(house);
  await expect(tiles(house)).toHaveCount(8);
  await expect(tiles(house).locator('.k')).toHaveText([
    'Wind',
    'Humidity',
    'Pressure',
    'Rain or snow',
    'UV index',
    'Air quality',
    'Feels like',
    'Normal',
  ]);
  await expect(tiles(house).locator('.v')).toHaveText([
    '14km/h',
    '71%',
    '101.9kPa',
    'No reading',
    '1',
    '2',
    '4.2°',
    '6° / -2°',
  ]);
  await tiles(house).first().click();
  await expect(house.root().locator('hp-weather-history hp-sheet h2')).toHaveText('Wind');
});

test.describe('the bare house', () => {
  test.use({houseOpts: {house: 'bare'}});

  test('has only a weather entity: it shows what the entity knows, the air for feels like, and "No reading" for the rest', async ({
    house,
  }) => {
    await openWeather(house);
    await expect(tiles(house).locator('.v')).toHaveText([
      '14km/h',
      '71%',
      '101.9kPa',
      'No reading',
      'No reading',
      'No reading',
      '4.2°',
      'No reading',
    ]);
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

  test('the sub-line, the big reading and the tiles are in French from the first paint', async ({house}) => {
    await openWeather(house);
    await expect(pane(house).locator('[slot="sub"]').first()).toHaveText(
      'Généralement ensoleillé · observé à 13 h 30 · pression en hausse · aucune alerte',
    );
    await expect(detail(house).locator('.wnow')).toContainText('Généralement ensoleillé');
    await expect(tiles(house).locator('.k').first()).toHaveText('Vent');
    await expect(tiles(house).locator('.v').nth(2)).toHaveText('101,9kPa');
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

  test('a forecast message shows the days in the tab', async ({house}) => {
    await openWeather(house);
    await expect(detail(house).locator('.drow')).toHaveCount(0);
    await house.page.evaluate(entries => window.house.forecast('daily', entries), days);
    await expect(detail(house).locator('.drow')).toHaveCount(5);
    await expect(detail(house).locator('.drow .dn')).toHaveText([
      'Today',
      'Tomorrow',
      'Monday',
      'Tuesday',
      'Wednesday',
    ]);
    await expect(detail(house).locator('.drow .dh')).toHaveText(['8°', '9°', '10°', '11°', '12°']);
  });

  test('a forecast a day later keeps the nodes of the days it still has (the days are keyed)', async ({house}) => {
    await openWeather(house);
    await house.page.evaluate(entries => window.house.forecast('daily', entries), days);
    await expect(detail(house).locator('.drow')).toHaveCount(5);
    // mark the five nodes, then let a day go by in the forecast: the second to the fifth are now the first to the fourth
    await detail(house)
      .locator('.drow')
      .evaluateAll(nodes => nodes.forEach((node, i) => ((node as HTMLElement & {mark?: number}).mark = i)));
    const later = [
      ...days.slice(1),
      {datetime: '2026-11-12T17:00:00Z', condition: 'cloudy', temperature: 13, templow: 3},
    ];
    await house.page.evaluate(entries => window.house.forecast('daily', entries), later);
    await expect(detail(house).locator('.drow .dn')).toHaveText([
      'Tomorrow',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
    ]);
    const marks = await detail(house)
      .locator('.drow')
      .evaluateAll(nodes => nodes.map(node => (node as HTMLElement & {mark?: number}).mark));
    expect(marks).toEqual([1, 2, 3, 4, undefined]);
  });

  test('the pane holds the one pair of forecast subscriptions, and the guest none of its own', async ({house}) => {
    await openWeather(house);
    expect(await house.subscribed('weather/subscribe_forecast')).toBe(2);
  });
});

// Home's card leaves Home: it switches to the Weather tab (More's Weather tile shows as the current section), with no sheet
test('the Home card opens the Weather tab, and More shows it as the current section', async ({house}) => {
  const card = house.root().locator('#hwx');
  await expect(house.root().locator('#pane-home')).toBeVisible();
  await card.click();
  await expect(house.root().locator('#pane-weather')).toBeVisible();
  await expect(house.root().locator('#pane-home')).toBeHidden();
  await expect(detail(house).locator('.sunarc')).toBeVisible();
  await expect(house.root().locator('hp-sheet[open]')).toHaveCount(0);
  await expect(house.root().locator('#moretab')).toHaveAttribute('aria-selected', 'true');
  await house.root().locator('#moretab').click();
  await expect(house.root().locator('#morelist hp-stat-tile[key="weather"] button')).toHaveClass(/\bsel\b/);
});

test.describe('the phone hero', () => {
  test.use({
    houseOpts: {cfg: {...FULL_CFG, house_image: {day: '/day.png', night: '/night.png'}}, time: AFTERNOON, frozen: true},
  });

  test("shows the config's house picture under the big reading, as Home's card does", async ({house}) => {
    await openWeather(house);
    await expect(detail(house).locator('.whouse .house.day')).toHaveAttribute('src', '/day.png');
    await expect(detail(house).locator('.whouse .house.night')).toBeHidden();
  });
});

test.describe('the phone layout at 393 px', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T17:00:00Z', frozen: true, forecast: true, lang: 'fr'}});

  test('cuts no day name in French, and puts the tiles in one column at Larger text', async ({house}) => {
    await openWeather(house);
    const cut = await detail(house)
      .locator('.drow .dn')
      .evaluateAll(names => names.filter(n => n.scrollWidth > n.clientWidth).map(n => n.textContent));
    expect(cut).toEqual([]);
    const columns = () =>
      detail(house)
        .locator('.wnow ~ .tiles')
        .evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(await columns()).toBe(2);
    await house.root().locator('#gear').click();
    await house.root().locator('hp-settings-popup [data-tx="larger"]').dispatchEvent('click');
    await expect.poll(columns).toBe(1);
    const cutLarger = await detail(house)
      .locator('.drow .dn')
      .evaluateAll(names => names.filter(n => n.scrollWidth > n.clientWidth).map(n => n.textContent));
    expect(cutLarger, 'at Larger text').toEqual([]);
  });
});

test.describe('what it costs', () => {
  test('a change of the temperature of the weather entity reaches the pane and shows', async ({house}) => {
    await openWeather(house);
    await expect(detail(house).locator('.wnow .num')).toHaveText('4.2°');
    await house.setState(entityId, warmer());
    await expect(detail(house).locator('.wnow .num')).toHaveText('9.1°');
  });

  // a paused pane is not told: without the pause its update would draw the new reading while the tab is hidden
  test('a pane on another tab is not told of its entities, and is current when it comes back', async ({house}) => {
    await openWeather(house);
    await expect(detail(house).locator('.wnow .num')).toHaveText('4.2°');
    await house.tab('home');
    await house.mutations.reset();
    await house.setState(entityId, warmer());
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-weather-pane'), 'while away').toBe(0);
    await openWeather(house);
    await expect(detail(house).locator('.wnow .num')).toHaveText('9.1°');
  });
});
