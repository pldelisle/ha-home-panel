// The toast (<hp-toast>, #275): the shell draws it from every `ToastEvent`, through the pure schedule (src/ui/toast-schedule.ts).
// A done toast goes after 3.5 s on the page's clock; a failure stays, in red, until it is dismissed; a legacy toast still says
// its text in French, and a catalog toast says it as the catalog writes it. Spec: docs/specs/26-idle-clock.md, the deletion's toast.
import AxeBuilder from '@axe-core/playwright';
import {test, expect, tabletOnly, type House} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';
import {openOfficeSheet} from './lights';

test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON}});

const toast = (house: House) => house.root().locator('hp-toast #toast');
const scene = (house: House, name: string) =>
  house.root().locator('#hscenes hp-scene-tiles').getByRole('button').filter({hasText: name});
// the page's clock stands still, so only fastForward moves it
const pause = async (house: House) => house.clock.pauseAt((await house.page.evaluate(() => Date.now())) + 1000);

test('a done toast shows for 3.5 seconds, then goes', async ({house}) => {
  await pause(house);
  await scene(house, 'Movie night').click();
  await expect(toast(house)).toHaveText('Movie night on');
  await expect(toast(house)).toHaveAttribute('role', 'status');
  await house.clock.fastForward(3_400);
  await expect(toast(house)).toBeVisible();
  await house.clock.fastForward(200);
  await expect(toast(house)).toBeHidden();
});

test('a failed command shows a sticky toast that stays until it is dismissed, and axe finds nothing on it', async ({
  house,
}) => {
  await pause(house);
  await house.failNext('scene.turn_on');
  await scene(house, 'Movie night').click();
  await expect(toast(house)).toContainText("Didn't work: the service call failed on purpose");
  await expect(toast(house)).toHaveAttribute('role', 'alert');
  await expect(toast(house)).toHaveClass(/\berr\b/);
  await house.clock.fastForward(60_000);
  await expect(toast(house)).toBeVisible();
  await house.clock.resume(); // axe waits on the page's timers
  const {violations} = await new AxeBuilder({page: house.page}).include(['home-panel', 'hp-toast']).analyze();
  expect(violations).toEqual([]);
  await toast(house).getByRole('button', {name: 'Dismiss'}).click();
  await expect(toast(house)).toBeHidden();
});

test('a new toast replaces the one showing: a done one after a failure goes after its own 3.5 seconds', async ({
  house,
}) => {
  await pause(house);
  await house.failNext('scene.turn_on');
  await scene(house, 'Movie night').click();
  await expect(toast(house)).toHaveAttribute('role', 'alert');
  await scene(house, 'Kids bedtime').click();
  await expect(toast(house)).toHaveText('Kids bedtime on');
  await expect(toast(house)).not.toHaveClass(/\berr\b/);
  await house.clock.fastForward(3_600);
  await expect(toast(house)).toBeHidden();
});

test.describe('in French', () => {
  test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, lang: 'fr'}});

  // a catalog toast: the Car's charger words this one from the catalog (#253), as every feature does
  test('a catalog toast is in French, and so is the Dismiss of a failure', async ({house}) => {
    tabletOnly();
    await house.tab('car');
    await house.root().locator('hp-charger-controls').getByRole('switch', {name: 'Verrouiller la borne'}).click();
    await expect(toast(house)).toHaveText('Borne verrouillée');
    await house.failNext('scene.turn_on');
    await house.tab('home');
    await scene(house, 'Movie night').click(); // a name the house gave, which the panel never translates
    await expect(toast(house).getByRole('button')).toHaveText('Fermer');
  });

  // the room sheet's Auto brightness switch, a command's toast from the catalog since the sheet moved to its element (#262)
  test("the light sheet's Auto brightness toast is in French", async ({house}) => {
    tabletOnly();
    await openOfficeSheet(house);
    await house.root().locator('#lsheet hp-switch[data-l="abr"] button').click();
    await expect(toast(house)).toHaveText('Intensité auto désactivée');
  });
});

// white text on the error fill: the dark theme's light red (#da8282) gave 2.8:1, so the fill is its own darker token, 5.3:1 (#391)
test.describe('the failure toast by theme', () => {
  const failed = async (house: House) => {
    await pause(house);
    await house.failNext('scene.turn_on');
    await scene(house, 'Movie night').click();
    await expect(toast(house)).toHaveClass(/\berr\b/);
  };

  test.describe('in dark mode', () => {
    test.use({houseOpts: {cfg: FULL_CFG, time: AFTERNOON, theme: 'dark'}});

    test('the fill is a red white text reads on (4.5:1)', async ({house}) => {
      await failed(house);
      await expect(toast(house)).toHaveCSS('background-color', 'rgb(179, 74, 74)');
      await expect(toast(house)).toHaveCSS('color', 'rgb(255, 255, 255)');
    });
  });

  test('the light theme keeps its red', async ({house}) => {
    await failed(house);
    await expect(toast(house)).toHaveCSS('background-color', 'rgb(167, 80, 80)');
  });
});
