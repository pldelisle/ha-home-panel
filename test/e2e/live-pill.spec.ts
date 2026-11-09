// Live activities (2.6.0): the test car is charging, so the status spot is a pill; tapped, it shows the car's card above the
// Status checks. With nothing running and nothing to check the spot is empty (2.8.0); a problem shows as an attention pill.
// State changes go through the harness, the way Home Assistant hands the panel a new hass.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import type {Locator} from '@playwright/test';
import {test, expect, expectCall, type House} from './fixtures';
import {FULL_CFG} from './houses';
import {pill, stopCharging, openFrontDoor, openPopup} from './live';

test.use({houseOpts: {cfg: FULL_CFG}});

test('10 the status chip is a charging pill', async ({house}) => {
  await expect(pill(house)).toHaveClass(/\blap\b/);
  await expect(pill(house)).toContainText('64%');
});

test('11 tapped, the pill shows one activity card and the Status checks', async ({house}) => {
  const popup = await openPopup(house);
  await expect(popup.locator('.lact')).toHaveCount(1);
  await expect(popup.locator('.lstat')).toHaveCount(1);
});

test("12 Pause charging turns the charger's pause switch off", async ({house}) => {
  const popup = await openPopup(house);
  await popup.locator('[data-la="pause"]').click();
  await expectCall(house, /^switch\.turn_off .*charger_pause/);
});

test('13 once charging stops and nothing needs attention, the spot is empty', async ({house}) => {
  await expect(pill(house)).toHaveClass(/\blap\b/); // the pill was there first, so its absence below means something
  await stopCharging(house);
  await expect(pill(house)).toHaveCount(0);
});

test('14 a door left open shows as an attention pill', async ({house}) => {
  await stopCharging(house); // while the car still charges, the charging pill wins
  await openFrontDoor(house);
  await expect(pill(house)).toContainText(/needs attention/);
});

test("15 the Home card ends at Who's home: the pill says the rest (2.8.1)", async ({house}) => {
  await stopCharging(house);
  await openFrontDoor(house);
  await expect(pill(house)).toContainText(/needs attention/); // there is a problem, and still no Status block on the Home card
  const home = house.root().locator('#hwx');
  await expect(home).toContainText(/Who's home/);
  await expect(home).not.toContainText(/Status|All clear/);
});

// The attention mark under the glass look (the default): the inline "!" of the attention pill is the bare round badge, with no tinted
// box behind it, and the round bubble beside a charging pill keeps its tint (#50). Computed style, because a box is pixels the text
// assertions above never see.
const CLEAR = 'rgba(0, 0, 0, 0)';

test("45 under the glass look, the attention pill's warning mark has no tinted box behind it", async ({house}) => {
  await expect(house.root().locator('.app.gl')).toHaveCount(1); // glass is on: it is the look that used to paint the box
  await stopCharging(house);
  await openFrontDoor(house);
  await expect(pill(house)).toContainText(/needs attention/);
  const mark = pill(house).locator('.lwarn');
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveCSS('background-color', CLEAR);
  await expect(mark.locator('b')).toHaveCSS('border-radius', '50%'); // the round badge itself is what carries the mark
});

test('46 while the car charges, the attention bubble beside the pill stays tinted, and opaque when transparency is reduced', async ({
  house,
}) => {
  await expect(house.root().locator('.app.gl')).toHaveCount(1);
  await openFrontDoor(house);
  const bubble = pill(house).locator('.lbub.lwarn');
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toHaveCSS('border-radius', '999px');
  // tinted: not the plain glass of the charging pill beside it, and not see-through
  const plain = await pill(house)
    .locator('.lmain')
    .evaluate(e => getComputedStyle(e).backgroundColor);
  await expect(bubble).not.toHaveCSS('background-color', plain);
  await expect(bubble).not.toHaveCSS('background-color', CLEAR);
  // with transparency reduced the glass gives way to the opaque card colour, tint included (light theme: white)
  // Playwright's emulateMedia has no reducedTransparency (it is silently ignored), so this asks Chromium directly
  const cdp = await house.page.context().newCDPSession(house.page);
  await cdp.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-transparency', value: 'reduce'}]});
  expect(await house.page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
  await expect(bubble).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(bubble).toHaveCSS('backdrop-filter', 'none');
});

// With transparency reduced the tinted pills turn solid like the plain one (#96). Computed style only: the glass value is read first,
// so the test knows the pill really was see-through before the preference went on.
const reduceTransparency = async (house: House) => {
  const cdp = await house.page.context().newCDPSession(house.page);
  await cdp.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-transparency', value: 'reduce'}]});
  expect(await house.page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
};

// opaque: rgb(r, g, b), or color(srgb r g b) as Chromium writes a colour-mix() result; any alpha is "rgba(" or "... / a)"
const OPAQUE = /^(rgb\(|color\(srgb [^/]*\)$)/;

const expectSolidWhenReduced = async (house: House, main: Locator) => {
  await expect(main).toHaveCount(1);
  const glass = await main.evaluate(e => getComputedStyle(e).backgroundColor);
  expect(glass).not.toMatch(OPAQUE); // see-through
  expect(await main.evaluate(e => getComputedStyle(e).backdropFilter)).not.toBe('none');
  await reduceTransparency(house);
  await expect(main).toHaveCSS('backdrop-filter', 'none');
  await expect(main).toHaveCSS('background-color', OPAQUE);
  await expect(main).not.toHaveCSS('background-color', glass);
};

test('47 with transparency reduced, the tinted Hilo challenge pill is solid', async ({house}) => {
  await expect(house.root().locator('.app.gl')).toHaveCount(1);
  await house.setState('sensor.hilo_gateway_defi_hilo', {state: 'on', attributes: {next_events: []}}); // a reduction in progress: the tinted pill
  await expectSolidWhenReduced(house, pill(house).locator('.lmain.tint'));
});

test('48 with transparency reduced, the attention pill is solid', async ({house}) => {
  await expect(house.root().locator('.app.gl')).toHaveCount(1);
  await stopCharging(house);
  await openFrontDoor(house);
  await expect(pill(house)).toContainText(/needs attention/);
  await expectSolidWhenReduced(house, pill(house).locator('.latt.lmain'));
});
