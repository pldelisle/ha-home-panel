// The settings popup behind the gear, `<hp-settings-popup>` (spec 14, step D): what a person sees and does with it, in English and
// in French. Everything is driven as a person drives it: the gear, the buttons, the range, Escape, a tap elsewhere. What is read back
// is what the screen shows (text, roles, states) and what the settings kept (localStorage, the frame's attributes).
import {test, expect, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';
import {openFrontDoor, openPopup, stopCharging} from './live';

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
  await popup(house).locator('.ccl').first().click(); // a tap inside it leaves it open
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

test('lists the four text sizes and the eight glasses in order, as radio buttons that say which is chosen', async ({
  house,
}) => {
  await open(house);
  const sizes = popup(house).getByRole('radiogroup', {name: 'Text size'}).getByRole('radio');
  await expect(sizes).toHaveText(['Smaller', 'Auto', 'Large', 'Larger']);
  await expect(sizes.nth(1)).toBeChecked();
  const glasses = popup(house).getByRole('radiogroup', {name: 'Glass'}).getByRole('radio');
  await expect(glasses).toHaveText(['None', 'Dawn', 'Lake', 'Meadow', 'Ember', 'Aurora', 'Sand', 'Sky']);
  await expect(glasses.nth(1)).toBeChecked(); // Dawn is the default
  await expect(popup(house).getByRole('slider', {name: 'Transparency'})).toHaveValue('50');
});

test('a choice is kept, applied and shown by the popup', async ({house}) => {
  await open(house);
  const larger = popup(house).locator('[data-tx="larger"]');
  await larger.click();
  expect(await stored(house, 'home-panel-text')).toBe('larger');
  await expect(larger).toBeChecked();
  await expect(popup(house).locator('[data-tx="auto"]')).not.toBeChecked();
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

test('the dark toggle turns the frame dark and says so, and turning it back says that', async ({house}) => {
  await open(house);
  const toggle = popup(house).locator('[data-th="toggle"]');
  await expect(toggle).toHaveAttribute('aria-label', 'Theme: light. Tap to switch');
  await toggle.click();
  await expect(app(house)).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'Theme: dark. Tap to switch');
  await expect(toggle.locator('b')).toHaveText('Dark');
  await toggle.click();
  await expect(app(house)).toHaveAttribute('data-theme', 'light');
  await expect(toggle.locator('b')).toHaveText('Light');
});

test('Auto says it follows the device, and the toggle then says so too', async ({house}) => {
  await open(house);
  const auto = popup(house).locator('[data-th="auto"]');
  await expect(auto.locator('small')).toHaveText('Follows the device');
  await auto.click();
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  await expect(popup(house).locator('[data-th="toggle"] small')).toHaveText('Following the device');
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
    await expect(popup(house).locator('[data-sleep] b')).toHaveText('Dormir maintenant');
    await expect(popup(house).locator('.ccv')).toHaveText(
      /^Home panel v\d+\.\d+\.\d+ · statistiques actualisées aux 15 minutes$/,
    );
    await expect(popup(house).locator('[data-th="toggle"]')).toHaveAttribute(
      'aria-label',
      'Thème\u00a0: clair. Toucher pour changer',
    );
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
    await expect(popup(house).locator('.ccl').first()).toHaveText('Taille du texte');
    const texts = await house.page.evaluate(() => (window as unknown as {popupTexts: string[]}).popupTexts);
    expect(texts.length, 'the popup drew').toBeGreaterThan(0);
    for (const text of texts) expect(text).not.toMatch(/Text size|Sleep now|Smaller|Solid|Follows the device/);
  });
});
