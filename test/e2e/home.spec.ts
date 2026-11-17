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

test('a tile is named without the "›" read aloud', async ({house}) => {
  await house.tab('home');
  await expect(tile(house, 'lights').locator('.go')).toHaveAttribute('aria-hidden', 'true');
  await expect(
    house
      .root()
      .locator('#htiles')
      .getByRole('button', {name: /^Lights\W*4 on/}),
  ).toBeVisible();
});

test('a tile’s chevron is a plain trailing "›" in the tertiary colour, with no box of its own', async ({house}) => {
  await house.tab('home');
  const chevron = await tile(house, 'lights')
    .locator('.go')
    .evaluate(el => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--fg3)';
      el.parentElement!.append(probe);
      const tertiary = getComputedStyle(probe).color;
      probe.remove();
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        shadow: s.boxShadow,
        radius: s.borderTopLeftRadius,
        color: s.color,
        tertiary,
      };
    });
  expect(chevron.background).toBe('rgba(0, 0, 0, 0)');
  expect(chevron.shadow).toBe('none');
  expect(chevron.radius).toBe('0px');
  expect(chevron.color).toBe(chevron.tertiary);
});

test('the Security card’s chevron is a plain trailing "›" in the tertiary colour too, with no box', async ({house}) => {
  await house.tab('home');
  const chevron = house.root().locator('#hsec hp-security-card .hh .chev');
  await expect(chevron).toBeVisible();
  await expect(chevron).toHaveText('›');
  await expect(chevron).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(chevron).toHaveCSS('box-shadow', 'none');
  await expect(chevron).toHaveCSS('border-top-left-radius', '0px');
  const [color, tertiary] = await chevron.evaluate(el => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--fg3)';
    el.parentElement!.append(probe);
    const tertiary = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(el).color, tertiary];
  });
  expect(color).toBe(tertiary);
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

  test('each subject is its own card: the weather, Who’s home and the stack; the Security card and the scenes are in place', async ({
    house,
  }) => {
    await house.tab('home');
    const weather = house.root().locator('#pane-home #hwx');
    await expect(weather.locator('hp-weather-card .hbig .num')).toBeVisible();
    await expect(
      weather.locator('hp-who-card, hp-smart-stack, #hstk'),
      'the weather card is only the weather',
    ).toHaveCount(0);
    await expect(house.root().locator('#pane-home #hwho.card hp-who-card')).toBeAttached();
    await expect(house.root().locator('#pane-home #hstk hp-smart-stack[mode="home"]')).toBeAttached();
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

  test('the Home card is one button named for the weather and where it leads', async ({house}) => {
    await house.tab('home');
    await expect(
      house.root().locator('#pane-home').getByRole('button', {name: 'Weather: 4°, mainly sunny. Opens the forecast'}),
    ).toBeVisible();
  });

  test('the weather card opens the weather detail, holds only the weather, and Who’s home is its own card', async ({
    house,
  }) => {
    await house.tab('home');
    const card = house.root().locator('#pane-home #hwx');
    await expect(card.locator('#hstk, hp-who-card')).toHaveCount(0);
    await expect(house.root().locator('#pane-home #hwho.card hp-who-card')).toBeAttached();
    await expect(house.root().locator('#pane-home #hstk')).toHaveCount(0);
    await card.click();
    await expect(house.root().locator('hp-weather-detail')).toBeVisible();
  });
});

test.describe('a car that reports after the first load', () => {
  test.use({houseOpts: {house: 'bare'}});

  test('gets its tile when its sensor appears', async ({house}) => {
    await house.tab('home');
    await expect(tile(house, 'car')).toHaveCount(0);
    await house.setState('sensor.fordpass_test_soc', {state: '50'});
    await expect(tile(house, 'car').locator('.hv')).toHaveText('50.0%');
  });
});
