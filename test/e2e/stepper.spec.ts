// <hp-stepper> (the kit's `−  value  +`), driven through the Media tab's speaker pod, its first user: what its bounds disable, the value a
// tap asks for, what a screen reader is told and what axe finds in it. The pod's debounce and command are media.spec.ts's.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, tabletOnly, type House} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});
test.beforeEach(() => tabletOnly());

const SPEAKER = 'media_player.living_room_speaker';
const stepper = (house: House) => house.root().locator('#pane-media hp-speaker-pod hp-stepper');

/** the values the stepper's `step-change` events carry from now on, read from the page */
const listen = (house: House) =>
  stepper(house).evaluate(el => {
    const seen: number[] = [];
    (window as unknown as {seen: number[]}).seen = seen;
    el.addEventListener('step-change', e => seen.push((e as CustomEvent<{value: number}>).detail.value));
  });
const heard = (house: House) => house.page.evaluate(() => (window as unknown as {seen: number[]}).seen);

test('the buttons are the owner’s words, in a group the owner names', async ({house}) => {
  await house.tab('media');
  const group = house.root().getByRole('group', {name: 'Living room volume'});
  await expect(group.getByRole('button', {name: 'Volume down'})).toBeEnabled();
  await expect(group.getByRole('button', {name: 'Volume up'})).toBeEnabled();
  await expect(stepper(house).locator('.sv')).toHaveText('35%Volume');
});

test('the minus is off at the bottom and the plus at the top, and neither is off between', async ({house}) => {
  await house.tab('media');
  const down = stepper(house).getByRole('button', {name: 'Volume down'});
  const up = stepper(house).getByRole('button', {name: 'Volume up'});
  await house.setState(SPEAKER, {attributes: {volume_level: 0}});
  await expect(down).toBeDisabled();
  await expect(up).toBeEnabled();
  await house.setState(SPEAKER, {attributes: {volume_level: 1}});
  await expect(down).toBeEnabled();
  await expect(up).toBeDisabled();
  await house.setState(SPEAKER, {attributes: {volume_level: 0.004}});
  await expect(down, 'a level just above the bottom can still step down').toBeEnabled();
});

test('a step carries the next value, kept in the bounds and at the step’s decimals', async ({house}) => {
  await house.tab('media');
  await house.setState(SPEAKER, {attributes: {volume_level: 0.98}});
  await expect(stepper(house).locator('.sv b')).toHaveText('98%');
  await listen(house);
  await stepper(house).getByRole('button', {name: 'Volume up'}).click();
  await stepper(house).getByRole('button', {name: 'Volume down'}).click();
  // the pod holds the level it asked for (1), so the second step starts from it: the 0.95 is 1 minus a step, not a float's 0.95000000001
  expect(await heard(house)).toEqual([1, 0.95]);
});

test('axe finds nothing serious in it', async ({house}) => {
  await house.tab('media');
  await expect(stepper(house)).toBeVisible();
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
