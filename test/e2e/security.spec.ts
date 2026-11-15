// The Security tab (spec 17): <hp-security-pane> on the tablet, its cameras' card and its doors-and-motion card, what a tap opens (the
// legacy sheets, until #225), and what the pane costs. The test house has a door and a motion sensor and no camera: each test that
// needs one adds it the way Home Assistant adds any entity. The camera's picture is a Home Assistant proxy URL the harness never
// serves, so a tile with one shows a broken image, as the legacy panel's did; the tests read its `src`, not its pixels.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, tabletOnly, type House} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-10T12:00:00Z'}});
test.beforeEach(() => tabletOnly());

const PORCH = 'camera.porch';
const PICTURE = '/api/camera_proxy/camera.porch?token=x';

const pane = (house: House) => house.root().locator('#pane-cams hp-security-pane');
const cameras = (house: House) => pane(house).locator('hp-camera-card');
const sensors = (house: House) => pane(house).locator('hp-sensor-card');

const addPorch = (house: House) =>
  house.setState(PORCH, {
    state: 'idle',
    attributes: {friendly_name: 'Porch', attribution: 'UniFi Protect', entity_picture: PICTURE},
  });

const stampOf = async (house: House) => {
  const src = await cameras(house).locator('.cam img').getAttribute('src');
  return Number(/[?&]t=(\d+)$/.exec(src ?? '')?.[1]);
};

test('the tab shows the house cameras and sensors, doors first, under the summary line', async ({house}) => {
  await addPorch(house);
  await house.tab('cams');
  await expect(pane(house).locator('[slot="sub"]')).toHaveText('1 camera · all doors closed · motion now');
  await expect(cameras(house).locator('.lbl')).toHaveText('Cameras');
  await expect(cameras(house).locator('.right')).toHaveText('1 camera');
  await expect(cameras(house).locator('.camlbl b')).toHaveText(['Porch']);
  await expect(cameras(house).locator('.camlbl small')).toHaveText(['Idle']);
  await expect(sensors(house).locator('.lbl')).toHaveText('Doors & motion');
  await expect(sensors(house).locator('.right')).toHaveText('Door closed');
  await expect(sensors(house).locator('.schip b')).toHaveText(['Front door', 'Hall motion']);
  await expect(sensors(house).locator('.schip em')).toHaveText(['Closed', 'Motion now']);
  await expect(sensors(house).locator('.schip.act')).toHaveCount(1);
});

test('a house without a camera shows the empty state and its link to the integration', async ({house}) => {
  await house.tab('cams');
  await expect(cameras(house).locator('.camempty b')).toHaveText('No cameras yet');
  const link = cameras(house).getByRole('link', {name: 'Add UniFi Protect'});
  await expect(link).toHaveAttribute('href', '/config/integrations/dashboard/add?domain=unifiprotect');
  await expect(link).toHaveAttribute('target', '_top');
});

test('a door that opens shows in amber, and the chip takes its tone', async ({house}) => {
  await house.tab('cams');
  await house.setState('binary_sensor.front_door', {state: 'on'});
  await expect(sensors(house).locator('.right b.warn')).toHaveText('1 door open');
  await expect(sensors(house).locator('.schip.warn em')).toHaveText('Open');
});

test('a tap on a camera and a tap on a sensor open the legacy sheets for that device', async ({house}) => {
  await addPorch(house);
  await house.tab('cams');
  await cameras(house)
    .getByRole('button', {name: /^Porch/})
    .click();
  await expect(house.root().locator('#sh-cam')).toBeVisible();
  await expect(house.root().locator('#camh')).toHaveText('Porch');
  await house.page.keyboard.press('Escape');
  await expect(house.root().locator('#sh-cam')).toBeHidden();
  await sensors(house)
    .getByRole('button', {name: /^Front door/})
    .click();
  await expect(house.root().locator('#sh-sens')).toBeVisible();
  await expect(house.root().locator('#sensh')).toHaveText('Front door');
});

// the snapshot is asked for again every ten seconds by the stamp on its URL; `repeat` keeps the tile's image, so the browser swaps
// the source of the node it has instead of drawing a new one
test('ten seconds on, the snapshot has a new stamp and is the same node', async ({house}) => {
  await addPorch(house);
  await house.tab('cams');
  const first = await stampOf(house);
  await cameras(house)
    .locator('.cam img')
    .evaluate(img => ((img as unknown as {kept: boolean}).kept = true));
  await house.clock.fastForward(10_000);
  await expect.poll(() => stampOf(house)).toBeGreaterThan(first);
  expect(
    await cameras(house)
      .locator('.cam img')
      .evaluate(img => (img as unknown as {kept?: boolean}).kept),
  ).toBe(true);
});

// the pane listens to the Security ids alone: a thermostat is not one of them
test('a thermostat change draws nothing in the pane or its cards', async ({house}) => {
  await addPorch(house);
  await house.tab('cams');
  await expect(sensors(house).locator('.schip')).toHaveCount(2);
  await house.mutations.reset();
  await house.setState('climate.living_room', {attributes: {temperature: 23}});
  await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await house.mutations.count('hp-security-pane, hp-camera-card, hp-sensor-card'), 'mutations').toBe(0);
});

test('the tab has no serious or critical accessibility finding', async ({house}) => {
  await addPorch(house);
  await house.tab('cams');
  await expect(cameras(house).locator('.cam')).toHaveCount(1);
  const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
  expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
});
