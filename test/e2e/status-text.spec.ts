// A filled capsule means "tap me" in this panel (the live pill, the scene chips, Settings' buttons), so a fact is drawn as text with a dot
// (epic #376, audit follow-up #393): Automations' date and a run's outcome, Air's two ratings and Home's people have no fill, no shadow and
// no rounded box, still say their word, and read at 4.5:1 on their card.
import AxeBuilder from '@axe-core/playwright';
import type {Locator} from '@playwright/test';
import {test, expect, isPhone, tabletOnly, type House} from './fixtures';
import {FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG, time: '2026-11-07T14:00:00-05:00'}});

/** every one of the `.status` elements has no fill, no shadow, no rounded box and a word; at least `min` of them show */
async function expectPlainText(statuses: Locator, min: number) {
  await expect(statuses.first()).toBeVisible();
  const all = await statuses.all();
  expect(all.length).toBeGreaterThanOrEqual(min);
  for (const status of all) {
    await expect(status).toHaveText(/\S/);
    await expect(status).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(status).toHaveCSS('box-shadow', 'none');
    await expect(status).toHaveCSS('border-top-left-radius', '0px');
  }
}

const contrast = async (house: House) => {
  const {violations} = await new AxeBuilder({page: house.page})
    .include('home-panel')
    .withRules(['color-contrast'])
    .analyze();
  return violations.flatMap(v => v.nodes.map(n => JSON.stringify(n.target)));
};

// Air is under More on a phone
const openAir = async (house: House) => {
  if (!isPhone(house)) return house.tab('air');
  await house.root().locator('#moretab').click();
  await house.root().locator('#morelist hp-stat-tile[key="air"] button').click();
  await expect(house.root().locator('#pane-air')).toBeVisible();
};

test('Home’s people say home or away in text with a dot, not in a capsule', async ({house}) => {
  await house.tab('home');
  const people = house.root().locator('hp-who-chips .status:visible');
  await expectPlainText(people, 1);
  await expect(people.first().locator('small')).toHaveText(/^(home|away)$/);
  expect(await contrast(house)).toEqual([]);
});

test('the Air ratings, the room’s and the outside’s, are text with a dot', async ({house}) => {
  await openAir(house);
  const detail = house.root().locator('#pane-air hp-air-detail');
  await expect(detail.locator('hp-air-room .status')).toHaveText('Moderate');
  await expectPlainText(detail.locator('hp-air-room .status, .aqsum .status'), 2);
  await expect(detail.locator('.aqsum .status')).toHaveText('Good');
  expect(await contrast(house)).toEqual([]);
});

test('Automations’ date and the runs’ outcomes are text with a dot', async ({house}) => {
  tabletOnly(); // the phone has no Automations tab
  await house.tab('auto');
  const pane = house.root().locator('#pane-auto');
  await expect(pane.locator('.augraph svg').first()).toBeVisible({timeout: 10_000});
  await expect(pane.locator('hp-run-timeline .status')).toHaveText(/^Sat, Nov 7 · 2:00 pm$/);
  await expectPlainText(pane.locator('hp-run-timeline .status, hp-flow-card .status'), 2);
  await expect(pane.locator('hp-flow-card .status').first()).toHaveText(/^(done|stopped|error|running|no run)/);
  expect(await contrast(house)).toEqual([]);
});
