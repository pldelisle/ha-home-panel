// Helpers for the specs that change a setting through the Control Center popup: the modules, the submenus and the controls in them, as a person uses them.
// The clicks are dispatched, because on the phone the bar covers part of the popup.
import {expect, type House} from './fixtures';

export type Submenu = 'appearance' | 'text' | 'design' | 'glass';

export const popup = (house: House) => house.root().locator('hp-settings-popup');

/** the gear opens the popup when it is closed; the modules are what it shows when it opens */
export async function openSettings(house: House) {
  const pop = house.root().locator('#setpop');
  if (await pop.isHidden()) await house.root().locator('#gear').click();
  await expect(pop).toBeVisible();
}

/** the submenu fades in over the popup: a scan or a shot waits for the fade to end */
const faded = (house: House) =>
  popup(house).evaluate(el =>
    Promise.all((el.shadowRoot?.getAnimations() ?? []).map(a => a.finished.catch(() => undefined))),
  );

/** the module's label opens its submenu inside the popup, whose back chevron says it is there */
export async function openSubmenu(house: House, name: Submenu) {
  await openSettings(house);
  await popup(house).locator(`[data-open="${name}"]`).dispatchEvent('click');
  await expect(popup(house).locator('[data-back]')).toBeVisible();
  await faded(house);
}

/** the back chevron returns to the modules */
export async function backToModules(house: House) {
  await popup(house).locator('[data-back]').dispatchEvent('click');
  await expect(popup(house).locator('[data-open="appearance"]')).toBeVisible();
  await faded(house);
}

/** an Auto switch (the one in the submenu now open) is set to `on` */
async function setAuto(house: House, on: boolean) {
  const auto = popup(house).getByRole('switch', {name: 'Auto'});
  if ((await auto.getAttribute('aria-checked')) !== String(on)) await auto.dispatchEvent('click');
  await expect(auto).toHaveAttribute('aria-checked', String(on));
}

/** Light, Dark or Auto through the Appearance module: the Auto switch in its submenu, and the round icon (a tap flips what shows); back at the modules */
export async function setTheme(house: House, theme: 'light' | 'dark' | 'auto') {
  await openSubmenu(house, 'appearance');
  await setAuto(house, theme === 'auto');
  await backToModules(house);
  if (theme === 'auto') return;
  const toggle = popup(house).locator('[data-toggle-theme]');
  if ((await toggle.getAttribute('aria-pressed')) !== String(theme === 'dark')) await toggle.dispatchEvent('click');
  await expect(toggle).toHaveAttribute('aria-pressed', String(theme === 'dark'));
}

const TEXT_STEPS = ['smaller', 'large', 'larger'];

/** a text size through the Text size submenu: the Auto switch, and the slider's step; back at the modules */
export async function setTextSize(house: House, size: 'smaller' | 'auto' | 'large' | 'larger') {
  await openSubmenu(house, 'text');
  await setAuto(house, size === 'auto');
  if (size !== 'auto') {
    const slider = popup(house).locator('.stepbox input');
    await expect(slider).toBeEnabled();
    await slider.fill(String(TEXT_STEPS.indexOf(size)));
  }
  await backToModules(house);
}

/** Liquid Glass or Material through the Design submenu, which closes itself on the choice */
export async function setDesign(house: House, design: 'apple' | 'material') {
  await openSubmenu(house, 'design');
  await popup(house).locator(`[data-design-set="${design}"]`).dispatchEvent('click');
  await expect(popup(house).locator('[data-open="appearance"]')).toBeVisible();
}
