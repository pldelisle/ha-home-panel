// The Weather detail (spec 15, pull request 2): `<hp-weather-detail>` inline in the pane on a tablet, `<hp-chart>` for its charts and
// `mountRadar` for the radar. What a person reads, and what the detail costs: each test proves a mechanism by what it saves or loads.
// The phone's sheet is in weather.spec.ts. Spec: docs/specs/15-weather.md, "The elements" and "Performance, by construction".
import {test, expect, tabletOnly, CHUNK_URL, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.beforeEach(() => tabletOnly());
test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});

const detail = (house: House) => house.root().locator('hp-weather-detail');
const canvases = (house: House) => detail(house).locator('hp-chart .apexcharts-canvas');
const STATISTICS = 'recorder/statistics_during_period';
// the weather entity's own reading shows in the detail's big figure
const entityId = 'weather.springfield_forecast';
const warmer = () => ({attributes: {temperature: 9.1}});
const RADAR_URL = '**/hacsfiles/weather-radar-card/weather-radar-card.js';

// the Weather Radar Card is a third party's element: this stand-in counts how often it is made and keeps the configuration it is given
const FAKE_CARD = `
  window.radar = {created: 0, configs: []};
  customElements.define('weather-radar-card', class extends HTMLElement {
    constructor() { super(); window.radar.created++; }
    setConfig(config) { window.radar.configs.push(config); }
    set hass(value) { this.seen = value; }
  });`;

async function toggleTheme(house: House) {
  await house.root().locator('#gear').click();
  await house.root().locator('hp-settings-popup').locator('[data-th="toggle"]').dispatchEvent('click');
}

test('the Weather tab shows the detail in its pane: the header, the sun block, the days and the three seven-day charts', async ({
  house,
}) => {
  await house.tab('weather');
  await expect(detail(house)).toBeVisible();
  await expect(detail(house).locator('hp-pane-header h2')).toHaveText('Weather');
  await expect(detail(house).locator('.wnow .num')).toHaveText('4.2°');
  await expect(detail(house).locator('.sunarc')).toBeVisible();
  await expect(detail(house).locator('.sunarc + .tiles .k')).toHaveText(['Sunrise', 'Solar noon', 'Sunset']);
  await expect(canvases(house)).toHaveCount(3);
  await expect(detail(house).locator('#wdays')).toHaveText('No daily forecast yet.');
});

test('a chart put back on the page draws again, whether the library came while it was away or not', async ({house}) => {
  // hold the library back, take a chart off the page, let the library through, and put the chart back
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await house.page.route(CHUNK_URL, async r => {
    await gate;
    await r.continue();
  });
  await house.tab('weather');
  await expect(detail(house).locator('hp-chart')).toHaveCount(3);
  await detail(house)
    .locator('hp-chart')
    .first()
    .evaluate(chart => {
      const w = window as unknown as {away: {chart: Element; parent: Node}};
      w.away = {chart, parent: chart.parentNode!};
      chart.remove();
    });
  release();
  await expect(canvases(house)).toHaveCount(2);
  await house.page.evaluate(() => {
    const {chart, parent} = (window as unknown as {away: {chart: Element; parent: Node}}).away;
    parent.appendChild(chart);
  });
  await expect(canvases(house)).toHaveCount(3);
  // and a chart that had drawn, taken off and put back
  await detail(house)
    .locator('hp-chart')
    .first()
    .evaluate(chart => {
      const parent = chart.parentNode!;
      chart.remove();
      parent.append(chart);
    });
  await expect(canvases(house)).toHaveCount(3);
});

test('a pane that is not the tab holds no detail, so no chart and no radar', async ({house}) => {
  await house.tab('weather');
  await expect(canvases(house)).toHaveCount(3);
  await house.tab('home');
  await expect(detail(house)).toHaveCount(0);
  await expect(house.root().locator('hp-chart')).toHaveCount(0);
});

test('opening the detail again within the hour asks the recorder once, and again when its statistics are fifteen minutes old', async ({
  house,
}) => {
  // the guest asks the recorder for its own charts: the detail's two calls are the ones that name the dew point and the gust
  const mine = async () =>
    (await house.asked(STATISTICS)).filter(m =>
      (m.statistic_ids as string[]).some(id =>
        ['sensor.springfield_dew_point', 'sensor.springfield_wind_gust'].includes(id),
      ),
    );
  await house.tab('weather');
  await expect(canvases(house)).toHaveCount(3);
  expect(
    (await mine()).map(m => m.period),
    'the hours of the week and the days of the season',
  ).toEqual(['hour', 'day']);
  await house.tab('home');
  await house.tab('weather');
  await expect(canvases(house)).toHaveCount(3);
  expect(await mine(), 'a second opening is the cache').toHaveLength(2);
  await house.clock.fastForward(16 * 60_000);
  await house.setState(entityId, warmer());
  await expect.poll(async () => (await mine()).length, 'older than the cache keeps them').toBe(4);
});

test("a change of the weather does not draw the charts again: the hours' points and the seven days are what they were", async ({
  house,
}) => {
  await house.tab('weather');
  const hours = Array.from({length: 24}, (_, i) => ({
    datetime: new Date(Date.parse('2026-11-07T18:00:00Z') + i * 36e5).toISOString(),
    condition: 'cloudy',
    temperature: 5 + (i % 5),
    precipitation_probability: 10,
  }));
  await house.page.evaluate(entries => window.house.forecast('hourly', entries), hours);
  await expect(canvases(house)).toHaveCount(4);
  await house.mutations.reset();
  await house.setState(entityId, warmer());
  await expect(detail(house).locator('.wnow .num')).toHaveText('9.1°');
  expect(await house.mutations.count('hp-chart'), 'mutations inside the charts').toBe(0);
});

test('a theme change draws the charts again with the new colours, and says nothing', async ({house}) => {
  await house.tab('weather');
  await expect(canvases(house)).toHaveCount(3);
  await canvases(house)
    .first()
    .evaluate(canvas => canvas.setAttribute('data-old', ''));
  await toggleTheme(house);
  await expect(house.root().locator('#app')).toHaveAttribute('data-theme', 'dark');
  await expect(detail(house).locator('.apexcharts-canvas[data-old]')).toHaveCount(0);
  await expect(canvases(house)).toHaveCount(3);
  await expect(house.root().locator('#toast')).toBeHidden();
});

test('a failed chunk load says so once for all the charts', async ({house}) => {
  await house.page.route(CHUNK_URL, r => r.abort());
  // the toast event, counted where it starts: the shell stops it at its frame
  await house.page.evaluate(() => {
    const w = window as unknown as {toasts: number};
    w.toasts = 0;
    document.addEventListener('toast', () => w.toasts++, true);
  });
  await house.tab('weather');
  await expect(house.root().locator('#toast')).toContainText('Charts library failed to load');
  expect(await house.page.evaluate(() => (window as unknown as {toasts: number}).toasts)).toBe(1);
  await expect(canvases(house)).toHaveCount(0);
});

test('a tile asks once for its history', async ({house}) => {
  await house.tab('weather');
  await house.page.evaluate(() => {
    const w = window as unknown as {requests: string[]};
    w.requests = [];
    document.addEventListener('sheet-request', e => w.requests.push(JSON.stringify((e as CustomEvent).detail)), true);
  });
  await detail(house).locator('button[data-wx="wind"]').click();
  await expect(house.root().locator('hp-weather-history hp-sheet h2')).toHaveText('Wind');
  expect(await house.page.evaluate(() => (window as unknown as {requests: string[]}).requests)).toEqual([
    '{"id":"weather.history","detail":{"key":"wind"}}',
  ]);
});

test.describe('the radar', () => {
  test('says it did not load, in the words of the catalog, when the card is not installed', async ({house}) => {
    await house.tab('weather');
    await expect(detail(house).locator('.radar .rnote')).toHaveText(
      "Weather Radar Card didn't load. Check that it is still installed in HACS.",
    );
  });

  test('is mounted once while the detail is shown, again only when the theme changes, and taken down with the detail', async ({
    house,
  }) => {
    await house.page.route(RADAR_URL, r => r.fulfill({contentType: 'text/javascript', body: FAKE_CARD}));
    await house.tab('weather');
    await expect(detail(house).locator('.radar weather-radar-card')).toHaveCount(1);
    await house.setState(entityId, warmer());
    await expect(detail(house).locator('.wnow .num')).toHaveText('9.1°');
    const radar = () =>
      house.page.evaluate(
        () => (window as unknown as {radar: {created: number; configs: {map_style: string}[]}}).radar,
      );
    expect((await radar()).created, 'a change of the weather leaves the map running').toBe(1);
    await toggleTheme(house);
    await expect.poll(async () => (await radar()).created).toBe(2);
    expect((await radar()).configs.map(c => c.map_style)).toEqual(['Grey', 'GreyDark']);
    await house.tab('home');
    await expect(house.root().locator('weather-radar-card')).toHaveCount(0);
  });
});

test.describe('in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, lang: 'fr'}});

  test('the detail is in French from its first paint, the radar note too', async ({house}) => {
    await house.tab('weather');
    await expect(detail(house).locator('.inner h3').first()).toHaveText('Soleil');
    await expect(detail(house).getByRole('heading', {name: 'Prochaines 24 heures'})).toBeVisible();
    await expect(detail(house).locator('.radar .rnote')).toHaveText(
      "Weather Radar Card ne s'est pas chargée. Vérifiez qu'elle est toujours installée dans HACS.",
    );
  });
});
