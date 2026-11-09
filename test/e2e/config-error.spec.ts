// The config-error card (spec 13, "The error card"): an admin whose panel config has a problem sees a card at the top of the Home
// tab that names each setting the panel could not use and, when one is close, the spelling meant; a non-admin never sees it; a
// valid config shows nothing new. The test house is driven through its `config:` block and the signed-in user, never the element.
import {test, expect, type House} from './fixtures';
import {FULL_CFG} from './houses';

const TYPO_CFG = {...FULL_CFG, peoples: ['Alex']};
const card = (house: House) => house.root().locator('.cfgerr');
// the card as assistive technology finds it: an aside (the complementary landmark) named by its heading
const landmark = (house: House, name: string) => house.root().getByRole('complementary', {name});

test.describe('an admin with a typo in the config', () => {
  test.use({houseOpts: {cfg: TYPO_CFG}});

  test('sees a card on the Home tab naming the setting and the spelling meant', async ({house}) => {
    await house.tab('home');
    await expect(landmark(house, "Check the panel's configuration")).toBeVisible();
    await expect(card(house).locator('p').first()).toHaveText('One setting could not be used and was ignored:');
    await expect(card(house).locator('li')).toHaveCount(1);
    await expect(card(house).locator('li code')).toHaveText('peoples');
    await expect(card(house).locator('li')).toHaveText('peoples: unknown setting. Did you mean people?');
    await expect(card(house)).toContainText('Fix configuration.yaml and restart Home Assistant.');
  });

  test('has no live region: the card is there from the first paint', async ({house}) => {
    await house.tab('home');
    await expect(card(house)).toBeVisible();
    await expect(card(house).locator('[aria-live], [role="alert"], [role="status"]')).toHaveCount(0);
    await expect(card(house)).not.toHaveAttribute('aria-live', /.*/);
  });

  test('is at the top of the Home pane, above the Home card, on a tablet and on a phone', async ({house}) => {
    await house.tab('home');
    await expect(card(house)).toBeVisible();
    const placed = await house
      .root()
      .locator('#pane-home')
      .evaluate(pane => {
        const top = (e: Element) => e.getBoundingClientRect().top;
        const aside = pane.querySelector('.cfgerr')!;
        const home = pane.querySelector('#hwx')!;
        // everything else the pane draws, except its own title (the tablet's header line), starts below the card
        const others = [...pane.children].filter(
          e => !e.contains(aside) && !e.classList.contains('ph') && e.getBoundingClientRect().height > 0,
        );
        return {
          aboveHome: aside.getBoundingClientRect().bottom <= top(home) + 1,
          firstOfTheRest: others.every(e => top(e) >= top(aside) - 1),
        };
      });
    expect(placed).toEqual({aboveHome: true, firstOfTheRest: true});
  });
});

test.describe('a non-admin with a typo in the config', () => {
  test.use({houseOpts: {cfg: TYPO_CFG, admin: false}});

  test('sees no card, and the Home tab is the Home tab', async ({house}) => {
    await house.tab('home');
    await expect(house.root().locator('#pane-home #hwx')).toBeVisible();
    await expect(card(house)).toHaveCount(0);
    await expect(house.root().getByRole('complementary')).toHaveCount(0);
  });
});

test.describe('a valid config', () => {
  test.use({houseOpts: {cfg: FULL_CFG}});

  test('shows no card to an admin', async ({house}) => {
    await house.tab('home');
    await expect(house.root().locator('#pane-home #hwx')).toBeVisible();
    await expect(card(house)).toHaveCount(0);
  });
});

test.describe('no config at all', () => {
  test.use({houseOpts: {cfg: null}});

  test('shows no card to an admin', async ({house}) => {
    await house.tab('home');
    await expect(house.root().locator('#pane-home #hwx')).toBeVisible();
    await expect(card(house)).toHaveCount(0);
  });
});

test.describe('a bad icon', () => {
  test.use({houseOpts: {cfg: {...FULL_CFG, rooms: [{climate: 'climate.office', icon: 'couch'}]}}});

  test('is named on the card, and the room still shows with a guessed icon', async ({house}) => {
    await house.tab('home');
    await expect(card(house).locator('li code')).toHaveText('rooms[0].icon');
    await expect(card(house).locator('li')).toContainText('couch is not one of');
    await house.tab('climate');
    // the tablet lists the rooms as `citem` rows, the phone as `stile` tiles
    const office = house.root().locator('#pane-climate :is(.citem, .stile):visible', {hasText: 'Office'});
    await expect(office).toBeVisible();
    // the glyph the guess draws for an "Office" is the desk (guessIcon in src/core/room-icons.ts; the path is the legacy
    // class's ICON.desk), not the text "undefined"
    await expect(office.locator('.ic svg path')).toHaveAttribute('d', 'M3 9h18M5 9v11M19 9v11M14 9v6h5');
    await expect(office.locator('.ic')).not.toContainText('undefined');
  });
});

test.describe('several problems', () => {
  test.use({
    houseOpts: {
      cfg: {...TYPO_CFG, rooms: [{climate: 'climate.office', icon: 'couch'}], light_links: [['office']]},
    },
  });

  test('are counted in the lead line and listed one per line, each with its path', async ({house}) => {
    await house.tab('home');
    await expect(card(house).locator('p').first()).toHaveText('3 settings could not be used and were ignored:');
    await expect(card(house).locator('li code')).toHaveText(['rooms[0].icon', 'light_links[0]', 'peoples']);
    await expect(card(house).locator('li').nth(1)).toContainText('a link needs exactly two cards');
  });
});

test.describe('a setting written as markup', () => {
  test.use({houseOpts: {cfg: {...FULL_CFG, '<img src=x onerror=alert(1)>': 1}}});

  test('is shown as text, never drawn', async ({house}) => {
    await house.tab('home');
    await expect(card(house).locator('li code')).toHaveText('<img src=x onerror=alert(1)>');
    await expect(card(house).locator('img')).toHaveCount(0);
  });
});

test.describe('a French profile', () => {
  test.use({houseOpts: {cfg: {...TYPO_CFG, light_links: [['office']]}, lang: 'fr'}});

  test('reads the card in French, once: the French layer leaves the card alone', async ({house}) => {
    await house.tab('home');
    await expect(landmark(house, 'Vérifiez la configuration du panneau')).toBeVisible();
    await expect(card(house).locator('p').first()).toHaveText(
      "2 réglages n'ont pas pu être utilisés et ont été ignorés :",
    );
    await expect(card(house).locator('li')).toHaveText([
      'light_links[0] : un lien doit relier exactement deux cartes.',
      'peoples : réglage inconnu. Vouliez-vous écrire people ?',
    ]);
    await expect(card(house).locator('li code')).toHaveText(['light_links[0]', 'peoples']);
    await expect(card(house)).toContainText('Corrigez configuration.yaml, puis redémarrez Home Assistant.');
  });
});

test.describe('a French profile and a setting the French layer knows as an English word', () => {
  // `Rooms` and `Home` are labels the French layer turns into Pièces and Maison; as a setting name they are the admin's own text
  test.use({houseOpts: {cfg: {...FULL_CFG, Rooms: 'climate.office', Home: 1}, lang: 'fr'}});

  test('shows the setting as written, never translated', async ({house}) => {
    await house.tab('home');
    await expect(card(house).locator('li code')).toHaveText(['Rooms', 'Home']);
  });
});

test.describe('a language switch', () => {
  test.use({houseOpts: {cfg: TYPO_CFG}});

  test('redraws the card in the new language, and back', async ({house}) => {
    await house.tab('home');
    await expect(card(house).locator('h3')).toHaveText("Check the panel's configuration");
    await house.setLanguage('fr');
    await house.tab('home');
    await expect(card(house).locator('h3')).toHaveText('Vérifiez la configuration du panneau');
    await expect(card(house).locator('li')).toHaveText('peoples : réglage inconnu. Vouliez-vous écrire people ?');
    await house.setLanguage('en');
    await house.tab('home');
    await expect(card(house).locator('h3')).toHaveText("Check the panel's configuration");
    await expect(card(house).locator('li')).toHaveText('peoples: unknown setting. Did you mean people?');
  });
});
