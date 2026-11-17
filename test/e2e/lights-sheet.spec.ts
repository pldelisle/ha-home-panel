// The light sheet: tapping a tile opens it, the sliders and switches inside send the calls Home Assistant needs (and take
// the room off Adaptive Lighting when a person sets a level by hand), Done and Enter close and open it.
// Test titles start with the check's number in docs/specs/01-playwright-test.md.
import {test, expect, type House} from './fixtures';
import {FULL_CFG} from './houses';
import {callData, callsMessage, OFFICE_TILE, openOfficeSheet} from './lights';

// a fake clock lets the tests run past the panel's timers (the 60 ms drag release, the 1 s render tick) without waiting
test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T12:00:00-05:00'}});
test.skip(() => test.info().project.name === 'phone', 'tablet layout');

/** an element's top-left corner and size, in page coordinates */
const box = async (house: House, selector: string) => {
  const b = await house.root().locator(selector).boundingBox();
  if (!b) throw new Error(`${selector} is not on screen`);
  return b;
};

test('26 tapping the right part of the Office tile opens the sheet and switches nothing', async ({house}) => {
  await openOfficeSheet(house);
  await house.clock.runFor(1_100);
  expect(
    house.calls.filter(c => /^light\./.test(c)),
    callsMessage(house, 'opening the sheet switches nothing'),
  ).toEqual([]);
});

test('27 dragging up the brightness slider sends one brightness and takes the room off Auto', async ({house}) => {
  await openOfficeSheet(house);
  const b = await box(house, '#lsheet .lpill[data-lp="br"]');
  const x = b.x + b.width / 2;
  await house.page.mouse.move(x, b.y + b.height * 0.6);
  await house.page.mouse.down();
  for (let i = 1; i <= 8; i++) await house.page.mouse.move(x, b.y + b.height * (0.6 - i * 0.07));
  await house.page.mouse.up();
  await house.clock.runFor(1_100); // past the drag's release and the panel's next render tick: a stray second call would be sent by now
  const brightness = () => house.calls.filter(c => /^light\.turn_on .*office_1/.test(c) && /brightness_pct/.test(c));
  await expect.poll(() => brightness().length, callsMessage(house, 'a drag sends a brightness')).toBeGreaterThan(0);
  expect(brightness(), callsMessage(house, 'a drag sends one brightness')).toHaveLength(1);
  expect(callData(brightness()[0]).brightness_pct, 'dragging up brightens').toBeGreaterThanOrEqual(90);
  await expect
    .poll(
      () => house.calls.some(c => /^adaptive_lighting\.set_manual_control .*"manual_control":true/.test(c)),
      callsMessage(house, 'a change by hand takes the room off Auto'),
    )
    .toBe(true);
});

test('28 tapping near the top of the colour slider picks a cool white', async ({house}) => {
  await openOfficeSheet(house);
  const k = await box(house, '#lsheet .lpill[data-lp="ct"]');
  await house.page.mouse.click(k.x + k.width / 2, k.y + k.height * 0.05);
  const kelvin = () => house.calls.filter(c => /color_temp_kelvin/.test(c)).at(-1);
  await expect
    .poll(() => kelvin() !== undefined, callsMessage(house, 'a tap on the colour slider sends a colour temperature'))
    .toBe(true);
  expect(callData(kelvin()!).color_temp_kelvin, callsMessage(house, 'near the top is a cool white')).toBeGreaterThan(
    6000,
  );
});

test('29 ArrowDown on the brightness slider dims by 10 %', async ({house}) => {
  await house.setState('light.office_1', {attributes: {brightness: 245}}); // the office bulb sits at 96 %
  await openOfficeSheet(house);
  const pill = house.root().locator('#lsheet .lpill[data-lp="br"]');
  await expect(pill).toHaveAttribute('aria-valuenow', '96');
  await pill.focus();
  await house.page.keyboard.press('ArrowDown');
  await expect
    .poll(
      () => house.calls.some(c => /^light\.turn_on .*office_1.*"brightness_pct":86/.test(c)),
      callsMessage(house, 'ArrowDown dims by 10 % from where the slider stands'),
    )
    .toBe(true);
});

test('30 the Auto and Night switches reach Adaptive Lighting', async ({house}) => {
  await openOfficeSheet(house);
  await house.root().locator('#lsheet hp-switch[data-l="al"] button').click();
  await expect
    .poll(
      () => house.calls.some(c => /^switch\.turn_off .*adaptive_lighting_office"/.test(c)),
      callsMessage(house, 'Auto reaches the Adaptive Lighting switch'),
    )
    .toBe(true);
  await house.root().locator('#lsheet hp-switch[data-l="night"] button').click();
  await expect
    .poll(
      () => house.calls.some(c => /^switch\.turn_on .*office_sleep_mode/.test(c)),
      callsMessage(house, 'Night turns sleep mode on'),
    )
    .toBe(true);
});

test('31 Done closes the sheet and Enter on a tile opens it again', async ({house}) => {
  await openOfficeSheet(house);
  await house.root().locator('#sh-light .ldone').click();
  await expect(house.root().locator('#sh-light')).toBeHidden();
  await house.root().locator(OFFICE_TILE).focus();
  await house.page.keyboard.press('Enter');
  await expect(house.root().locator('#sh-light')).toBeVisible();
});

test('60 a change of the room while a finger is on the slider leaves the slider under the finger', async ({house}) => {
  await openOfficeSheet(house);
  const pill = house.root().locator('#lsheet .lpill[data-lp="br"]');
  const b = await box(house, '#lsheet .lpill[data-lp="br"]');
  const x = b.x + b.width / 2;
  await house.page.mouse.move(x, b.y + b.height * 0.6);
  await house.page.mouse.down();
  await house.page.mouse.move(x, b.y + b.height * 0.3);
  const held = await pill.getAttribute('aria-valuenow');
  const sub = await house.root().locator('#lshsub').textContent();
  expect(Number(held), 'the finger at 70 % of the height').toBeGreaterThanOrEqual(65);
  await house.setState('light.office_1', {attributes: {brightness: 25}}); // the bulb reports 10 % meanwhile
  await house.clock.runFor(1_100); // past the panel's next render tick
  await expect(pill, 'the house does not move the slider under the finger').toHaveAttribute('aria-valuenow', held!);
  // the sheet is held, not only the pill: the room's line, which says the brightness, waits for the release too
  await expect(house.root().locator('#lshsub'), 'nothing of the sheet is drawn again mid-drag').toHaveText(sub!);
  await house.page.mouse.up();
  await house.clock.runFor(1_100);
  const brightness = house.calls.filter(c => /^light\.turn_on .*office_1/.test(c) && /brightness_pct/.test(c));
  expect(brightness, callsMessage(house, 'the release sends the finger’s value, once')).toHaveLength(1);
  expect(callData(brightness[0]).brightness_pct).toBe(Number(held));
});
