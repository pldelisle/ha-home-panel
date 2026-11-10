// The phone's More sheet: what a person does with it. Spec: docs/specs/14-lit-shell.md, "The registry and the frame" (the More
// sheet) and acceptance criterion 9; the sheet is `<hp-more-sheet>`, an element of the shell with its own shadow root (ADR 0019).
// It is a phone sheet: the tablet's rail holds every section, so there is no More button there.
import {test, expect, phoneOnly, type House} from './fixtures';
import {FULL_CFG, VIEWPORTS} from './houses';

test.use({houseOpts: {cfg: FULL_CFG}});
test.beforeEach(() => phoneOnly());

const sheet = (house: House) => house.root().locator('hp-more-sheet').getByRole('dialog');
const moreTab = (house: House) => house.root().locator('#moretab');
const tiles = (house: House) => house.root().locator('#morelist hp-stat-tile');
const tile = (house: House, key: string) => house.root().locator(`#morelist hp-stat-tile[key="${key}"]`);
const focused = (house: House) =>
  house.page.evaluate(() => {
    // the focused element, through every shadow root down to the element itself
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el
      ? `${el.localName}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`
      : '';
  });

test('opening More lists the six sections the bar does not hold, with the word each has to say', async ({house}) => {
  await moreTab(house).click();
  await expect(sheet(house)).toBeVisible();
  await expect(tiles(house)).toHaveCount(6);
  expect(await tiles(house).evaluateAll(l => l.map(e => e.getAttribute('key')))).toEqual([
    'weather',
    'energy',
    'air',
    'media',
    'cams',
    'auto',
  ]);
  await expect(tile(house, 'energy').locator('small')).toHaveText(/kW/);
});

test('a closed More draws no tiles: they exist only while the sheet is open', async ({house}) => {
  await expect(tiles(house)).toHaveCount(0);
  await moreTab(house).click();
  await expect(tiles(house)).toHaveCount(6);
  await house.page.keyboard.press('Escape');
  await expect(tiles(house)).toHaveCount(0);
});

test('Close takes focus when More opens, and Escape closes it and hands focus back to the More tab', async ({
  house,
}) => {
  await moreTab(house).focus();
  await moreTab(house).press('Enter');
  await expect(sheet(house)).toBeVisible();
  expect(await focused(house)).toBe('button.icon.close');
  await house.page.keyboard.press('Escape');
  await expect(sheet(house)).toBeHidden();
  expect(await focused(house)).toBe('button#moretab.rtab.rmore');
});

test('the Close button and a tap on the backdrop close it', async ({house}) => {
  await moreTab(house).click();
  await house.root().locator('hp-more-sheet').getByRole('button', {name: 'Close', exact: true}).click();
  await expect(sheet(house)).toBeHidden();
  await moreTab(house).click();
  await expect(sheet(house)).toBeVisible();
  await house.page.mouse.click(196, 40); // above the sheet, on the scrim
  await expect(sheet(house)).toBeHidden();
});

test('a tile closes More and shows its section; coming back, that tile carries the ring', async ({house}) => {
  await moreTab(house).click();
  await tile(house, 'weather').locator('button').click();
  await expect(sheet(house)).toBeHidden();
  await expect(house.root().locator('#pane-weather')).toBeVisible();
  await expect(moreTab(house)).toHaveAttribute('aria-selected', 'true');
  await moreTab(house).click();
  await expect(sheet(house)).toBeVisible();
  await expect(tile(house, 'weather').locator('button')).toHaveClass(/\bsel\b/);
  await expect(tile(house, 'energy').locator('button')).not.toHaveClass(/\bsel\b/);
});

test('a tile takes keyboard focus and Enter opens its section', async ({house}) => {
  await moreTab(house).click();
  await tile(house, 'air').locator('button').focus();
  await house.page.keyboard.press('Enter');
  await expect(house.root().locator('#pane-air')).toBeVisible();
  await expect(sheet(house)).toBeHidden();
});

test('dragging the grabber down closes the sheet, and a short drag springs back', async ({house}) => {
  await moreTab(house).click();
  const grab = house.root().locator('hp-more-sheet .grab');
  await expect(grab).toBeVisible();
  const g = (await grab.boundingBox())!;
  const x = g.x + g.width / 2;
  const y = g.y + g.height / 2;
  await house.page.mouse.move(x, y);
  await house.page.mouse.down();
  await house.page.mouse.move(x, y + 30, {steps: 4});
  await house.page.mouse.up();
  await expect(sheet(house)).toBeVisible();
  await house.page.mouse.move(x, y);
  await house.page.mouse.down();
  await house.page.mouse.move(x, y + 200, {steps: 8});
  await house.page.mouse.up();
  await expect(sheet(house)).toBeHidden();
});

test('More is a phone sheet: when the shape leaves the phone it closes', async ({house}) => {
  await moreTab(house).click();
  await expect(sheet(house)).toBeVisible();
  await house.page.setViewportSize(VIEWPORTS.tablet);
  await expect(house.root().locator('hp-more-sheet .sheet')).toBeHidden();
  expect(await focused(house)).not.toBe('button.icon.close');
});

test('a sheet that is open when the panel is moved in the page still closes on Escape', async ({house}) => {
  await moreTab(house).click();
  await expect(sheet(house)).toBeVisible();
  await house.page.evaluate(() => {
    const p = (window as unknown as {panel: HTMLElement}).panel;
    const next = p.nextSibling;
    p.remove();
    document.body.insertBefore(p, next);
  });
  await expect(sheet(house)).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(house.root().locator('hp-more-sheet .sheet')).toBeHidden();
});

test('a new language closes the sheet, as the redraw of the panel always did', async ({house}) => {
  await moreTab(house).click();
  await expect(sheet(house)).toBeVisible();
  await house.setLanguage('fr');
  await expect(house.root().locator('hp-more-sheet .sheet')).toBeHidden();
  await moreTab(house).click();
  await expect(house.root().locator('hp-more-sheet').getByRole('dialog', {name: 'Plus'})).toBeVisible();
});

test.describe('in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, lang: 'fr'}});

  test('its title, its line, its Close button and the words under the sections are French', async ({house}) => {
    await moreTab(house).click();
    await expect(house.root().locator('hp-more-sheet').getByRole('dialog', {name: 'Plus'})).toBeVisible();
    await expect(house.root().locator('hp-more-sheet .sub')).toHaveText('Toutes les sections');
    await expect(
      house.root().locator('hp-more-sheet').getByRole('button', {name: 'Fermer', exact: true}),
    ).toBeVisible();
    await expect(tile(house, 'cams').locator('b')).toHaveText('Sécurité');
    await expect(tile(house, 'cams').locator('small')).toHaveText('Portes fermées · mouvement en cours');
  });
});
