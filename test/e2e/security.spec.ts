// The Security tab (spec 17): <hp-security-pane> on the tablet, its cameras' card and its doors-and-motion card, what a tap opens (the
// camera's sheet and a sensor's history), and what the pane costs. The test house has a door and a motion sensor and no camera: each test that
// needs one adds it the way Home Assistant adds any entity. The camera's picture is a Home Assistant proxy URL the harness never
// serves, so a tile with one shows a broken image, as the legacy panel's did; the tests read its `src`, not its pixels.
import AxeBuilder from '@axe-core/playwright';
import type {Locator} from '@playwright/test';
import {test, expect, tabletOnly, countAdded, type House} from './fixtures';
import {AFTERNOON, FULL_CFG, KEEP_ENGLISH_NAMES} from './houses';

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

// "Motion now" is a status, not a link: the text colour with a green dot, never the blue that says "tap me"
const colourOf = (text: Locator) => text.evaluate(e => getComputedStyle(e).color);

test('"Motion now" is in the text colour with a dot, on the tab', async ({house}) => {
  await house.tab('cams');
  const now = sensors(house).locator('.schip.act em');
  await expect(now.locator('i')).toHaveCount(1);
  expect(await colourOf(now)).toBe(await colourOf(sensors(house).locator('.schip.act b')));
});

test('a house without a camera shows the empty state and its link to the integration', async ({house}) => {
  await house.tab('cams');
  await expect(cameras(house).locator('.camempty b')).toHaveText('No cameras yet');
  const link = cameras(house).getByRole('link', {name: 'Add UniFi Protect'});
  await expect(link).toHaveAttribute('href', '/config/integrations/dashboard/add?domain=unifiprotect');
  await expect(link).toHaveAttribute('target', '_top');
  // a bordered button the size of a finger, not text in a well
  await expect(link).not.toHaveCSS('border-top-width', '0px');
  await expect(link).not.toHaveCSS('border-top-style', 'none');
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('a door that opens shows in amber, and the chip takes its tone', async ({house}) => {
  await house.tab('cams');
  await house.setState('binary_sensor.front_door', {state: 'on'});
  await expect(sensors(house).locator('.right b.warn')).toHaveText('1 door open');
  await expect(sensors(house).locator('.schip.warn em')).toHaveText('Open');
});

const cameraSheet = (house: House) => house.root().locator('hp-camera-sheet');
const history = (house: House) => house.root().locator('hp-sensor-history');
const porchTile = (house: House) => cameras(house).getByRole('button', {name: /^Porch/});
const doorChip = (house: House) => sensors(house).getByRole('button', {name: /^Front door/});

// Home Assistant's player is not in the harness, so the sheet shows the proxy image, whose token is the camera's own attribute
test('a tap on a camera opens its sheet with its name, its state and the live image, and Escape gives the focus back', async ({
  house,
}) => {
  await addPorch(house);
  await house.setState(PORCH, {attributes: {access_token: 'tok'}});
  await house.tab('cams');
  await porchTile(house).click();
  await expect(cameraSheet(house).locator('hp-sheet h2')).toHaveText('Porch');
  await expect(cameraSheet(house).locator('hp-sheet > [slot="sub"]')).toHaveText('Idle');
  await expect(cameraSheet(house).locator('.camlive img')).toHaveAttribute(
    'src',
    '/api/camera_proxy_stream/camera.porch?token=tok',
  );
  await house.page.keyboard.press('Escape');
  await expect(cameraSheet(house)).toHaveCount(0);
  await expect(porchTile(house)).toBeFocused();
});

test('an offline camera says so in its sheet, with no stream', async ({house}) => {
  await addPorch(house);
  await house.setState(PORCH, {state: 'unavailable'});
  await house.tab('cams');
  await porchTile(house).click();
  await expect(cameraSheet(house).locator('.camlive p')).toHaveText('The camera is offline.');
  await expect(cameraSheet(house).locator('.camlive img')).toHaveCount(0);
});

test.describe('a sensor history', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, frozen: true}});
  const asks = async (house: House) =>
    (await house.reads()).filter(read => read.startsWith('history/history_during_period '));

  // the harness answers every door and motion sensor with the same three on-periods: 3 min, 40 s and 1 h 5 min, the last ended 48 min ago
  test('a tap on a sensor opens its day: the strip, the events newest first and the four tiles', async ({house}) => {
    await house.tab('cams');
    await doorChip(house).click();
    const sheet = history(house);
    await expect(sheet.locator('hp-sheet h2')).toHaveText('Front door');
    await expect(sheet.locator('hp-sheet > [slot="sub"]')).toHaveText('Door');
    await expect(sheet.locator('[role="tab"]')).toHaveText(['Day', 'Week']);
    await expect(sheet.locator('[role="tab"][aria-selected="true"]')).toHaveText('Day');
    await expect(sheet.locator('.inner h3').first()).toHaveText('Front door, last 24 hours');
    await expect(sheet.locator('.sstrip[role="img"]')).toHaveAttribute('aria-label', 'Open periods');
    await expect(sheet.locator('.sstrip i')).toHaveCount(3);
    await expect(sheet.locator('.saxis span')).toHaveCount(5);
    await expect(sheet.locator('.sevents li span')).toHaveText([
      'Open for 1 h 5 min',
      'Open for 40 s',
      'Open for 3 min',
    ]);
    await expect(sheet.locator('.tiles .k')).toHaveText(['Times opened', 'Total open', 'Longest', 'Last']);
    await expect(sheet.locator('.tiles .v')).toHaveText(['3', '1 h 9 min', '1 h 5 min', '48 min ago']);
  });

  test('each range is one request: Week asks, going back to Day is the cache', async ({house}) => {
    await house.tab('cams');
    await doorChip(house).click();
    await expect(history(house).locator('.sevents li')).toHaveCount(3);
    expect(await asks(house)).toHaveLength(1);
    await history(house).getByRole('tab', {name: 'Week'}).click();
    await expect(history(house).locator('.inner h3').first()).toHaveText('Front door, last 7 days');
    await expect(history(house).locator('.saxis span')).toHaveCount(8);
    expect(await asks(house)).toHaveLength(2);
    await history(house).getByRole('tab', {name: 'Day'}).click();
    await expect(history(house).locator('.saxis span')).toHaveCount(5);
    await history(house).getByRole('tab', {name: 'Week'}).click();
    await expect(history(house).locator('.saxis span')).toHaveCount(8);
    expect(await asks(house)).toHaveLength(2);
    expect((await asks(house))[0]).toContain('"entity_ids":["binary_sensor.front_door"]');
  });

  test('a motion sensor words its periods its own way, and Escape gives the focus back to its chip', async ({
    house,
  }) => {
    await house.tab('cams');
    await sensors(house)
      .getByRole('button', {name: /^Hall motion/})
      .click();
    await expect(history(house).locator('hp-sheet > [slot="sub"]')).toHaveText('Motion');
    await expect(history(house).locator('.sevents li span').first()).toHaveText('Motion for 1 h 5 min');
    await expect(history(house).locator('.tiles .k').first()).toHaveText('Motion events');
    await house.page.keyboard.press('Escape');
    await expect(history(house)).toHaveCount(0);
    await expect(sensors(house).getByRole('button', {name: /^Hall motion/})).toBeFocused();
  });

  // the Home card's rows ask the sheet host for the same sheet, which shows over the Home tab
  test('a tap on a sensor of the Home card opens its history over the Home tab', async ({house}) => {
    await house.tab('home');
    await house.root().locator('#hsec hp-security-card .hsen').first().click();
    await expect(history(house).locator('hp-sheet h2')).toBeVisible();
    await expect(history(house).locator('.sevents li')).toHaveCount(3);
    await expect(house.root().locator('#pane-home')).toBeVisible();
  });

  test('the range chosen stays for the next sensor', async ({house}) => {
    await house.tab('cams');
    await doorChip(house).click();
    await history(house).getByRole('tab', {name: 'Week'}).click();
    await expect(history(house).locator('.saxis span')).toHaveCount(8);
    await house.page.keyboard.press('Escape');
    await sensors(house)
      .getByRole('button', {name: /^Hall motion/})
      .click();
    await expect(history(house).locator('[role="tab"][aria-selected="true"]')).toHaveText('Week');
  });

  test('both sheets have no serious or critical accessibility finding', async ({house}) => {
    await addPorch(house);
    await house.tab('cams');
    await doorChip(house).click();
    await expect(history(house).locator('.sevents li')).toHaveCount(3);
    const check = async () =>
      (await new AxeBuilder({page: house.page}).include('home-panel').analyze()).violations
        .filter(v => v.impact === 'serious' || v.impact === 'critical')
        .map(v => v.id);
    expect(await check()).toEqual([]);
    await house.page.keyboard.press('Escape');
    await porchTile(house).click();
    await expect(cameraSheet(house).locator('.camlive img')).toBeAttached();
    expect(await check()).toEqual([]);
  });
});

test.describe('a sensor history in French', () => {
  test.use({houseOpts: {cfg: {...FULL_CFG, names: KEEP_ENGLISH_NAMES}, lang: 'fr', time: AFTERNOON, frozen: true}});

  // the one visible change of spec 17: the legacy sheet drew its times and dates in English whatever the profile said
  test('the times and the dates follow the profile', async ({house}) => {
    await house.tab('cams');
    await doorChip(house).click();
    const sheet = history(house);
    await expect(sheet.locator('.sevents li b').first()).toHaveText('12 h 07');
    await expect(sheet.locator('.saxis span').first()).toHaveText('14 h');
    await sheet.getByRole('tab', {name: 'Semaine'}).click();
    await expect(sheet.locator('.saxis span').first()).toHaveText('31 oct.');
    await expect(sheet.locator('.sevents li b').first()).toHaveText('7 nov. 12 h 07');
  });
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

// a pane on another tab asks for no snapshot: the stamp in the URL, which the browser fetches, stays as it was
test('a pane on another tab keeps its snapshot stamp when ten seconds pass', async ({house}) => {
  await addPorch(house);
  await house.tab('cams');
  const shown = await stampOf(house);
  await house.tab('home');
  await house.clock.fastForward(10_000);
  expect(await stampOf(house)).toBe(shown);
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

// The Home tab's card, <hp-security-card>, which the guest places by its tag in #hsec (ADR 0024): it glows when a sensor turns on
test.describe('the Home card', () => {
  const card = (house: House) => house.root().locator('#hsec hp-security-card');
  const box = (house: House) => card(house).locator('.seccard');
  const MOTION = 'binary_sensor.hall_motion';

  test('says what the pane says, and its header opens the Security tab', async ({house}) => {
    await house.tab('home');
    await expect(card(house).locator('.hh .right')).toHaveText('all doors closed · motion now');
    await expect(card(house).locator('.hsen b')).toHaveText(['Front door', 'Hall motion']);
    const now = card(house).locator('.hsen .act');
    await expect(now.locator('i')).toHaveCount(1);
    expect(await colourOf(now)).toBe(await colourOf(card(house).locator('.hsen b').last()));
    await card(house).locator('.hh').click();
    await expect(house.root().locator('#pane-cams')).toBeVisible();
  });

  // the page's clock stands still, so only fastForward moves it: the glow lasts 2.8 seconds, and the first draw never glows
  test('glows for under three seconds when a sensor turns on, and not on the first draw', async ({house}) => {
    await house.tab('home');
    await house.clock.pauseAt((await house.page.evaluate(() => Date.now())) + 1000);
    await expect(box(house)).toBeVisible();
    await expect(box(house)).not.toHaveClass(/glow/);
    await house.setState(MOTION, {state: 'off'});
    await expect(card(house).locator('.hsen .act')).toHaveCount(0);
    await expect(box(house)).not.toHaveClass(/glow/);
    await house.setState(MOTION, {state: 'on'});
    await expect(box(house)).toHaveClass(/glow/);
    await house.clock.fastForward(2_700);
    await expect(box(house)).toHaveClass(/glow/);
    await house.clock.fastForward(200);
    await expect(box(house)).not.toHaveClass(/glow/);
  });

  // the guest writes the tag once: a card written again would lose the reading it compares with, and glow at every change of the house.
  // A card made again attaches a new shadow root with a new `.seccard`, which the helper counts from the moment it is installed.
  test("is not made again by the guest's draws or a trip to another tab", async ({house}) => {
    await house.tab('home');
    await expect(box(house)).toBeVisible();
    const made = await countAdded(house, 'seccard');
    await house.setState('climate.living_room', {attributes: {temperature: 23}});
    await house.setState('binary_sensor.front_door', {state: 'on'});
    await house.tab('lights');
    await house.tab('home');
    await expect(card(house)).toHaveCount(1);
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await made()).toBe(0);
  });
});
