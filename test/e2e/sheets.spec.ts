// The sheet host: which sheet is open, Escape, where focus goes back to, and the detail panels inline on a tablet. Spec:
// docs/specs/14-lit-shell.md, "The sheet host (step E)" and acceptance criterion 17; ADR 0021. Last, the kit's <hp-sheet> header.
// The panel is driven the way a person drives it (keys, taps, the screen's size) and the way an element drives the shell
// (the events of src/ui/events.ts, dispatched from inside the panel's root).
import {test, expect, tabletOnly, phoneOnly, type House} from './fixtures';
import {FULL_CFG, VIEWPORTS} from './houses';
import {OFFICE_ROW} from './lights';
import {openPopup} from './live';

test.use({houseOpts: {cfg: FULL_CFG}});

const energyTile = (house: House) =>
  house
    .root()
    .locator('#htiles')
    .getByRole('button', {name: /^Energy/});
const lightSheet = (house: House) => house.root().locator('#sh-light');
// Energy's detail is an element's sheet (#240): its panel (the ARIA dialog) is in the page only while the sheet is open
const energySheet = (house: House) => house.root().getByRole('dialog', {name: 'Home energy'});
const energyRegion = (house: House) => house.root().getByRole('region', {name: 'Home energy'});
const moreSheet = (house: House) => house.root().locator('hp-more-sheet .sheet');
const officeTile = (house: House) => house.root().locator(`${OFFICE_ROW}:visible`);

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
  expect(await focused(house)).toMatch(/^button\.lrow\[office\]$/);
});

test('Done hands focus back to the tile as well', async ({house}) => {
  await focusOfficeTile(house);
  await house.page.keyboard.press('Enter');
  await house.root().locator('#sh-light .ldone').click();
  await expect(lightSheet(house)).toBeHidden();
  expect(await focused(house)).toMatch(/^button\.lrow\[office\]$/);
});

test('on a tablet the energy tile shows the Energy pane with its panel inline, and opens no sheet over the page', async ({
  house,
}) => {
  tabletOnly();
  await energyTile(house).click();
  await expect(house.root().locator('#pane-energy')).toBeVisible();
  await expect(house.root().locator('hp-energy-pane hp-sheet')).toHaveCount(0); // a tablet draws no sheet for it
  const panel = house.root().locator('#pane-energy hp-energy-detail');
  await expect(panel).toBeVisible();
  await expect(energyRegion(house)).not.toHaveAttribute('aria-modal', /.*/);
  await expect(panel.locator('hp-pane-header [slot="sub"]')).not.toBeEmpty(); // the detail was drawn, inline
});

test('on a tablet a sheet asked for from an element shows its pane inline instead', async ({house}) => {
  tabletOnly();
  await dispatch(house, 'sheet-request', {id: 'energy.detail', detail: null});
  await expect(house.root().locator('#pane-energy')).toBeVisible();
  await expect(house.root().locator('#pane-energy hp-energy-detail')).toBeVisible();
});

test('on a phone the energy tile opens a sheet over the page, and Escape closes it and gives the tile its focus back', async ({
  house,
}) => {
  phoneOnly();
  await energyTile(house).focus();
  await house.page.keyboard.press('Enter');
  await expect(energySheet(house)).toBeVisible();
  await expect(energySheet(house)).toHaveAttribute('aria-modal', 'true');
  expect(await focused(house)).toBe('button.icon.close');
  await house.page.keyboard.press('Escape');
  await expect(energySheet(house)).toBeHidden();
  expect(await focused(house)).toBe('button.htile[energy]');
});

test('a tap on the scrim and the Close button close a phone sheet', async ({house}) => {
  phoneOnly();
  await energyTile(house).click();
  await expect(energySheet(house)).toBeVisible();
  const panel = (await energySheet(house).boundingBox())!;
  await house.page.mouse.click(VIEWPORTS.phone.width / 2, panel.y / 2); // above the panel, on the scrim
  await expect(energySheet(house)).toBeHidden();
  await energyTile(house).click();
  await energySheet(house).getByRole('button', {name: 'Close'}).click();
  await expect(energySheet(house)).toBeHidden();
});

test('Escape with the Status checks and a sheet both open closes the sheet first', async ({house}) => {
  await house.tab('lights');
  const popup = await openPopup(house);
  // asked for the way the tile asks, not by a key or a tap on it: either is a click, and a click elsewhere closes the popup by itself
  await dispatch(house, 'sheet-request', {id: 'lights.room', detail: {key: 'office'}});
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
  await dispatch(house, 'sheet-request', {id: 'lights.room', detail: {key: 'office'}});
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
  await dispatch(house, 'sheet-request', {id: 'energy.detail', detail: null});
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
  await expect(house.root().locator('hp-more-sheet hp-stat-tile')).toHaveCount(6); // the words under the sections were asked for
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

test('the shape changing from a tablet to a phone keeps the Car detail inline in the tab, under the phone’s header, and back', async ({
  house,
}) => {
  // Car's detail is an element's (#252): inline in the tab on a tablet and, since the Car rework, on a phone too (its sheet is the Home tile's); Energy's version is the fixme below, until #333
  tabletOnly();
  await house.tab('car');
  const detail = house.root().locator('#pane-car hp-car-detail');
  await expect(detail).toBeVisible();
  await house.page.setViewportSize(VIEWPORTS.phone);
  await expect(detail).toHaveCount(1);
  await expect(detail).toBeVisible();
  await expect(house.root().locator('#pane-car hp-car-pane hp-sheet.detail .sheet')).toBeHidden();
  await house.page.setViewportSize(VIEWPORTS.tablet);
  await expect(detail).toBeVisible();
  await expect(detail.locator('hp-pane-header [slot="sub"]')).not.toBeEmpty();
});

test('a phone sheet that is open when the screen becomes a tablet closes, and Escape then does nothing', async ({
  house,
}) => {
  // a light sheet: Energy's sheet holds charts, which throw NaN as the window changes under them (#333); the Energy version is the fixme below
  phoneOnly();
  await house.tab('lights');
  await officeTile(house).click();
  await expect(lightSheet(house)).toBeVisible();
  await house.page.setViewportSize(VIEWPORTS.tablet);
  await expect(lightSheet(house)).toBeHidden();
  await house.page.keyboard.press('Escape');
  await expect(house.root().locator('#pane-lights')).toBeVisible();
});

// Energy's detail, the element version of the two tests above: blocked by #333 (the library redraws a chart its pane has just removed and throws NaN)
test.fixme('Energy’s detail: a phone sheet open when the screen becomes a tablet closes, and the tablet shows it inline (#333)', async ({
  house,
}) => {
  phoneOnly();
  await energyTile(house).click();
  await expect(energySheet(house)).toBeVisible();
  await house.page.setViewportSize(VIEWPORTS.tablet);
  await expect(energySheet(house)).toBeHidden();
});

test.fixme('Energy’s detail moves from inline in the pane to the sheet when the screen becomes a phone, and back (#333)', async ({
  house,
}) => {
  tabletOnly();
  await house.tab('energy');
  const detail = house.root().locator('#pane-energy hp-energy-detail');
  await expect(detail).toBeVisible();
  await house.page.setViewportSize(VIEWPORTS.phone);
  await expect(detail).toHaveCount(0);
  await house.page.setViewportSize(VIEWPORTS.tablet);
  await expect(detail).toBeVisible();
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

// <hp-sheet>, mounted in the harness page the way a feature draws one: a sheet with no sub-line draws none, so its heading sits level
// with the badge, as the legacy card sheet's did (the Media sheets, #218); one with a sub-line shows it under the heading
test.describe('<hp-sheet>', () => {
  const mountSheet = (house: House, sub: string | null) =>
    house.page.evaluate(sub => {
      const sheet = Object.assign(document.createElement('hp-sheet'), {id: 'probe', heading: 'Probe', open: true});
      if (sub !== null) sheet.append(Object.assign(document.createElement('div'), {slot: 'sub', textContent: sub}));
      document.body.append(sheet);
    }, sub);
  // how far the heading's middle sits from the badge's, in pixels: the header centres its title block on the badge's row
  const offCentre = (house: House) =>
    house.page.locator('#probe').evaluate(sheet => {
      const middle = (el: Element) => {
        const box = el.getBoundingClientRect();
        return box.top + box.height / 2;
      };
      const header = sheet.shadowRoot!.querySelector('hp-pane-header')!;
      return Math.abs(
        middle(sheet.shadowRoot!.querySelector('h2')!) - middle(header.shadowRoot!.querySelector('.badge')!),
      );
    });

  test('with no sub-line draws none, so the heading sits level with the badge', async ({house}) => {
    await mountSheet(house, null);
    await expect(house.page.getByRole('dialog', {name: 'Probe'})).toBeVisible();
    expect(await offCentre(house)).toBeLessThan(0.5);
  });

  test('shows the sub-line it is given under the heading', async ({house}) => {
    await mountSheet(house, 'A line under it');
    // the line is slotted: the sheet's child, not its panel's
    await expect(house.page.locator('#probe').getByText('A line under it', {exact: true})).toBeVisible();
  });
});

// A sheet is `position: fixed` and covers the screen: no ancestor may become its containing block. The pane's entrance animation once kept an
// identity transform after it ended (`animation-fill-mode: both`), which trapped every sheet a phone tab opened in the pane's box (docs/apple-hig-audit-tabs-2026-11-17.md, finding 1).
test('on a phone a sheet opened from a tab covers the screen, its backdrop from top to bottom', async ({house}) => {
  phoneOnly();
  // the suite runs with Reduce Motion (playwright.config.ts), which has no entrance animation and so never had the bug: motion is on here, as on most phones
  await house.page.emulateMedia({reducedMotion: 'no-preference'});
  for (const [tab, room] of [
    ['climate', 'Bedroom'],
    ['lights', 'Kitchen'],
  ] as const) {
    await house.tab(tab);
    await house.root().locator(`#pane-${tab}`).getByText(room).first().click();
    const sheet = house.root().locator(`#pane-${tab} .sheet`).filter({visible: true}).first();
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    const viewport = house.page.viewportSize()!;
    expect(box, `${tab}: the sheet's backdrop`).toMatchObject({
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    });
    await house.page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  }
});
