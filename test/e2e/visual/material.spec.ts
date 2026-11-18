// The Material design, colour only (ADR 0037, #460, #461): the Home tab on the tablet in light and dark, and on the phone in light, in the
// full house with `home-panel-design` set to material before the page loads; the Settings popup with its seven seeds (tablet, light and
// dark); and the Home tab on the tablet with one non-default seed (Meadow). Later tickets of the Material epic add their own shots.
// Baselines live in test/e2e/__screenshots__/visual/material.spec.ts/ and are recorded only inside the Playwright image (Docker or
// `container`: npm run test:visual:update); a difference is either fixed or approved by updating them in the same pull request.
import {test, expect, fontsLoaded, type House} from '../fixtures';
import {AFTERNOON, FULL_CFG, KEEP_ENGLISH_NAMES, VIEWPORTS} from '../houses';

// every screenshot shows the bundled Manrope, never the fallback it swaps from (font-display: swap)
test.beforeEach(({house}) => fontsLoaded(house));

const SHOTS = [
  {viewport: 'tablet', theme: 'light'},
  {viewport: 'tablet', theme: 'dark'},
  {viewport: 'phone', theme: 'light'},
] as const;

for (const {viewport, theme} of SHOTS) {
  test.describe(`${viewport}, ${theme}`, () => {
    test.use({
      viewport: VIEWPORTS[viewport],
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('Home in Material', async ({house}) => {
      await house.tab('home');
      // the frame is Material's: no glass, and the scheme's surface under the cards
      await expect(house.root().locator('.app')).toHaveAttribute('data-design', 'material');
      await expect(house.root().locator('.app')).not.toHaveClass(/\bgl\b/);
      await expect(house.page).toHaveScreenshot(`material-home-${viewport}-${theme}-en.png`);
    });
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`tablet, ${theme}, settings`, () => {
    test.use({
      viewport: VIEWPORTS.tablet,
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('Settings in Material', async ({house}) => {
      await house.root().locator('#gear').click();
      await expect(house.root().locator('#setpop')).toBeVisible();
      // the seven seeds stand where the wallpapers do under Apple, House chosen
      await expect(house.root().locator('#setpop .seed')).toHaveCount(7);
      await expect(house.root().locator('#setpop .seed[aria-checked="true"]')).toHaveAttribute('data-seed', 'house');
      await expect(house.root().locator('#setpop [data-gl]')).toHaveCount(0);
      // the footer prints the release, which every release changes: masked, a version bump leaves the baseline alone
      await expect(house.page).toHaveScreenshot(`material-settings-tablet-${theme}-en.png`, {
        mask: [house.root().locator('#setpop .ccv')],
      });
    });
  });
}

test.describe('tablet, light, Meadow', () => {
  test.use({
    viewport: VIEWPORTS.tablet,
    houseOpts: {cfg: FULL_CFG, theme: 'light', design: 'material', seed: 'meadow', time: AFTERNOON, frozen: true},
  });

  test('Home in Material with the Meadow seed', async ({house}) => {
    await house.tab('home');
    await expect(house.page).toHaveScreenshot('material-home-tablet-light-meadow-en.png');
  });
});

// The connected button group (#465): the Air tab holds both, the range tabs (Day, Week, Month) and a room card's mode group (hp-seg) with its
// chosen mode a primary pill. Air is a tab on a tablet and under More on a phone.
for (const {viewport, theme} of SHOTS) {
  test.describe(`button group, ${viewport}, ${theme}`, () => {
    test.use({
      viewport: VIEWPORTS[viewport],
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('Air with the button groups in Material', async ({house}) => {
      if (viewport === 'phone') {
        await house.root().locator('#moretab').click();
        await house.root().locator('#morelist hp-stat-tile[key="air"] button').click();
        await expect(house.root().locator('#pane-air')).toBeVisible();
      } else {
        await house.tab('air');
      }
      const pane = house.root().locator('#pane-air hp-air-pane');
      // the range tabs: in the pane's header on a phone, in the detail on a tablet
      await expect(pane.locator('hp-range-tabs [role="tab"]').first()).toBeVisible();
      await expect(pane.locator('hp-air-room').getByRole('radio', {name: 'Automagic'})).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(house.page).toHaveScreenshot(`material-button-group-${viewport}-${theme}-en.png`);
    });
  });
}

// the same on a phone in French, where the range tabs' words are longer: they share the width and give way with an ellipsis, never spilling out of the group
test.describe('button group, phone, light, French', () => {
  test.use({
    viewport: VIEWPORTS.phone,
    houseOpts: {
      cfg: {...FULL_CFG, names: KEEP_ENGLISH_NAMES},
      theme: 'light',
      lang: 'fr',
      design: 'material',
      time: AFTERNOON,
      frozen: true,
    },
  });

  test('Air with the button groups in Material, in French', async ({house}) => {
    await house.root().locator('#moretab').click();
    await house.root().locator('#morelist hp-stat-tile[key="air"] button').click();
    await expect(house.root().locator('#pane-air')).toBeVisible();
    await expect(house.root().locator('#pane-air hp-range-tabs [role="tab"]').first()).toBeVisible();
    await expect(house.page).toHaveScreenshot('material-button-group-phone-light-fr.png');
  });
});

// The snackbar (#467): a done toast with no action, and a failure led by the warn icon with its Dismiss action; on the tablet in light, and on
// the phone in light and dark, where it sits above the navigation bar. The page's clock is paused so the done one stays up for its shot.
for (const {viewport, theme} of [
  {viewport: 'tablet', theme: 'light'},
  {viewport: 'phone', theme: 'light'},
  {viewport: 'phone', theme: 'dark'},
] as const) {
  test.describe(`${viewport}, ${theme}, snackbar`, () => {
    test.use({
      viewport: VIEWPORTS[viewport],
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    const movieNight = (house: House) =>
      house.root().locator('#hscenes hp-scene-tiles').getByRole('button').filter({hasText: 'Movie night'});

    test('a confirmation in Material', async ({house}) => {
      await house.tab('home');
      await house.clock.pauseAt((await house.page.evaluate(() => Date.now())) + 1000);
      await movieNight(house).click();
      await expect(house.root().locator('hp-toast #toast')).toHaveText('Movie night on');
      await expect(house.page).toHaveScreenshot(`material-snackbar-${viewport}-${theme}-en.png`);
    });

    test('a failure in Material', async ({house}) => {
      await house.tab('home');
      await house.clock.pauseAt((await house.page.evaluate(() => Date.now())) + 1000);
      await house.failNext('scene.turn_on');
      await movieNight(house).click();
      await expect(house.root().locator('hp-toast #toast')).toHaveClass(/\berr\b/);
      await expect(house.page).toHaveScreenshot(`material-snackbar-error-${viewport}-${theme}-en.png`);
    });
  });
}

// The Material switch and switch row (#464): the Car's charger card holds a switch row (the lock), shown off and then on (the owner holds the tap's value
// at once) on the tablet in light and dark and on the phone in light. Element shots, so the history's chart and the car's picture stay out of them.
for (const {viewport, theme} of SHOTS) {
  test.describe(`${viewport}, ${theme}, switches`, () => {
    test.use({
      viewport: VIEWPORTS[viewport],
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('the switch row in Material, off and on', async ({house}) => {
      await house.tab('car');
      const charger = house.root().locator('#pane-car hp-charger-controls');
      await expect(charger.locator('h3')).toHaveText('Home charger');
      // the row's 40 px icon container is the Material anatomy
      await expect(charger.locator('hp-switch-row .ic')).toBeVisible();
      const lock = charger.getByRole('switch', {name: 'Lock charger'});
      await expect(lock).toHaveAttribute('aria-checked', 'false');
      await expect(charger).toHaveScreenshot(`material-switch-off-${viewport}-${theme}-en.png`);
      await lock.click();
      await expect(lock).toHaveAttribute('aria-checked', 'true');
      // the handle's spring has settled
      await lock.evaluate(button => Promise.all(button.getAnimations({subtree: true}).map(a => a.finished)));
      await expect(charger).toHaveScreenshot(`material-switch-on-${viewport}-${theme}-en.png`);
    });
  });
}

// The navigation bar and rail (#466): the rail on the tablet in light and dark, in French as well (its longest label, Automatisations), and the bar
// on the phone in light and dark with a section other than Home open, so the pill sits behind another icon.
for (const theme of ['light', 'dark'] as const) {
  test.describe(`tablet, ${theme}, navigation`, () => {
    test.use({
      viewport: VIEWPORTS.tablet,
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('Rail in Material', async ({house}) => {
      await house.tab('lights');
      await expect(house.page).toHaveScreenshot(`material-rail-tablet-${theme}-en.png`);
    });
  });

  test.describe(`phone, ${theme}, navigation`, () => {
    test.use({
      viewport: VIEWPORTS.phone,
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('Bar in Material', async ({house}) => {
      await house.tab('lights');
      await expect(house.page).toHaveScreenshot(`material-bar-phone-${theme}-en.png`);
    });
  });
}

test.describe('tablet, light, French navigation', () => {
  test.use({
    viewport: VIEWPORTS.tablet,
    houseOpts: {cfg: FULL_CFG, theme: 'light', lang: 'fr', design: 'material', time: AFTERNOON, frozen: true},
  });

  test('Rail in Material in French', async ({house}) => {
    await house.tab('auto');
    await expect(house.page).toHaveScreenshot('material-rail-tablet-light-fr.png');
  });
});
