// The settings popup behind the gear, `<hp-settings-popup>` (spec 14, step D): what a person sees and does with it, in English and
// in French. Everything is driven as a person drives it: the gear, the buttons, the range, Escape, a tap elsewhere. What is read back
// is what the screen shows (text, roles, states) and what the settings kept (localStorage, the frame's attributes).
import {test, expect, isPhone, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';
import {openFrontDoor, openPopup, stopCharging} from './live';
import {backToModules, openSubmenu, setTextSize, setTheme} from './settings-controls';

test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});

const gear = (house: House) => house.root().locator('#gear');
const pop = (house: House) => house.root().locator('#setpop');
const popup = (house: House) => house.root().locator('hp-settings-popup');
const app = (house: House) => house.root().locator('.app');
const stored = (house: House, key: string) => house.page.evaluate(k => localStorage.getItem(k), key);

async function open(house: House) {
  await gear(house).click();
  await expect(pop(house)).toBeVisible();
}

test('the gear opens the popup and closes it, and says which', async ({house}) => {
  await expect(pop(house)).toBeHidden();
  await expect(gear(house)).toHaveAttribute('aria-expanded', 'false');
  await gear(house).click();
  await expect(pop(house)).toBeVisible();
  await expect(gear(house)).toHaveAttribute('aria-expanded', 'true');
  await gear(house).click();
  await expect(pop(house)).toBeHidden();
  await expect(gear(house)).toHaveAttribute('aria-expanded', 'false');
});

test('Escape closes the popup, and so does a tap anywhere else', async ({house}) => {
  await open(house);
  await house.page.keyboard.press('Escape');
  await expect(pop(house)).toBeHidden();
  await expect(gear(house)).toHaveAttribute('aria-expanded', 'false');
  await open(house);
  await house.root().locator('#hello').click();
  await expect(pop(house)).toBeHidden();
  await open(house);
  await popup(house).locator('.ccv').click(); // a tap inside it leaves it open
  await expect(pop(house)).toBeVisible();
});

// Escape closes what was opened last of the three, in the guest's order: a sheet, the Status checks, then this popup
test('Escape closes the Status checks first and the popup after', async ({house}) => {
  await stopCharging(house);
  await openFrontDoor(house);
  await open(house);
  await openPopup(house);
  await expect(pop(house)).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(house.root().locator('#attpop')).toBeHidden();
  await expect(pop(house)).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(pop(house)).toBeHidden();
});

test('lists the eight glasses as swatches in the Glass module, in order, each saying which is chosen', async ({
  house,
}) => {
  await open(house);
  const glasses = popup(house).getByRole('radiogroup', {name: 'Glass'}).getByRole('radio');
  await expect(glasses).toHaveText(['None', 'Dawn', 'Lake', 'Meadow', 'Ember', 'Aurora', 'Sand', 'Sky']);
  await expect(glasses.nth(1)).toBeChecked(); // Dawn is the default
  await expect(glasses.nth(2)).not.toBeChecked();
  await expect(popup(house).getByRole('slider', {name: 'Transparency'})).toHaveValue('50');
});

test('the modules: Appearance and Text size pills, the Sleep now and Design buttons, and the Glass module, each with a name', async ({
  house,
}) => {
  await open(house);
  await expect(popup(house).locator('[data-open="appearance"]')).toContainText('Appearance');
  await expect(popup(house).locator('[data-open="appearance"]')).toContainText('Light');
  await expect(popup(house).locator('[data-open="text"]')).toContainText('Text size');
  await expect(popup(house).locator('[data-open="text"]')).toContainText('Auto');
  await expect(popup(house).getByRole('button', {name: 'Sleep now'})).toHaveAttribute('title', 'Sleep now');
  await expect(popup(house).getByRole('button', {name: 'Design'})).toHaveAttribute('title', 'Design');
  await expect(popup(house).locator('[data-open="glass"]')).toContainText('Glass');
});

test('a choice is kept, applied and shown by the popup', async ({house}) => {
  await open(house);
  await setTextSize(house, 'larger');
  expect(await stored(house, 'home-panel-text')).toBe('larger');
  await expect(popup(house).locator('[data-open="text"]')).toContainText('Larger');
  await expect(app(house)).toHaveClass(/\btxl\b/);
  const lake = popup(house).locator('[data-gl="lake"]');
  await lake.click();
  expect(await stored(house, 'home-panel-glass')).toBe('lake');
  await expect(lake).toBeChecked();
  await expect(popup(house).locator('[data-gl="dawn"]')).not.toBeChecked();
  const range = popup(house).getByRole('slider', {name: 'Transparency'});
  await range.fill('100');
  expect(await stored(house, 'home-panel-glass-t')).toBe('100');
  await expect(range).toHaveAttribute('style', /--p:\s*100%/); // the filled part of the track follows the value
});

const darkIcon = (house: House) => popup(house).locator('[data-toggle-theme]');
const autoSwitch = (house: House) => popup(house).getByRole('switch', {name: 'Auto'});

test('the Appearance icon toggles Light and Dark in one tap, turns the frame and is kept', async ({house}) => {
  await open(house);
  await expect(popup(house).getByRole('button', {name: 'Dark', pressed: false})).toBeVisible(); // the icon's name, and its state
  await expect(darkIcon(house)).toHaveAttribute('aria-pressed', 'false');
  await expect(popup(house).locator('[data-open="appearance"]')).toContainText('Light');
  await darkIcon(house).click();
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await expect(darkIcon(house)).toHaveAttribute('aria-pressed', 'true');
  await expect(popup(house).locator('[data-open="appearance"]')).toContainText('Dark');
  expect(await stored(house, 'home-panel-theme')).toBe('dark');
  await darkIcon(house).click();
  await expect(app(house)).toHaveAttribute('data-theme', 'light');
  expect(await stored(house, 'home-panel-theme')).toBe('light');
});

test('Auto follows the device and says so; a tap on the icon while Auto is on sets the opposite and turns Auto off', async ({
  house,
}) => {
  await open(house);
  await openSubmenu(house, 'appearance');
  await expect(popup(house).getByText('Follows the device')).toBeVisible();
  await expect(autoSwitch(house)).toHaveAttribute('aria-checked', 'false');
  await autoSwitch(house).click();
  await expect(autoSwitch(house)).toHaveAttribute('aria-checked', 'true');
  expect(await stored(house, 'home-panel-theme')).toBe('auto');
  await backToModules(house);
  await expect(popup(house).locator('[data-open="appearance"]')).toContainText('Auto · Light');
  await darkIcon(house).click(); // the device is light: the opposite is Dark, for good
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  expect(await stored(house, 'home-panel-theme')).toBe('dark');
  await expect(popup(house).locator('[data-open="appearance"]')).not.toContainText('Auto');
  // turning Auto off keeps what shows
  await setTheme(house, 'auto');
  await openSubmenu(house, 'appearance');
  await autoSwitch(house).click();
  expect(await stored(house, 'home-panel-theme')).toBe('light');
});

test('the Text size slider: a step per size above Auto, the arrow keys move a step, Auto dims it', async ({house}) => {
  await open(house);
  await openSubmenu(house, 'text');
  const slider = popup(house).getByRole('slider', {name: 'Text size'});
  await expect(autoSwitch(house)).toHaveAttribute('aria-checked', 'true'); // Auto is the default
  await expect(slider).toBeDisabled();
  await expect(popup(house).locator('.stepends')).toHaveText('SmallerMaximum');
  await expect(popup(house).locator('.ticks i')).toHaveCount(4);
  await autoSwitch(house).click();
  await expect(slider).toBeEnabled();
  expect(await stored(house, 'home-panel-text')).toBe('normal'); // the step nearest the scale Auto gave: no jump
  await expect(app(house)).toHaveCSS('--tx', '1.000');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Normal');
  await slider.focus();
  await house.page.keyboard.press('ArrowRight');
  expect(await stored(house, 'home-panel-text')).toBe('large');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Large');
  await house.page.keyboard.press('ArrowRight');
  expect(await stored(house, 'home-panel-text')).toBe('larger');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Larger');
  await expect(app(house)).toHaveClass(/\btxl\b/);
  for (let i = 0; i < 3; i++) await house.page.keyboard.press('ArrowLeft');
  expect(await stored(house, 'home-panel-text')).toBe('smaller');
  await autoSwitch(house).click(); // back to Auto: the slider is dimmed and inactive
  await expect(slider).toBeDisabled();
  expect(await stored(house, 'home-panel-text')).toBe('auto');
});

test('the Design button opens a submenu with the two choices; choosing Material closes it and switches the panel', async ({
  house,
}) => {
  await open(house);
  await openSubmenu(house, 'design');
  const apple = popup(house).getByRole('button', {name: 'Liquid Glass'});
  const material = popup(house).getByRole('button', {name: 'Material'});
  await expect(apple).toHaveAttribute('aria-pressed', 'true');
  await expect(material).toHaveAttribute('aria-pressed', 'false');
  await material.click();
  await expect(app(house)).toHaveAttribute('data-design', 'material');
  await expect(popup(house).locator('[data-back]')).toHaveCount(0); // the submenu closed
  await expect(popup(house).locator('[data-open="design"]')).toBeFocused();
  expect(await stored(house, 'home-panel-design')).toBe('material');
  await expect(popup(house).locator('.seed')).toHaveCount(7); // the Colour module takes the Glass module's place
  await expect(popup(house).locator('[data-open="glass"]')).toContainText('Colour');
});

test('the Glass module opens a submenu with everything Glass has: the named swatches, the slider and Transparent cards', async ({
  house,
}) => {
  await open(house);
  await openSubmenu(house, 'glass');
  await expect(popup(house).locator('[data-gl="lake"] .swn')).toHaveText('Lake');
  await expect(popup(house).getByRole('slider', {name: 'Transparency'})).toBeVisible();
  const cards = popup(house).getByRole('switch', {name: 'Transparent cards'});
  await cards.click();
  expect(await stored(house, 'home-panel-cards')).toBe('glass');
});

test('a submenu is inside the popup: focus goes in, Escape and the chevron go back to the module that opened it, and the popup stays', async ({
  house,
}) => {
  await open(house);
  const label = popup(house).locator('[data-open="text"]');
  await label.click();
  await expect(popup(house).locator('[data-back]')).toBeFocused();
  await expect(popup(house).getByRole('heading', {name: 'Text size'})).toBeVisible();
  await house.page.keyboard.press('Escape');
  await expect(pop(house)).toBeVisible();
  await expect(label).toBeFocused();
  await label.click();
  await popup(house).locator('[data-back]').click();
  await expect(label).toBeFocused();
  await house.page.keyboard.press('Escape'); // in the modules, Escape closes the popup
  await expect(pop(house)).toBeHidden();
});

test('a popup closed in a submenu opens at the modules', async ({house}) => {
  await open(house);
  await openSubmenu(house, 'design');
  await gear(house).click();
  await expect(pop(house)).toBeHidden();
  await open(house);
  await expect(popup(house).locator('[data-open="design"]')).toBeVisible();
});

test('in the submenu a glass is a 44 pt swatch with its name under it, and the chosen one is checked', async ({
  house,
}) => {
  await open(house);
  await openSubmenu(house, 'glass');
  const glasses = popup(house).getByRole('radiogroup', {name: 'Glass'}).getByRole('radio');
  for (const glass of await glasses.all()) {
    const box = (await glass.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(popup(house).locator('[data-gl="dawn"] .swc svg')).toBeVisible(); // the check mark of the chosen one
  await expect(popup(house).locator('[data-gl="lake"] .swc svg')).toHaveCount(0);
});

test('the glass swatches are one radio group: one tab stop, and the arrow keys move and choose', async ({house}) => {
  await open(house);
  const glasses = popup(house).getByRole('radiogroup', {name: 'Glass'}).getByRole('radio');
  await expect(glasses.nth(1)).toHaveAttribute('tabindex', '0');
  await expect(glasses.nth(2)).toHaveAttribute('tabindex', '-1');
  await glasses.nth(1).focus();
  await house.page.keyboard.press('ArrowRight');
  await expect(glasses.nth(2)).toBeChecked();
  await expect(glasses.nth(2)).toBeFocused();
  expect(await stored(house, 'home-panel-glass')).toBe('lake');
  await house.page.keyboard.press('Home');
  await expect(glasses.first()).toBeChecked();
});

test('the phone titles the popup Settings and has Done; Done and Escape close it and focus returns to the gear', async ({
  house,
}) => {
  const title = popup(house).getByRole('heading', {name: 'Settings'});
  const done = popup(house).getByRole('button', {name: 'Done'});
  await open(house);
  if (!isPhone(house)) {
    await expect(title).toHaveCount(0);
    await expect(done).toHaveCount(0);
  } else {
    await expect(title).toBeVisible();
    await done.click();
    await expect(pop(house)).toBeHidden();
    await expect(gear(house)).toBeFocused();
    await open(house);
  }
  await popup(house).locator('[data-open="text"]').focus();
  await house.page.keyboard.press('Escape');
  await expect(pop(house)).toBeHidden();
  await expect(gear(house)).toBeFocused();
});

test('the foot says the version, and that the statistics are refreshed once they have loaded', async ({house}) => {
  await open(house);
  await expect(popup(house).locator('.ccv')).toHaveText(
    /^Home panel v\d+\.\d+\.\d+ · statistics refreshed every 15 minutes$/,
  );
});

test('Sleep now closes the popup and shows the idle clock', async ({house}) => {
  await open(house);
  await popup(house).locator('[data-sleep]').click();
  await expect(pop(house)).toBeHidden();
  await expect(gear(house)).toHaveAttribute('aria-expanded', 'false');
  await expect(app(house)).toHaveClass(/\bidle\b/);
});

test('keeps following the settings when the panel leaves the page and comes back', async ({house}) => {
  await house.page.evaluate(() => {
    const panel = document.querySelector('home-panel')!;
    (window as unknown as {parked: Element}).parked = panel;
    panel.shadowRoot!.querySelector('hp-settings-popup')!.setAttribute('data-first', '');
    panel.remove();
  });
  await house.page.evaluate(() => document.body.append((window as unknown as {parked: Element}).parked));
  await open(house);
  // the same element came back (a popup the frame had drawn again would prove nothing about following the settings again)
  await expect(popup(house)).toHaveAttribute('data-first', '');
  await popup(house).locator('[data-gl="aurora"]').click();
  await expect(popup(house).locator('[data-gl="aurora"]')).toBeChecked();
  await expect(popup(house).locator('[data-gl="dawn"]')).not.toBeChecked();
});

test.describe('in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, lang: 'fr'}});

  test('opens in French and reads Taille du texte', async ({house}) => {
    await open(house);
    await expect(popup(house).getByText('Taille du texte')).toBeVisible();
    await expect(popup(house).getByRole('radiogroup', {name: 'Verre'}).getByRole('radio').first()).toHaveText('Aucun');
    await expect(popup(house).locator('[data-sleep]')).toHaveAttribute('aria-label', 'Dormir maintenant');
    await expect(popup(house).locator('.ccv')).toHaveText(
      /^Home panel v\d+\.\d+\.\d+ · statistiques actualisées aux 15 minutes$/,
    );
    await expect(popup(house).locator('[data-open="appearance"]')).toContainText('Clair');
    await expect(popup(house).getByRole('button', {name: 'Sombre', pressed: false})).toBeVisible();
    await openSubmenu(house, 'appearance');
    await expect(popup(house).getByRole('switch', {name: 'Auto'})).toBeVisible();
    await expect(popup(house).getByText("Suit l'appareil")).toBeVisible();
    await expect(popup(house).getByRole('button', {name: 'Retour'})).toBeVisible();
  });

  test('says its three labels in French: the gear, the popup and the Status checks', async ({house}) => {
    await expect(gear(house)).toHaveAttribute('aria-label', 'Réglages');
    await expect(pop(house)).toHaveAttribute('aria-label', 'Réglages');
    await expect(house.root().locator('#attpop')).toHaveAttribute('aria-label', 'Vérifications');
  });

  // The popup's root is outside the rewrite layer's observer, so its words are the catalog's from the first render: no English
  // text is ever in it. A MutationObserver on the root, hooked before the page loads, keeps each text it holds.
  test('never holds an English word, from its first paint', async ({house}) => {
    await house.page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as {popupTexts: string[]}).popupTexts = seen;
      const attach = Object.getOwnPropertyDescriptor(Element.prototype, 'attachShadow')!
        .value as Element['attachShadow'];
      Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
        const root = attach.call(this, init);
        if (this.localName === 'hp-settings-popup')
          new MutationObserver(() => void seen.push(root.textContent ?? '')).observe(root, {
            subtree: true,
            childList: true,
            characterData: true,
          });
        return root;
      };
    });
    await house.page.reload();
    await expect(popup(house).locator('[data-open="appearance"] b')).toHaveText('Apparence');
    const texts = await house.page.evaluate(() => (window as unknown as {popupTexts: string[]}).popupTexts);
    expect(texts.length, 'the popup drew').toBeGreaterThan(0);
    for (const text of texts)
      expect(text).not.toMatch(
        /Appearance|Light|Dark|Settings|Done|Text size|Sleep now|Smaller|Solid|Follows the device/,
      );
  });
});
