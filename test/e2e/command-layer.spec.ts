// The kit's command layer as a person meets it before a feature uses it: the harness's failNext (a service call that fails once,
// seen through a control that has not moved yet) and <hp-switch>, mounted in the harness page. Spec: docs/specs/16-media.md,
// "Commands and the optimistic overlay (ADR 0023)". The runner and the store are proven in Vitest (test/unit/ui/).
import AxeBuilder from '@axe-core/playwright';
import {test, expect, type House} from './fixtures';
import {callsMessage} from './lights';

test('failNext makes the next matching service call fail once, and the call after it works', async ({house}) => {
  await house.tab('lights');
  const bulb = house.root().locator('#pane-lights .lcell:visible button.lbulb').first();
  await house.failNext('light.');
  await bulb.click();
  await expect(house.root().locator('#toast')).toContainText("Didn't work: the service call failed on purpose");
  expect(
    house.calls.filter(c => c.startsWith('light.')),
    'the rejected call is not recorded',
  ).toEqual([]);

  await bulb.click();
  await expect
    .poll(() => house.calls.some(c => c.startsWith('light.')), callsMessage(house, 'the second tap goes through'))
    .toBe(true);
});

test('failNext(null) cancels a pattern that has not matched yet', async ({house}) => {
  await house.tab('lights');
  await house.failNext('light.');
  await house.failNext(null);
  await house.root().locator('#pane-lights .lcell:visible button.lbulb').first().click();
  await expect
    .poll(() => house.calls.some(c => c.startsWith('light.')), callsMessage(house, 'the tap goes through'))
    .toBe(true);
  await expect(house.root().locator('#toast')).toBeHidden();
});

// <hp-switch> is in the built panel (src/main.js) but no feature draws it yet, so the page mounts one the way a feature will
const mount = (house: House, attributes: string) =>
  house.page.evaluate(attributes => {
    const w = window as unknown as {changes: boolean[]};
    w.changes = [];
    const probe = document.createElement('hp-switch');
    probe.id = 'probe';
    // the attributes are a list of `name` or `name="value"`, as markup writes them
    for (const [, name, value] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g))
      probe.setAttribute(name, value ?? '');
    probe.addEventListener('change', e => w.changes.push((e as CustomEvent<{checked: boolean}>).detail.checked));
    document.body.append(probe);
  }, attributes);
const changes = (house: House) => house.page.evaluate(() => (window as unknown as {changes: boolean[]}).changes);

test.describe('<hp-switch>', () => {
  test('is a switch with the label it is given, and a tap asks for the opposite state without flipping itself', async ({
    house,
  }) => {
    await mount(house, 'label="Porch light"');
    const sw = house.page.getByRole('switch', {name: 'Porch light'});
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    expect(await changes(house)).toEqual([true]);
    await expect(sw, 'the owner decides, so a tap alone leaves it off').toHaveAttribute('aria-checked', 'false');

    await house.page.evaluate(
      () => ((document.getElementById('probe') as HTMLElement & {checked: boolean}).checked = true),
    );
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(house.page.locator('#probe'), 'checked is reflected').toHaveAttribute('checked', '');
    await sw.click();
    expect(await changes(house)).toEqual([true, false]);
  });

  test('answers Space and Enter, as a button does', async ({house}) => {
    await mount(house, 'label="Porch light" checked');
    const sw = house.page.getByRole('switch', {name: 'Porch light'});
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.focus();
    await house.page.keyboard.press('Space');
    await house.page.keyboard.press('Enter');
    expect(await changes(house)).toEqual([false, false]);
  });

  test('says nothing when it is disabled', async ({house}) => {
    await mount(house, 'label="Porch light" disabled');
    const sw = house.page.getByRole('switch', {name: 'Porch light'});
    await expect(sw).toBeDisabled();
    await sw.click({force: true});
    expect(await changes(house)).toEqual([]);
  });

  test('has no accessibility violation, off, on and disabled', async ({house}) => {
    await mount(house, 'label="Porch light"');
    const scan = async () => (await new AxeBuilder({page: house.page}).include('#probe').analyze()).violations;
    expect(await scan(), 'off').toEqual([]);
    await house.page.evaluate(
      () => ((document.getElementById('probe') as HTMLElement & {checked: boolean}).checked = true),
    );
    expect(await scan(), 'on').toEqual([]);
    await house.page.evaluate(
      () => ((document.getElementById('probe') as HTMLElement & {disabled: boolean}).disabled = true),
    );
    expect(await scan(), 'disabled').toEqual([]);
  });
});
