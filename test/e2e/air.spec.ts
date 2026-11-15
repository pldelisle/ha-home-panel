// The Air tab (spec 18): <hp-air-pane> and <hp-air-card>. The card is the phone's, where a tap opens the detail's sheet; on a tablet the
// tab is the detail panel inline, still the legacy panel's until #233, and the pane draws nothing. The test house has one purifier
// in the office (Automagic at 40 %, PM2.5 moderate, Mila's index 68) and the outdoor station (US AQI 42).
import AxeBuilder from '@axe-core/playwright';
import {test, expect, phoneOnly, tabletOnly, type House} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});

const pane = (house: House) => house.root().locator('#pane-air hp-air-pane');
const card = (house: House) => pane(house).locator('hp-air-card');
const detail = (house: House) => house.root().locator('#sh-air');

// Air is under More on a phone
const openTab = async (house: House) => {
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="air"] button').click();
  await expect(house.root().locator('#pane-air')).toBeVisible();
};

test.describe('on a phone', () => {
  test.beforeEach(() => phoneOnly());

  test('the tab shows the house room with its metrics, the state line and the outside figure', async ({house}) => {
    await openTab(house);
    await expect(pane(house).locator('[slot="sub"]')).toHaveText('1 purifier · Moderate · Office: PM2.5 20');
    await expect(card(house).locator('.top .lbl')).toHaveText('Air quality');
    await expect(card(house).locator('.top .right')).toHaveText('Outside AQI 42 Good›');
    await expect(card(house).locator('.aqstate .state')).toHaveText('Moderate');
    await expect(card(house).locator('.aqstate .why')).toHaveText('Office: PM2.5 20');
    await expect(card(house).locator('.aqroom .n')).toHaveText('Office');
    await expect(card(house).locator('.aqm b')).toHaveText(['20', '640', '180']);
    await expect(card(house).locator('.aqm small')).toHaveText(['PM2.5', 'CO₂', 'VOC']);
    await expect(card(house).locator('.aqm .hi b')).toHaveText(['20']);
    await expect(card(house).locator('.aqroom .s')).toHaveText('Automagic · 40% · 38% RH');
  });

  test('a reading follows the entity, and the numbers are in the profile’s language: 1.5k and 1,5k', async ({
    house,
  }) => {
    await openTab(house);
    await house.setState('sensor.office_purifier_co2', {state: '1530'});
    await expect(card(house).locator('.aqm b').nth(1)).toHaveText('1.5k');
    await house.setLanguage('fr');
    await expect(card(house).locator('.aqm b').nth(1)).toHaveText('1,5k');
    await expect(card(house).locator('.top .lbl')).toHaveText("Qualité de l'air");
  });

  test('a purifier that is off the air says so on its line', async ({house}) => {
    await openTab(house);
    await house.setState('fan.office_purifier', {state: 'unavailable'});
    await expect(card(house).locator('.aqroom .s')).toHaveText('Purifier offline · 38% RH');
  });

  test('a tap on the card opens the detail sheet, and so do Enter and Space; Escape closes it', async ({house}) => {
    await openTab(house);
    const box = card(house).getByRole('button', {name: /Air quality/});
    await expect(box).toHaveAttribute('aria-description', 'Open air quality details');
    await expect(detail(house)).toBeHidden();
    await box.click();
    await expect(detail(house)).toBeVisible();
    await house.page.keyboard.press('Escape');
    await expect(detail(house)).toBeHidden();
    await box.focus();
    await house.page.keyboard.press('Enter');
    await expect(detail(house)).toBeVisible();
    await house.page.keyboard.press('Escape');
    await box.focus();
    await house.page.keyboard.press('Space');
    await expect(detail(house)).toBeVisible();
  });

  test('a thermostat change gives zero mutations in the pane and its card', async ({house}) => {
    await openTab(house);
    await expect(card(house).locator('.aqroom')).toHaveCount(1);
    await house.mutations.reset();
    await house.setState('climate.living_room', {attributes: {temperature: 23}});
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-air-pane, hp-air-card'), 'mutations').toBe(0);
  });

  test('the tab has no serious or critical accessibility finding', async ({house}) => {
    await openTab(house);
    await expect(card(house).locator('.aqroom')).toHaveCount(1);
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});

test.describe('in the bare house, on a phone', () => {
  test.use({houseOpts: {house: 'bare'}});
  test.beforeEach(() => phoneOnly());

  test('the card says there are no purifiers and the tab has nothing else to show', async ({house}) => {
    await openTab(house);
    await expect(pane(house).locator('[slot="sub"]')).toHaveText('No purifiers found');
    await expect(card(house).locator('.top')).toHaveText('Air qualityNo purifiers found');
    await expect(card(house).locator('.aqroom')).toHaveCount(0);
  });
});

test.describe('on a tablet', () => {
  test.beforeEach(() => tabletOnly());

  test('the tab is the legacy detail panel inline, and the pane draws no card of its own', async ({house}) => {
    await house.tab('air');
    await expect(house.root().locator('#pane-air .panel')).toBeVisible();
    await expect(house.root().locator('#pane-air .aqcard')).toHaveCount(1);
    await expect(card(house)).toHaveCount(0);
  });

  test('a thermostat change gives zero mutations in the pane', async ({house}) => {
    await house.tab('air');
    await house.mutations.reset();
    await house.setState('climate.living_room', {attributes: {temperature: 23}});
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-air-pane'), 'mutations').toBe(0);
  });
});
