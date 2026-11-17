// <hp-stepper> (the kit's `−  value  +`), driven through the Air tab's purifier card (fan speed, 10 to 100 in steps of 10): what its bounds
// disable, the value a tap asks for, what a screen reader is told and what axe finds in it. The card's debounce and command are
// air.spec.ts's. The Media tab's speaker pod was its first user until #388 made the speaker's volume a slider.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, tabletOnly, type House} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});
test.beforeEach(() => tabletOnly());

const FAN = 'fan.office_purifier';
const stepper = (house: House) => house.root().locator('#pane-air hp-air-room hp-stepper');
// the stepper shows with the fan in Manual
const open = async (house: House) => {
  await house.tab('air');
  await house.root().locator('#pane-air').getByRole('radio', {name: 'Manual'}).click();
  await expect(stepper(house)).toBeVisible();
};

/** the values the stepper's `step-change` events carry from now on, read from the page */
const listen = (house: House) =>
  stepper(house).evaluate(el => {
    const seen: number[] = [];
    (window as unknown as {seen: number[]}).seen = seen;
    el.addEventListener('step-change', e => seen.push((e as CustomEvent<{value: number}>).detail.value));
  });
const heard = (house: House) => house.page.evaluate(() => (window as unknown as {seen: number[]}).seen);

test('the buttons are the owner’s words, in a group the owner names', async ({house}) => {
  await open(house);
  await expect(stepper(house).getByRole('button', {name: 'Slower'})).toBeEnabled();
  await expect(stepper(house).getByRole('button', {name: 'Faster'})).toBeEnabled();
  await expect(stepper(house).locator('.sv b')).toHaveText('40%');
});

test('the minus is off at the bottom and the plus at the top, and neither is off between', async ({house}) => {
  await open(house);
  const down = stepper(house).getByRole('button', {name: 'Slower'});
  const up = stepper(house).getByRole('button', {name: 'Faster'});
  await house.setState(FAN, {attributes: {preset_mode: 'Manual', percentage: 10}});
  await expect(down).toBeDisabled();
  await expect(up).toBeEnabled();
  await house.setState(FAN, {attributes: {preset_mode: 'Manual', percentage: 100}});
  await expect(down).toBeEnabled();
  await expect(up).toBeDisabled();
  await house.setState(FAN, {attributes: {preset_mode: 'Manual', percentage: 20}});
  await expect(down, 'a speed just above the bottom can still step down').toBeEnabled();
});

test('a step carries the next value, kept in the bounds and at the step’s decimals', async ({house}) => {
  await open(house);
  await house.setState(FAN, {attributes: {preset_mode: 'Manual', percentage: 90}});
  await expect(stepper(house).locator('.sv b')).toHaveText('90%');
  await listen(house);
  await stepper(house).getByRole('button', {name: 'Faster'}).click();
  await stepper(house).getByRole('button', {name: 'Slower'}).click();
  // the card holds the speed it asked for (100), so the next step starts from it
  expect(await heard(house)).toEqual([100, 90]);
});

test('axe finds nothing serious in it', async ({house}) => {
  await open(house);
  const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
  const ours = violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .flatMap(v =>
      v.nodes
        .filter(n => JSON.stringify(n.target).includes('hp-stepper'))
        .map(n => `${v.id}: ${JSON.stringify(n.target)}`),
    );
  expect(ours).toEqual([]);
});
