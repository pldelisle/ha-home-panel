// Appearance: theme, glass, text size, the page's background and the live class, which the shell owns (spec 14, step D).
// Everything is driven as a person drives it: the gear and its popup, the device's own setting, a new hass from Home Assistant,
// a touch, time passing. What is read back is what the frame shows: attributes and classes on `.app`, custom properties, the page.
import type {Page} from '@playwright/test';
import {test, expect, tabletOnly, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});

const app = (house: House) => house.root().locator('.app');
const popup = (house: House) => house.root().locator('hp-settings-popup');
// the popup is where a person changes a setting; the clicks are dispatched because on the phone the bar covers part of it
async function choose(house: House, selector: string) {
  const pop = house.root().locator('#setpop');
  if (await pop.isHidden()) await house.root().locator('#gear').click();
  await expect(pop).toBeVisible();
  await popup(house).locator(selector).dispatchEvent('click');
}
const pageBackground = (page: Page) =>
  page.evaluate(() => ({
    html: document.documentElement.style.backgroundColor,
    body: document.body.style.backgroundColor,
  }));

test('the popup switches between dark and light, and the choice stays', async ({house}) => {
  await expect(app(house)).toHaveAttribute('data-theme', 'light');
  await choose(house, '[data-th="toggle"]');
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await expect(popup(house).locator('[data-th="toggle"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await house.page.evaluate(() => localStorage.getItem('home-panel-theme'))).toBe('dark');
  await choose(house, '[data-th="toggle"]');
  await expect(app(house)).toHaveAttribute('data-theme', 'light');
  await expect(popup(house).locator('[data-th="toggle"]')).toHaveAttribute('aria-pressed', 'false');
});

// Auto is the device's own light or dark setting (`prefers-color-scheme`), as it changes. The sun has no part in the
// theme; it still picks the Sky wallpaper.
test.describe('the theme on auto', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, theme: 'auto', colorScheme: 'light'}});

  test('follows the device as it changes, light to dark and back', async ({house}) => {
    await expect(app(house)).toHaveAttribute('data-theme', 'light');
    await house.page.emulateMedia({colorScheme: 'dark'});
    await expect(app(house)).toHaveAttribute('data-theme', 'dark');
    await house.page.emulateMedia({colorScheme: 'light'});
    await expect(app(house)).toHaveAttribute('data-theme', 'light');
  });

  test('stays light at night on a light device, and the sun changes nothing', async ({house}) => {
    await house.setState('sun.sun', {state: 'below_horizon'});
    await expect(app(house)).toHaveAttribute('data-theme', 'light');
    await house.setState('sun.sun', {state: 'above_horizon'});
    await expect(app(house)).toHaveAttribute('data-theme', 'light');
  });

  test('stays dark by day on a dark device', async ({house}) => {
    await house.page.emulateMedia({colorScheme: 'dark'});
    await expect(app(house)).toHaveAttribute('data-theme', 'dark');
    await house.setState('sun.sun', {state: 'above_horizon'});
    await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  });

  test('leaves an open settings popup open and showing the theme in force when the device flips', async ({house}) => {
    await choose(house, '[data-th="auto"]');
    const toggle = popup(house).locator('[data-th="toggle"]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await house.page.emulateMedia({colorScheme: 'dark'});
    await expect(app(house)).toHaveAttribute('data-theme', 'dark');
    await expect(house.root().locator('#setpop')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle.locator('b')).toHaveText('Dark');
    await house.page.emulateMedia({colorScheme: 'light'});
    await expect(toggle.locator('b')).toHaveText('Light');
  });

  test('is changed while the panel is off the page: the new setting is there when it returns', async ({house}) => {
    await house.page.evaluate(() => {
      const panel = document.querySelector('home-panel')!;
      (window as unknown as {parked: Element}).parked = panel;
      panel.remove();
      localStorage.setItem('home-panel-theme', 'dark');
    });
    await house.page.evaluate(() => document.body.append((window as unknown as {parked: Element}).parked));
    await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  });

  test('is changed by the device while the panel is off the page: the new scheme is there when it returns', async ({
    house,
  }) => {
    await house.page.evaluate(() => {
      const panel = document.querySelector('home-panel')!;
      (window as unknown as {parked: Element}).parked = panel;
      panel.remove();
    });
    await house.page.emulateMedia({colorScheme: 'dark'});
    await house.page.evaluate(() => document.body.append((window as unknown as {parked: Element}).parked));
    await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  });

  test('is changed by the screen while the panel is off the page: the phone shape is there when it returns', async ({
    house,
  }) => {
    tabletOnly();
    await expect(app(house)).not.toHaveClass(/\bcp\b/);
    await house.page.evaluate(() => {
      const panel = document.querySelector('home-panel')!;
      (window as unknown as {parked: Element}).parked = panel;
      panel.remove();
    });
    await house.page.setViewportSize({width: 393, height: 852});
    await house.page.evaluate(() => document.body.append((window as unknown as {parked: Element}).parked));
    await expect(app(house)).toHaveClass(/\bcp\b/);
  });
});

test.describe('an explicit theme', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, theme: 'light', colorScheme: 'dark'}});

  test('Light stays light on a dark device', async ({house}) => {
    await expect(app(house)).toHaveAttribute('data-theme', 'light');
    await house.page.emulateMedia({colorScheme: 'light'});
    await house.page.emulateMedia({colorScheme: 'dark'});
    await expect(app(house)).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('an explicit dark theme', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, theme: 'dark', colorScheme: 'light'}});

  test('Dark stays dark on a light device, by day or by night', async ({house}) => {
    await expect(app(house)).toHaveAttribute('data-theme', 'dark');
    await house.setState('sun.sun', {state: 'above_horizon'});
    await house.page.emulateMedia({colorScheme: 'dark'});
    await house.page.emulateMedia({colorScheme: 'light'});
    await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  });
});

// The first theme the frame ever shows is the device's: a panel that opened light and turned dark a moment later would
// flash. A MutationObserver on the panel's root, hooked before the page loads as property-order.spec hooks `attachShadow`,
// records each value `data-theme` takes.
const RECORD_THEMES = () => {
  const themes: string[] = [];
  (window as unknown as {themes: string[]}).themes = themes;
  const attach = Object.getOwnPropertyDescriptor(Element.prototype, 'attachShadow')!.value as Element['attachShadow'];
  Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
    const root = attach.call(this, init);
    if (this.localName === 'home-panel')
      new MutationObserver(() => {
        const theme = root.getElementById('app')?.dataset.theme;
        if (theme && themes.at(-1) !== theme) themes.push(theme);
      }).observe(root, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-theme']});
    return root;
  };
};

// At night, when the sun is below the horizon: under the old rule a light device on Auto opened light and turned dark.
const NIGHT = '2026-11-07T22:00:00-05:00';

test.describe('the first theme shown', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: NIGHT, theme: 'auto'}});

  for (const scheme of ['dark', 'light'] as const)
    test(`on auto at night with a ${scheme} device is ${scheme}, with no flash of the other`, async ({house}) => {
      await house.page.addInitScript(RECORD_THEMES);
      await house.page.emulateMedia({colorScheme: scheme});
      await house.page.reload();
      await expect(app(house)).toHaveAttribute('data-theme', scheme);
      const night = await house.page.evaluate(
        () => (window as unknown as {hass: {states: Record<string, {state: string}>}}).hass.states['sun.sun'].state,
      );
      expect(night, 'the sun is down in the house').toBe('below_horizon');
      expect(await house.page.evaluate(() => (window as unknown as {themes: string[]}).themes)).toEqual([scheme]);
    });
});

test('a redraw of the guest keeps the theme: the language changes and the panel is still dark', async ({house}) => {
  await choose(house, '[data-th="toggle"]');
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await house.setLanguage('fr');
  await expect(house.root().locator('#hello')).not.toBeEmpty();
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await expect(app(house)).toHaveAttribute('lang', /^fr/);
});

test('the page takes the colour of the wallpaper in force: it changes with the theme', async ({house}) => {
  // the wallpaper's base colour as the page would show it, which the browser normalises the same way for both reads
  const wallpaperBase = () =>
    house.page.evaluate(() => {
      const panel = document.querySelector('home-panel')!;
      const base = getComputedStyle(panel.shadowRoot!.getElementById('app')!).getPropertyValue('--wbase').trim();
      const probe = document.createElement('i');
      probe.style.backgroundColor = base;
      return {base: probe.style.backgroundColor, html: document.documentElement.style.backgroundColor};
    });
  const light = await wallpaperBase();
  expect(light.base).not.toBe('');
  expect(light.html).toBe(light.base);
  await choose(house, '[data-th="toggle"]');
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => (await wallpaperBase()).html === (await wallpaperBase()).base).toBe(true);
  const dark = await wallpaperBase();
  expect(dark.base).not.toBe(light.base);
});

// Playwright cannot emulate prefers-reduced-transparency, so the lens's yielding to it is not tested here. The lens is
// Chromium's (WebKit drops a url() filter inside backdrop-filter), and the harness runs Chromium.
test('the glass lens (mc) goes with the glass: present with a wallpaper, gone with None', async ({
  house,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the lens is Chromium only');
  await expect(app(house)).toHaveClass(/\bgl\b/);
  await expect(app(house)).toHaveClass(/\bmc\b/);
  await choose(house, '[data-gl="none"]');
  await expect(app(house)).not.toHaveClass(/\bmc\b/);
  await choose(house, '[data-gl="lake"]');
  await expect(app(house)).toHaveClass(/\bmc\b/);
});

test('the glass choices set the wallpaper and the glass class; None takes both away', async ({house}) => {
  await expect(app(house)).toHaveClass(/\bgl\b/); // Dawn is the default
  await expect(app(house)).toHaveAttribute('data-wp', 'dawn');
  await choose(house, '[data-gl="lake"]');
  await expect(app(house)).toHaveAttribute('data-wp', 'lake');
  await choose(house, '[data-gl="none"]');
  await expect(app(house)).not.toHaveClass(/\bgl\b/);
  await expect(app(house)).not.toHaveAttribute('data-wp', /.*/);
});

test('the transparency slider sets how dense the glass is', async ({house}) => {
  await choose(house, '[data-gl="lake"]');
  await popup(house).locator('.gtrange').fill('0');
  await expect(app(house)).toHaveCSS('--g-m', '1.800');
  await popup(house).locator('.gtrange').fill('100');
  await expect(app(house)).toHaveCSS('--g-m', '0.200');
  expect(await house.page.evaluate(() => localStorage.getItem('home-panel-glass-t'))).toBe('100');
});

test('Sky shows Lake by day and Meadow in the rain', async ({house}) => {
  await choose(house, '[data-gl="sky"]');
  await expect(app(house)).toHaveAttribute('data-wp', 'lake');
  await house.setState('weather.springfield_forecast', {state: 'rainy'});
  await expect(app(house)).toHaveAttribute('data-wp', 'meadow');
  await house.setState('weather.springfield_forecast', {state: 'sunny'});
  await expect(app(house)).toHaveAttribute('data-wp', 'lake');
});

test('Sky turns to Ember in the last hour of daylight with no change in the house', async ({house}) => {
  await choose(house, '[data-gl="sky"]');
  await expect(app(house)).toHaveAttribute('data-wp', 'lake');
  // two and a half hours later, 16:30 in the house's zone, is inside the last hour before sunset; the panel looks at the clock again each minute
  await house.clock.fastForward(2.5 * 60 * 60_000);
  await expect(app(house)).toHaveAttribute('data-wp', 'ember');
});

test('the text sizes scale the type, and Larger marks the frame as large text', async ({house}) => {
  await expect(app(house)).toHaveCSS('--tx', '1.000');
  await choose(house, '[data-tx="larger"]');
  await expect(app(house)).toHaveCSS('--tx', '1.300');
  await expect(app(house)).toHaveClass(/\btxl\b/);
  await choose(house, '[data-tx="smaller"]');
  await expect(app(house)).toHaveCSS('--tx', '0.900');
  await expect(app(house)).not.toHaveClass(/\btxl\b/);
  await choose(house, '[data-tx="auto"]');
  await expect(app(house)).toHaveCSS('--tx', '1.000'); // the probe reads the default body size
});

test('the page behind the panel takes the wallpaper colour with glass on and gives it back with glass off', async ({
  house,
}) => {
  await expect.poll(() => pageBackground(house.page)).toMatchObject({html: expect.stringMatching(/.+/)});
  expect((await pageBackground(house.page)).body).not.toBe('');
  await choose(house, '[data-gl="none"]');
  await expect.poll(() => pageBackground(house.page)).toEqual({html: '', body: ''});
});

test('the page gets its own colour back when the panel leaves the page, and the wallpaper when it returns', async ({
  house,
}) => {
  await expect.poll(() => pageBackground(house.page)).toMatchObject({html: expect.stringMatching(/.+/)});
  await house.page.evaluate(() => {
    const panel = document.querySelector('home-panel')!;
    (window as unknown as {parked: Element}).parked = panel;
    panel.remove();
  });
  expect(await pageBackground(house.page)).toEqual({html: '', body: ''});
  await house.page.evaluate(() => document.body.append((window as unknown as {parked: Element}).parked));
  await expect.poll(() => pageBackground(house.page)).toMatchObject({html: expect.stringMatching(/.+/)});
});

test('a touch marks the frame live for a minute', async ({house}) => {
  await expect(app(house)).not.toHaveClass(/\blive\b/);
  await house.root().locator('#rail').dispatchEvent('pointerdown');
  await expect(app(house)).toHaveClass(/\blive\b/);
  await house.clock.runFor(50_000);
  await expect(app(house)).toHaveClass(/\blive\b/);
  await house.root().locator('#rail').dispatchEvent('pointerdown'); // a second touch starts the minute again
  await house.clock.runFor(50_000);
  await expect(app(house)).toHaveClass(/\blive\b/);
  await house.clock.runFor(11_000);
  await expect(app(house)).not.toHaveClass(/\blive\b/);
});
