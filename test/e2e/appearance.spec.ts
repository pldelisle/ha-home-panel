// Appearance: theme, glass, text size, the page's background and the live class, which the shell owns (spec 14, step D).
// Everything is driven as a person drives it: the gear and its popup, the device's own setting, a new hass from Home Assistant,
// a touch, time passing. What is read back is what the frame shows: attributes and classes on `.app`, custom properties, the page.
import type {Page} from '@playwright/test';
import {test, expect, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';

test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});

const app = (house: House) => house.root().locator('.app');
const popup = (house: House) => house.root().locator('#setc');
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

test('on auto the theme follows the sun: dark below the horizon, light above it', async ({house}) => {
  await choose(house, '[data-th="auto"]');
  await expect(app(house)).toHaveAttribute('data-theme', 'light');
  await house.setState('sun.sun', {state: 'below_horizon'});
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await house.setState('sun.sun', {state: 'above_horizon'});
  await expect(app(house)).toHaveAttribute('data-theme', 'light');
});

test('a dark choice holds when the sun is up, and a light choice when it is down', async ({house}) => {
  await choose(house, '[data-th="toggle"]');
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await house.setState('sun.sun', {state: 'above_horizon'});
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await choose(house, '[data-th="toggle"]');
  await house.setState('sun.sun', {state: 'below_horizon'});
  await expect(app(house)).toHaveAttribute('data-theme', 'light');
});

test('on auto the theme follows the device too', async ({house}) => {
  await choose(house, '[data-th="auto"]');
  await house.page.emulateMedia({colorScheme: 'dark'});
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await house.page.emulateMedia({colorScheme: 'light'});
  await expect(app(house)).toHaveAttribute('data-theme', 'light');
});

test('a theme that follows the sun at dusk leaves an open settings popup open and showing the new theme', async ({
  house,
}) => {
  await choose(house, '[data-th="auto"]');
  await expect(house.root().locator('#setpop')).toBeVisible();
  await house.setState('sun.sun', {state: 'below_horizon'});
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await expect(house.root().locator('#setpop')).toBeVisible();
  await expect(popup(house).locator('[data-th="toggle"]')).toHaveAttribute('aria-pressed', 'true');
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
