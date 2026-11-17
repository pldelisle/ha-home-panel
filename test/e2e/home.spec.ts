// The Home pane as the shell's composition (spec 24, #268): the six tiles read the house, a tile shows its tab on a tablet and opens
// its sheet on a phone, the Security card and the scenes row are in place, each card listens to its own ids, and axe finds nothing.
// The test house is driven through its states, never the elements.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, phoneOnly, tabletOnly, type House} from './fixtures';
import {FULL_CFG} from './houses';

const tiles = (house: House) => house.root().locator('#htiles hp-glance-tile');
const tile = (house: House, key: string) =>
  house.root().locator(`#htiles hp-glance-tile[data-key="${key}"] button.htile`);
// the house with every subject, so all six tiles show
test.use({houseOpts: {cfg: FULL_CFG}});

const nextFrames = (house: House) =>
  house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

test.describe('the tiles', () => {
  test('are the six subjects in order, each with its figure', async ({house}) => {
    await house.tab('home');
    await expect(tiles(house).locator('.lbl')).toHaveText([
      'Lights',
      'Climate',
      'Car',
      'Energy',
      'Air',
      'Water heater',
    ]);
    await house.setState('sensor.fordpass_test_soc', {state: '64'});
    await expect(tile(house, 'car').locator('.hv')).toHaveText('64.0%');
  });

  test('a thermostat change draws the Climate tile again and nothing else in the pane', async ({house}) => {
    await house.tab('home');
    const before = await tile(house, 'climate').locator('.hv').textContent();
    await house.mutations.reset();
    await house.setState('climate.living_room', {attributes: {current_temperature: 30}});
    await expect(tile(house, 'climate').locator('.hv')).not.toHaveText(before ?? '');
    await nextFrames(house);
    expect(await house.mutations.count('hp-glance-tile[data-key="climate"]'), 'the Climate tile').toBeGreaterThan(0);
    const others =
      'hp-glance-tile:not([data-key="climate"]), hp-weather-card, hp-who-card, hp-security-card, hp-scene-tiles';
    expect(await house.mutations.count(others), 'the rest of the pane').toBe(0);
  });

  test('has no serious or critical accessibility finding', async ({house}) => {
    await house.tab('home');
    await expect(tiles(house)).toHaveCount(6);
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

test.describe('on a tablet', () => {
  test.beforeEach(() => tabletOnly());

  test('a tile shows its tab', async ({house}) => {
    await house.tab('home');
    await tile(house, 'climate').click();
    await expect(house.root().locator('#pane-climate')).toBeVisible();
    await house.tab('home');
    await tile(house, 'car').click();
    await expect(house.root().locator('#pane-car')).toBeVisible();
  });

  test('the Home card holds the weather, Who’s home and the stack, and the Security card and the scenes are in place', async ({
    house,
  }) => {
    await house.tab('home');
    const card = house.root().locator('#pane-home #hwx');
    await expect(card.locator('hp-weather-card .hbig .num')).toBeVisible();
    await expect(card.locator('hp-who-card')).toBeAttached();
    await expect(card.locator('#hstk hp-smart-stack[mode="home"]')).toBeAttached();
    await expect(house.root().locator('#pane-home .hright #hsec hp-security-card .seccard')).toBeVisible();
    await expect(house.root().locator('#pane-home #hscenes hp-scene-tiles')).toBeAttached();
    await expect(house.root().locator('#pane-home #hscenes')).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.beforeEach(() => phoneOnly());

  test('the Car tile opens the car sheet, and the tab stays Home', async ({house}) => {
    await house.tab('home');
    await tile(house, 'car').click();
    await expect(house.root().locator('hp-car-pane hp-sheet hp-car-detail')).toBeVisible();
    await expect(house.root().locator('#pane-home')).toBeVisible();
  });

  test('the Lights tile, which has no sheet, shows its tab', async ({house}) => {
    await house.tab('home');
    await tile(house, 'lights').click();
    await expect(house.root().locator('#pane-lights')).toBeVisible();
  });

  test('the Home card opens the weather detail, and has no stack', async ({house}) => {
    await house.tab('home');
    const card = house.root().locator('#pane-home #hwx');
    await expect(card.locator('#hstk')).toHaveCount(0);
    await card.click();
    await expect(house.root().locator('hp-weather-detail')).toBeVisible();
  });
});
