// The smart stack and Who's home as the features' elements (#266): the stack draws nothing again for a change its cards do not show,
// and its card has no serious accessibility finding. The checks of the stack itself are smart-stack.spec.ts's, unchanged.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, tabletOnly} from './fixtures';
import {FULL_CFG} from './houses';
import {NIGHT} from './idle';

test.describe('tablet', () => {
  test.beforeEach(tabletOnly);
  test.use({houseOpts: {cfg: FULL_CFG, time: NIGHT}});

  test('a thermostat change gives zero mutations in the stack and Who’s home', async ({house}) => {
    await expect(house.root().locator('#hstk .sc')).toBeVisible();
    await expect(house.root().locator('#hwho .status')).toHaveCount(2);
    await house.mutations.reset();
    await house.setState('climate.living_room', {attributes: {temperature: 23}});
    await house.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await house.mutations.count('hp-smart-stack, hp-stack-card, hp-who-card, hp-who-chips'), 'mutations').toBe(
      0,
    );
  });

  test('the stack’s card and Who’s home have no serious or critical accessibility finding', async ({house}) => {
    await expect(house.root().locator('#hstk .sc')).toBeVisible();
    const {violations} = await new AxeBuilder({page: house.page}).include('home-panel').analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});
