// The sheet host: which sheet is open, Escape, where focus goes back to, and the detail panels inline on a tablet. Spec:
// docs/specs/14-lit-shell.md, "The sheet host (step E)" and acceptance criterion 17; ADR 0021.
// The panel is driven the way a person drives it (keys, taps, the screen's size) and the way an element drives the shell
// (the events of src/ui/events.ts, dispatched from inside the panel's root).
import {test, expect, tabletOnly, phoneOnly, type House} from './fixtures';
import {FULL_CFG, VIEWPORTS} from './houses';
import {OFFICE_TILE} from './lights';
import {openPopup} from './live';

test.use({houseOpts: {cfg: FULL_CFG}});

const energyTile = (house: House) =>
  house
    .root()
    .locator('#htiles')
    .getByRole('button', {name: /^Energy/});
const lightSheet = (house: House) => house.root().locator('#sh-light');
const energySheet = (house: House) => house.root().locator('#sh-energy');
const moreSheet = (house: House) => house.root().locator('hp-more-sheet .sheet');
const officeTile = (house: House) => house.root().locator(`${OFFICE_TILE}:visible`);

// the element that has focus, through every shadow root, as the tag, the class and the id or data attribute that name it
const focused = (house: House) =>
  house.page.evaluate(() => {
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    if (!el) return '';
    const data = el.getAttribute('data-lsheet') ?? el.getAttribute('data-pane') ?? '';
    return `${el.localName}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].join('.') : ''}${data ? `[${data}]` : ''}`;
  });

// what an element does to ask upward: dispatch an event from itself, composed so that it leaves its shadow root
const dispatch = (house: House, type: string, detail: object) =>
  house
    .root()
    .evaluate(
      (panel, [type, detail]) =>
        panel
          .shadowRoot!.querySelector('#hello')!
          .dispatchEvent(new CustomEvent(type, {bubbles: true, composed: true, detail})),
      [type, detail] as const,
    );

/** the Lights tab, and the Office tile focused as a keyboard would leave it after Tab */
const focusOfficeTile = async (house: House) => {
  await house.tab('lights');
  await officeTile(house).focus();
};

test('Enter on a tile opens the light sheet, Close takes focus, and Escape hands focus back to the tile', async ({
  house,
}) => {
  await focusOfficeTile(house);
  await house.page.keyboard.press('Enter');
  await expect(lightSheet(house)).toBeVisible();
  expect(await focused(house)).toBe('button.close.ldone');
  await house.page.keyboard.press('Escape');
  await expect(lightSheet(house)).toBeHidden();
  expect(await focused(house)).toMatch(/^div\.lcell.*\[office\]$/);
});

test('Done hands focus back to the tile as well', async ({house}) => {
  await focusOfficeTile(house);
  await house.page.keyboard.press('Enter');
  await house.root().locator('#sh-light .ldone').click();
  await expect(lightSheet(house)).toBeHidden();
  expect(await focused(house)).toMatch(/^div\.lcell.*\[office\]$/);
});

test('on a tablet the energy tile shows the Energy pane with its panel inline, and opens no sheet over the page', async ({
  house,
}) => {
  tabletOnly();
  await energyTile(house).click();
  await expect(house.root().locator('#pane-energy')).toBeVisible();
  await expect(energySheet(house)).toBeHidden();
  const panel = house.root().locator('#pane-energy #ehost > .panel');
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute('aria-modal', /.*/);
  await expect(panel.locator('#esub')).not.toBeEmpty(); // the sheet's content was built, inline
});

test('on a tablet a sheet asked for from an element shows its pane inline instead', async ({house}) => {
  tabletOnly();
  await dispatch(house, 'sheet-request', {id: 'sh-energy', detail: null});
  await expect(house.root().locator('#pane-energy')).toBeVisible();
  await expect(energySheet(house)).toBeHidden();
  await expect(house.root().locator('#ehost > .panel')).toBeVisible();
});

test('on a phone the energy tile opens a sheet over the page, and Escape closes it and gives the tile its focus back', async ({
  house,
}) => {
  phoneOnly();
  await energyTile(house).focus();
  await house.page.keyboard.press('Enter');
  await expect(energySheet(house)).toBeVisible();
  const panel = energySheet(house).locator('> .panel');
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  expect(await focused(house)).toBe('button.icon.close');
  await house.page.keyboard.press('Escape');
  await expect(energySheet(house)).toBeHidden();
  expect(await focused(house)).toBe('button.htile[energy]');
});

test('a tap on the scrim and the Close button close a phone sheet', async ({house}) => {
  phoneOnly();
  await energyTile(house).click();
  await expect(energySheet(house)).toBeVisible();
  const panel = (await energySheet(house).locator('> .panel').boundingBox())!;
  await house.page.mouse.click(VIEWPORTS.phone.width / 2, panel.y / 2); // above the panel, on the scrim
  await expect(energySheet(house)).toBeHidden();
  await energyTile(house).click();
  await energySheet(house).locator('.close').click();
  await expect(energySheet(house)).toBeHidden();
});

test('Escape with the Status checks and a sheet both open closes the sheet first', async ({house}) => {
  await house.tab('lights');
  const popup = await openPopup(house);
  await officeTile(house).focus();
  await house.page.keyboard.press('Enter'); // a key, not a tap: a tap elsewhere would close the popup by itself
  await expect(lightSheet(house)).toBeVisible();
  await expect(popup).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(lightSheet(house)).toBeHidden();
  await expect(popup).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
});

test('Escape with the settings popup and a sheet both open closes the sheet first', async ({house}) => {
  await house.tab('lights');
  await house.root().locator('#gear').click();
  const popup = house.root().locator('#setpop');
  await expect(popup).toBeVisible();
  await officeTile(house).focus();
  await house.page.keyboard.press('Enter');
  await expect(lightSheet(house)).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(lightSheet(house)).toBeHidden();
  await expect(popup).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
});

test('a sheet asked for from an element closes More first: one Escape closes one sheet', async ({house}) => {
  phoneOnly();
  await house.root().locator('#moretab').click();
  await expect(moreSheet(house)).toBeVisible();
  await dispatch(house, 'sheet-request', {id: 'sh-energy', detail: null});
  await expect(energySheet(house)).toBeVisible();
  await expect(moreSheet(house)).toBeHidden();
  await house.page.keyboard.press('Escape');
  await expect(energySheet(house)).toBeHidden();
  await expect(moreSheet(house)).toBeHidden(); // it was not waiting underneath
});

test('More asked for from an element closes the sheet that is open', async ({house}) => {
  phoneOnly();
  await energyTile(house).click();
  await expect(energySheet(house)).toBeVisible();
  await dispatch(house, 'sheet-request', {id: 'shell.more', detail: null});
  await expect(moreSheet(house)).toBeVisible();
  await expect(energySheet(house)).toBeHidden();
  await expect(moreSheet(house).locator('hp-stat-tile')).toHaveCount(6); // the words under the sections were asked for
});

test('a toast asked for from an element shows, and a sticky one stays until it is tapped', async ({house}) => {
  await dispatch(house, 'toast', {message: 'Saved', sticky: false});
  const toast = house.root().locator('#toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('Saved');
  await expect(toast).not.toHaveClass(/\berr\b/);
  await dispatch(house, 'toast', {message: 'It did not work', sticky: true});
  await expect(toast).toHaveClass(/\berr\b/);
  await expect(toast).toContainText('It did not work');
});

test('the shape changing from a tablet to a phone moves the open pane’s panel into its sheet, and back', async ({
  house,
}) => {
  tabletOnly();
  await house.tab('energy');
  const inline = house.root().locator('#ehost > .panel');
  await expect(inline).toBeVisible();
  await house.page.setViewportSize(VIEWPORTS.phone);
  await expect(inline).toHaveCount(0);
  await expect(energySheet(house).locator('> .panel')).toHaveAttribute('aria-modal', 'true');
  await expect(energySheet(house)).toBeHidden();
  await house.page.setViewportSize(VIEWPORTS.tablet);
  await expect(inline).toBeVisible();
  await expect(inline).not.toHaveAttribute('aria-modal', /.*/);
  await expect(inline.locator('#esub')).not.toBeEmpty();
});

test('a phone sheet that is open when the screen becomes a tablet closes, and Escape then does nothing', async ({
  house,
}) => {
  phoneOnly();
  await energyTile(house).click();
  await expect(energySheet(house)).toBeVisible();
  await house.page.setViewportSize(VIEWPORTS.tablet);
  await expect(energySheet(house)).toBeHidden();
  await house.page.keyboard.press('Escape');
  await expect(house.root().locator('#pane-home')).toBeVisible();
});

test('a sheet that is open when the panel is moved in the page still closes on Escape', async ({house}) => {
  await focusOfficeTile(house);
  await house.page.keyboard.press('Enter');
  await expect(lightSheet(house)).toBeVisible();
  await house.page.evaluate(() => {
    const p = (window as unknown as {panel: HTMLElement}).panel;
    const next = p.nextSibling;
    p.remove();
    document.body.insertBefore(p, next);
  });
  await expect(lightSheet(house)).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(lightSheet(house)).toBeHidden();
});

test('Escape does nothing, once, when the panel is off the page', async ({house}) => {
  await focusOfficeTile(house);
  await house.page.keyboard.press('Enter');
  await expect(lightSheet(house)).toBeVisible();
  await house.page.evaluate(() => {
    const p = (window as unknown as {panel: HTMLElement}).panel;
    (window as unknown as {park: HTMLElement}).park = p;
    p.remove();
  });
  await house.page.keyboard.press('Escape');
  await house.page.evaluate(() => document.body.append((window as unknown as {park: HTMLElement}).park));
  await expect(lightSheet(house)).toBeVisible(); // the key was not heard while the panel was away
  await house.page.keyboard.press('Escape');
  await expect(lightSheet(house)).toBeHidden();
});
