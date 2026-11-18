// The Material design, colour only (ADR 0037, #460, #461): the Home tab on the tablet in light and dark, and on the phone in light, in the
// full house with `home-panel-design` set to material before the page loads; the Settings popup with its seven seeds (tablet, light and
// dark); and the Home tab on the tablet with one non-default seed (Meadow). Later tickets of the Material epic add their own shots.
// Baselines live in test/e2e/__screenshots__/visual/material.spec.ts/ and are recorded only inside the Playwright image (Docker or
// `container`: npm run test:visual:update); a difference is either fixed or approved by updating them in the same pull request.
import type {Locator} from '@playwright/test';
import {test, expect, fontsLoaded, type House} from '../fixtures';
import {AFTERNOON, FULL_CFG, KEEP_ENGLISH_NAMES, VIEWPORTS} from '../houses';
import {OFFICE_TILE} from '../lights';
import {openFrontDoor, openPopup, stopCharging} from '../live';
import {openSubmenu} from '../settings-controls';

// every screenshot shows the bundled Manrope, never the fallback it swaps from (font-display: swap)
test.beforeEach(({house}) => fontsLoaded(house));

// before a shot the pointer leaves for the page's corner (a tap leaves it over whatever the closing sheet uncovers, a navigation item
// on the phone, whose hover layer then shows in one run and not the next) and every finite animation, in every shadow root, ends (the
// navigation pill and the state layers spring after a tap); an infinite one (a live dot's pulse) is left to the screenshot's own pause
// Material shots allow four stray pixels (Apple's stay at zero, playwright.config.ts). The pixel that strayed beside the tablet rail (#485)
// was the greeting's subpixel fringe, left in a tile that Chromium repainted only in part on the switch to another tab; header.css now
// clips it. Chromium's partial repaint still leaves a pixel or two now and then elsewhere (the Status popup's shadow, a line of text in
// Climate, about 1 run in 30). Four pixels out of about a million cannot hide a changed control.
const SHOT = {maxDiffPixels: 4};

const settled = async (house: House) => {
  await house.page.mouse.move(0, 0);
  await house.page.evaluate(() => {
    const roots: (Document | ShadowRoot)[] = [document];
    for (let i = 0; i < roots.length; i++)
      for (const el of roots[i].querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot);
    const running = roots
      .flatMap(r => r.getAnimations())
      .filter(a => a.effect?.getComputedTiming().endTime !== Infinity);
    return Promise.all(running.map(a => a.finished.catch(() => undefined)));
  });
};

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
      await settled(house);
      await expect(house.page).toHaveScreenshot(`material-home-${viewport}-${theme}-en.png`, SHOT);
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
      await settled(house);
      await expect(house.page).toHaveScreenshot(`material-settings-tablet-${theme}-en.png`, {
        ...SHOT,
        mask: [house.root().locator('#setpop .ccv')],
      });
    });
  });
}

// the Control Center's submenus in Material (#495): Appearance with its Auto switch, Text size with its slider (Auto off, so it shows as it works)
test.describe('tablet, light, settings submenus', () => {
  test.use({
    viewport: VIEWPORTS.tablet,
    houseOpts: {cfg: FULL_CFG, theme: 'light', design: 'material', time: AFTERNOON, frozen: true},
  });

  for (const menu of ['appearance', 'text'] as const)
    test(`${menu} submenu in Material`, async ({house}) => {
      await openSubmenu(house, menu);
      if (menu === 'text') {
        await house.root().locator('hp-settings-popup').getByRole('switch', {name: 'Auto'}).dispatchEvent('click');
        await expect(house.root().locator('hp-settings-popup').getByRole('slider')).toBeEnabled();
      }
      await settled(house);
      await expect(house.page).toHaveScreenshot(`material-settings-${menu}-tablet-light-en.png`, {
        ...SHOT,
        mask: [house.root().locator('#setpop .ccv')],
      });
    });
});

test.describe('tablet, light, Meadow', () => {
  test.use({
    viewport: VIEWPORTS.tablet,
    houseOpts: {cfg: FULL_CFG, theme: 'light', design: 'material', seed: 'meadow', time: AFTERNOON, frozen: true},
  });

  test('Home in Material with the Meadow seed', async ({house}) => {
    await house.tab('home');
    await settled(house);
    await expect(house.page).toHaveScreenshot('material-home-tablet-light-meadow-en.png', SHOT);
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
      await settled(house);
      await expect(house.page).toHaveScreenshot(`material-button-group-${viewport}-${theme}-en.png`, SHOT);
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
    await settled(house);
    await expect(house.page).toHaveScreenshot('material-button-group-phone-light-fr.png', SHOT);
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
      await settled(house);
      await expect(house.page).toHaveScreenshot(`material-snackbar-${viewport}-${theme}-en.png`, SHOT);
    });

    test('a failure in Material', async ({house}) => {
      await house.tab('home');
      await house.clock.pauseAt((await house.page.evaluate(() => Date.now())) + 1000);
      await house.failNext('scene.turn_on');
      await movieNight(house).click();
      await expect(house.root().locator('hp-toast #toast')).toHaveClass(/\berr\b/);
      await settled(house);
      await expect(house.page).toHaveScreenshot(`material-snackbar-error-${viewport}-${theme}-en.png`, SHOT);
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
      await expect(charger).toHaveScreenshot(`material-switch-off-${viewport}-${theme}-en.png`, SHOT);
      await lock.click();
      await expect(lock).toHaveAttribute('aria-checked', 'true');
      // the handle's spring has settled
      await lock.evaluate(button => Promise.all(button.getAnimations({subtree: true}).map(a => a.finished)));
      await expect(charger).toHaveScreenshot(`material-switch-on-${viewport}-${theme}-en.png`, SHOT);
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
      await settled(house);
      await expect(house.page).toHaveScreenshot(`material-rail-tablet-${theme}-en.png`, SHOT);
    });
  });

  test.describe(`phone, ${theme}, navigation`, () => {
    test.use({
      viewport: VIEWPORTS.phone,
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('Bar in Material', async ({house}) => {
      await house.tab('lights');
      await settled(house);
      await expect(house.page).toHaveScreenshot(`material-bar-phone-${theme}-en.png`, SHOT);
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
    await settled(house);
    await expect(house.page).toHaveScreenshot('material-rail-tablet-light-fr.png', SHOT);
  });
});

// The Material components (#468): lists, tiles, stat tiles, buttons, chips, the stepper and the pane header. Each test reads what the person
// sees from the computed style, against the role it must wear (a colour is the scheme's `--md-*` or panel role, not a literal), then takes the shot.
const rgb = (hex: string): string => {
  const n = parseInt(hex.trim().slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
// the scheme's colours are inline custom properties on `.app`: a role is read from there and written as the browser computes it
const role = async (house: House, name: string): Promise<string> =>
  rgb(
    await house
      .root()
      .locator('.app')
      .evaluate((app, n) => getComputedStyle(app).getPropertyValue(n), name),
  );
const style = (target: Locator, prop: string): Promise<string> =>
  target.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

for (const theme of ['light', 'dark'] as const) {
  test.describe(`tablet, ${theme}, components`, () => {
    test.use({
      viewport: VIEWPORTS.tablet,
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('Lights: All off is the one large primary-container button, Arrange is tonal', async ({house}) => {
      await house.tab('lights');
      const pane = house.root().locator('hp-lights-pane');
      const alloff = pane.locator('.lbtn[data-l="alloff"]');
      await expect(alloff).toBeVisible();
      expect(await style(alloff, 'height')).toBe('56px');
      expect(await style(alloff, 'background-color')).toBe(await role(house, '--md-primary-container'));
      expect(await style(alloff, 'color')).toBe(await role(house, '--md-on-primary-container'));
      expect(await style(alloff, 'border-top-left-radius')).toBe('16px');
      expect(await style(alloff, 'box-shadow')).not.toBe('none');
      const arrange = pane.locator('#ledit');
      expect(await style(arrange, 'height')).toBe('40px');
      expect(await style(arrange, 'background-color')).toBe(await role(house, '--control'));
      await settled(house);
      await expect(house.page).toHaveScreenshot(`material-lights-tablet-${theme}-en.png`, SHOT);
    });

    test('Climate: a static tile is a well, one that opens a history a control; the stepper and the buttons are tonal', async ({
      house,
    }) => {
      await house.tab('climate');
      const detail = house.root().locator('hp-climate-detail');
      const wellTile = detail.locator('.tile:not(.tilebtn)').first();
      const controlTile = detail.locator('.tile.tilebtn').first();
      await expect(controlTile).toBeVisible();
      expect(await style(wellTile, 'background-color')).toBe(await role(house, '--well'));
      expect(await style(controlTile, 'background-color')).toBe(await role(house, '--control'));
      expect(await style(wellTile, 'border-top-left-radius')).toBe('12px');
      const step = detail.locator('hp-stepper .step').first();
      expect(await style(step, 'width')).toBe('48px');
      expect(await style(step, 'border-top-left-radius')).toBe('999px');
      expect(await style(step, 'background-color')).toBe(await role(house, '--control'));
      const setAll = detail.locator('.abtn').first();
      expect(await style(setAll, 'height')).toBe('40px');
      expect(await style(setAll, 'background-color')).toBe(await role(house, '--control'));
      await settled(house);
      await expect(house.page).toHaveScreenshot(`material-climate-tablet-${theme}-en.png`, SHOT);
    });
  });
}

test.describe('tablet, light, status rows', () => {
  test.use({
    viewport: VIEWPORTS.tablet,
    houseOpts: {cfg: FULL_CFG, theme: 'light', design: 'material', time: AFTERNOON, frozen: true},
  });

  test('the Status checks are a list group with a kind-coloured icon, and the fine phrases are chips', async ({
    house,
  }) => {
    await stopCharging(house);
    await openFrontDoor(house);
    const popup = await openPopup(house);
    // what is fine is said in chips: the car is locked
    const chip = popup.locator('.clear span').first();
    await expect(chip).toBeVisible();
    expect(await style(chip, 'height')).toBe('32px');
    expect(await style(chip, 'border-top-left-radius')).toBe('8px');
    // a second check, so the list is a group of two: the car is left unlocked
    await house.setState('lock.fordpass_test_doorlock', {state: 'unlocked'});
    const rows = popup.locator('.arow');
    await expect(rows).toHaveCount(2);
    const [first, last] = [rows.first(), rows.last()];
    // the group is round at its two ends (the large corner) and nearly square between its rows, which are 2px apart
    expect(await style(first, 'border-top-left-radius')).toBe('16px');
    // (the corners spring when the group grows: wait for them to settle)
    await expect.poll(() => style(first, 'border-bottom-left-radius')).toBe('4px');
    await expect.poll(() => style(last, 'border-top-left-radius')).toBe('4px');
    expect(await style(last, 'border-bottom-left-radius')).toBe('16px');
    const [a, b] = await Promise.all([first.boundingBox(), last.boundingBox()]);
    expect(b!.y - (a!.y + a!.height)).toBe(2);
    expect(await style(first, 'min-height')).toBe('56px');
    expect(await style(first, 'background-color')).toBe(await role(house, '--well'));
    const icon = first.locator('.ic');
    expect(await style(icon, 'background-color')).toBe(await role(house, '--warn-container'));
    expect(await style(icon, 'width')).toBe('40px');
    await settled(house);
    await expect(house.page).toHaveScreenshot('material-status-tablet-light-en.png', SHOT);
  });
});

test.describe('phone, light, components', () => {
  test.use({
    viewport: VIEWPORTS.phone,
    houseOpts: {cfg: FULL_CFG, theme: 'light', design: 'material', time: AFTERNOON, frozen: true},
  });

  test('Climate: a stat tile is a card, and a room that heats turns primary-container', async ({house}) => {
    await house.tab('climate');
    const heating = house.root().locator('hp-climate-pane hp-stat-tile[key="bedroom"] .stile');
    const idle = house.root().locator('hp-climate-pane hp-stat-tile[key="garage"] .stile');
    await expect(heating).toBeVisible();
    expect(await style(heating, 'background-color')).toBe(await role(house, '--md-primary-container'));
    expect(await style(heating.locator('.ic'), 'background-color')).toBe(await role(house, '--md-primary'));
    expect(await style(idle, 'background-color')).toBe(await role(house, '--card'));
    expect(await style(idle, 'border-top-left-radius')).toBe('16px');
    expect(await style(idle, 'min-height')).toBe('128px');
    expect(await style(idle.locator('.ic'), 'background-color')).toBe(await role(house, '--control'));
    expect(await style(idle.locator('.ic'), 'border-top-left-radius')).toBe('20px');
    await settled(house);
    await expect(house.page).toHaveScreenshot('material-climate-phone-light-en.png', SHOT);
  });
});

// A sheet and a dialog over their scrim (#469). The sheet is a room's lights: the full-width one with a handle on the phone, the floating
// one without on the tablet; the dialog is Climate's "Turn every room off?".
const pseudo = (target: Locator, which: '::before' | '::backdrop', prop: string): Promise<string> =>
  target.evaluate((el, [w, p]) => getComputedStyle(el, w).getPropertyValue(p), [which, prop]);

for (const {viewport, theme} of [
  {viewport: 'tablet', theme: 'light'},
  {viewport: 'tablet', theme: 'dark'},
  {viewport: 'phone', theme: 'light'},
] as const) {
  test.describe(`${viewport}, ${theme}, sheet`, () => {
    test.use({
      viewport: VIEWPORTS[viewport],
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('a sheet is surface-container-low over a 32% scrim; the phone has a handle, the tablet floats', async ({
      house,
    }) => {
      await house.tab('lights');
      await house.root().locator(`${OFFICE_TILE}:visible .tx`).click();
      const sheet = house.root().locator('#sh-light');
      const panel = sheet.locator('> .panel');
      await expect(panel).toBeVisible();
      await settled(house);
      expect(await style(panel, 'background-color')).toBe(await role(house, '--md-surface-container-low'));
      expect(await style(panel, 'border-top-left-radius')).toBe('28px');
      expect(await style(sheet, 'background-color')).toMatch(/0\.32/);
      expect(await style(sheet, 'backdrop-filter')).toBe('none');
      const box = (await panel.boundingBox())!;
      const grab = panel.locator('> .grab');
      if (viewport === 'phone') {
        // full width, square at the bottom edge, a 32x4 handle in a 48px grab area
        expect(box.width).toBe(VIEWPORTS.phone.width);
        expect(await style(panel, 'border-bottom-left-radius')).toBe('0px');
        expect(await style(grab, 'height')).toBe('48px');
        expect(await pseudo(grab, '::before', 'width')).toBe('32px');
        expect(await pseudo(grab, '::before', 'height')).toBe('4px');
        expect(box.y + box.height).toBe(VIEWPORTS.phone.height);
        expect(box.height).toBeLessThanOrEqual(VIEWPORTS.phone.height * 0.9);
      } else {
        // floating 24px above the bottom, round on all four corners, no handle
        expect(await style(panel, 'border-bottom-left-radius')).toBe('28px');
        expect(await style(grab, 'display')).toBe('none');
        expect(box.width).toBeLessThanOrEqual(640);
        expect(VIEWPORTS.tablet.height - (box.y + box.height)).toBe(24);
      }
      await expect(house.page).toHaveScreenshot(`material-sheet-${viewport}-${theme}-en.png`, SHOT);
    });
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`tablet, ${theme}, dialog`, () => {
    test.use({
      viewport: VIEWPORTS.tablet,
      houseOpts: {cfg: FULL_CFG, theme, design: 'material', time: AFTERNOON, frozen: true},
    });

    test('a confirmation is surface-container-high with text buttons in primary, Cancel first', async ({house}) => {
      await house.tab('climate');
      const controls = house.root().locator('hp-climate-detail hp-climate-controls');
      await controls.getByRole('button', {name: 'All off'}).click();
      const dialog = controls.locator('hp-dialog[data-ask="alloff"] dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('h4')).toHaveText('Turn every room off?');
      await settled(house);
      expect(await style(dialog, 'background-color')).toBe(await role(house, '--md-surface-container-high'));
      expect(await style(dialog, 'border-top-left-radius')).toBe('28px');
      expect(await style(dialog, 'padding-top')).toBe('24px');
      expect(await pseudo(dialog, '::backdrop', 'background-color')).toMatch(/0\.32/);
      // the actions are text buttons: no fill, no outline, the text in primary; Cancel before the action
      const [cancel, action] = await dialog.locator('.dbtn').all();
      for (const button of [cancel, action]) {
        expect(await style(button, 'background-color')).toBe('rgba(0, 0, 0, 0)');
        expect(await style(button, 'box-shadow')).toBe('none');
        expect(await style(button, 'color')).toBe(await role(house, '--md-primary'));
        expect(await style(button, 'height')).toBe('40px');
      }
      await expect(cancel).toHaveText('Cancel');
      await expect(action).toHaveText('Turn off');
      await expect(house.page).toHaveScreenshot(`material-dialog-tablet-${theme}-en.png`, SHOT);
      // it fades out and then closes (and says so): Cancel, however it leaves, closes it for good
      await cancel.click();
      await expect(dialog).toBeHidden();
    });
  });
}

// The remote keys and the room tiles (#484): the Media pane's four keys are 48px tonal icon buttons (a pill that tightens under a finger, mute primary
// while it holds), and a room of the Lights pane is a `control` tile, primary-container with a primary bulb when it is on. Media on the tablet, Lights
// on the phone, both in light.
test.describe('tablet, light, remote keys', () => {
  test.use({
    viewport: VIEWPORTS.tablet,
    houseOpts: {cfg: FULL_CFG, theme: 'light', design: 'material', time: AFTERNOON, frozen: true},
  });

  test('Media: the TV remote keys are 48px tonal pills, the muted one primary', async ({house}) => {
    await house.tab('media');
    const box = house.root().locator('#pane-media hp-tv-box');
    const keys = box.locator('.tvkeys button');
    await expect(keys).toHaveCount(4);
    await settled(house);
    for (const key of await keys.all()) {
      expect(await style(key, 'height')).toBe('48px');
      expect(await style(key, 'border-top-left-radius')).toBe('999px');
      expect(await style(key, 'background-color')).toBe(await role(house, '--control'));
      expect(await style(key, 'color')).toBe(await role(house, '--on-control'));
    }
    // the muted key is primary
    const mute = box.getByRole('button', {name: 'Mute', exact: true});
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await settled(house);
    expect(await style(mute, 'background-color')).toBe(await role(house, '--md-primary'));
    expect(await style(mute, 'color')).toBe(await role(house, '--md-on-primary'));
    await expect(house.page).toHaveScreenshot('material-media-tablet-light-en.png', SHOT);
    // a finger on a key tightens its corners to the large shape
    const volume = box.getByRole('button', {name: 'Vol +, volume up', exact: true});
    await volume.hover();
    await house.page.mouse.down();
    await expect.poll(() => style(volume, 'border-top-left-radius')).toBe('16px');
    await house.page.mouse.up();
    // a key of a set that is off is the content at 38% over a 12% fill
    await house.setState('media_player.living_room_tv', {state: 'off'});
    await expect(volume).toBeDisabled();
    await settled(house);
    expect(await style(volume, 'background-color')).toMatch(/0\.12\)$/);
    expect(await style(volume, 'color')).toMatch(/0\.38\)$/);
  });
});

test.describe('phone, light, room tiles', () => {
  test.use({
    viewport: VIEWPORTS.phone,
    houseOpts: {cfg: FULL_CFG, theme: 'light', design: 'material', time: AFTERNOON, frozen: true},
  });

  test('Lights: a room that is on is primary-container with a primary bulb, one that is off a control', async ({
    house,
  }) => {
    // the full house lights every room: the Office goes off, so the pane shows both kinds
    await house.setState('light.office_1', {state: 'off'});
    await house.tab('lights');
    // a lit room that carries its own light colour (`--lc`): Material does not draw it
    const lit = house.root().locator('#pane-lights .lcell.on[style*="--lc"]:visible').first();
    const dark = house.root().locator('#pane-lights .lcell[data-lsheet="office"]:visible');
    await expect(lit).toBeVisible();
    await expect(dark).toBeVisible();
    await settled(house);
    expect(await lit.evaluate(el => el.style.getPropertyValue('--lc'))).not.toBe('');
    expect(await style(lit, 'background-color')).toBe(await role(house, '--md-primary-container'));
    expect(await style(lit, 'box-shadow')).toBe('none');
    expect(await style(lit, 'color')).toBe(await role(house, '--md-on-primary-container'));
    expect(await style(lit.locator('.lbulb'), 'background-color')).toBe(await role(house, '--md-primary'));
    expect(await style(dark, 'background-color')).toBe(await role(house, '--control'));
    expect(await style(dark, 'color')).toBe(await role(house, '--on-control'));
    expect(await style(dark, 'border-top-left-radius')).toBe('16px');
    expect(await style(dark.locator('.lbulb'), 'border-top-left-radius')).toBe('20px');
    // an off room's bulb is a quiet square of the content's colour
    expect(await style(dark.locator('.lbulb'), 'color')).toBe(await role(house, '--on-control'));
    expect(await style(dark.locator('.lbulb'), 'background-color')).toMatch(/0\.12\)$/);
    await expect(house.page).toHaveScreenshot('material-lights-phone-light-en.png', SHOT);
  });
});

// The greeting's ink stays in its box (#485): Chromium's subpixel text spilled a fringe one pixel left of the subline, where hiding the
// greeting on another tab did not repaint, so that pixel showed beside the rail in some runs. The column just left of the box paints
// what a column of bare page background does, byte for byte.
test.describe('tablet, dark, greeting ink', () => {
  test.use({
    viewport: VIEWPORTS.tablet,
    houseOpts: {cfg: FULL_CFG, theme: 'dark', design: 'material', time: AFTERNOON, frozen: true},
  });

  test('the greeting paints nothing left of its box', async ({house}) => {
    await settled(house);
    const box = await house.root().locator('#hello').boundingBox();
    if (!box) throw new Error('the greeting has no box');
    const column = (x: number) =>
      house.page.screenshot({
        clip: {x, y: Math.floor(box.y), width: 1, height: Math.ceil(box.height)},
        animations: 'disabled',
      });
    // ten pixels further left is the gap between the rail and the page, which nothing draws in
    expect((await column(Math.floor(box.x) - 1)).equals(await column(Math.floor(box.x) - 10))).toBe(true);
  });
});

// A button group with more than five options (#481, ADR 0037): a seven-mode heat pump's detail on the phone shows the first four modes and "More", which wears the chosen
// mode's word and the chosen look while the choice is in its menu; the second shot has the menu open (surface-container, elevation 2, the chosen item on secondary-container).
test.describe('phone, light, seven modes', () => {
  test.use({
    viewport: VIEWPORTS.phone,
    houseOpts: {
      cfg: {...FULL_CFG, entities: {...FULL_CFG.entities, heat_pump: 'climate.heat_pump'}},
      theme: 'light',
      design: 'material',
      time: AFTERNOON,
      frozen: true,
    },
  });

  test.beforeEach(async ({house}) => {
    await house.setState('climate.heat_pump', {
      state: 'auto',
      attributes: {
        hvac_action: 'heating',
        current_temperature: 19.5,
        temperature: 22,
        min_temp: 16,
        max_temp: 30,
        hvac_modes: ['off', 'heat', 'cool', 'dry', 'fan_only', 'auto', 'eco'],
      },
    });
    await house.tab('climate');
    await house.root().locator('hp-climate-pane hp-stat-tile[key="hp"] button').click();
  });

  test('the group is four buttons and More, drawn chosen with the mode behind it', async ({house}) => {
    const group = house.root().locator('hp-climate-detail hp-climate-controls hp-seg').first();
    await expect(group.getByRole('radio')).toHaveText(['Off', 'Heat', 'Cool', 'Dry']);
    const more = group.getByRole('button', {name: /^More modes/});
    await expect(more).toHaveText('Auto');
    expect(await style(more, 'background-color')).toBe(await role(house, '--md-primary'));
    expect(await style(more, 'border-top-right-radius')).toBe('999px');
    await settled(house);
    await expect(house.page).toHaveScreenshot('material-button-group-overflow-phone-light-en.png', SHOT);
  });

  test('its menu is a surface-container with the chosen mode checked', async ({house}) => {
    const group = house.root().locator('hp-climate-detail hp-climate-controls hp-seg').first();
    await group.getByRole('button', {name: /^More modes/}).click();
    const menu = group.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitemradio')).toHaveText(['Fan', 'Auto', 'Eco']);
    expect(await style(menu, 'background-color')).toBe(await role(house, '--md-surface-container'));
    expect(await style(menu, 'border-top-left-radius')).toBe('4px');
    expect(await style(menu, 'box-shadow')).not.toBe('none');
    const chosen = menu.getByRole('menuitemradio', {checked: true});
    await expect(chosen).toHaveText('Auto');
    expect(await style(chosen, 'background-color')).toBe(await role(house, '--md-secondary-container'));
    await settled(house);
    await expect(house.page).toHaveScreenshot('material-button-group-overflow-menu-phone-light-en.png', SHOT);
  });
});
