// Display names follow the panel's language: the config's names: block first, then the room dictionary, then the name
// Home Assistant gives (spec 11, "Display names"). The test house is English; with `names: 'fr'` its areas carry the French
// names a French-speaking household gives them, and the English panel reads them as `Living room`.
import {test, expect} from './fixtures';
import {FULL_CFG} from './houses';
import {tileNames} from './lights';

const NAMES_CFG = {...FULL_CFG, names: {'Living room': {fr: 'Salon'}}};
const OVERRIDES_CFG = {...FULL_CFG, names: {'Living room': {fr: 'Salon'}, Office: {fr: 'Atelier'}}};
const isPhone = () => test.info().project.name === 'phone';

test.describe('an English house in French', () => {
  test.use({houseOpts: {cfg: NAMES_CFG, lang: 'fr'}});

  test('the Lights tab reads Salon for Living room, and the room words come out in French with no config', async ({
    house,
  }) => {
    expect(await tileNames(house)).toEqual(['Bureau', 'Cuisine', 'Salon']);
  });
});

test.describe('a names: block in French', () => {
  test.use({houseOpts: {cfg: OVERRIDES_CFG, lang: 'fr'}});

  test('an override wins over the dictionary: Office reads Atelier, not Bureau', async ({house}) => {
    expect(await tileNames(house)).toEqual(['Atelier', 'Cuisine', 'Salon']);
  });
});

test.describe('an English house in English', () => {
  test.use({houseOpts: {cfg: NAMES_CFG}});

  test('the Lights tab reads Living room, as Home Assistant names it', async ({house}) => {
    expect(await tileNames(house)).toEqual(['Kitchen', 'Living room', 'Office']);
  });

  test('a language switch to French reads the names in French, and back', async ({house}) => {
    expect(await tileNames(house)).toEqual(['Kitchen', 'Living room', 'Office']);
    await house.setLanguage('fr');
    await expect.poll(() => tileNames(house)).toEqual(['Bureau', 'Cuisine', 'Salon']);
    await house.setLanguage('en');
    await expect.poll(() => tileNames(house)).toEqual(['Kitchen', 'Living room', 'Office']);
  });
});

test.describe('a French house', () => {
  test.describe('in English', () => {
    test.use({houseOpts: {cfg: FULL_CFG, names: 'fr'}});

    test('Salon reads Living room on the Lights tab, with no names: block', async ({house}) => {
      expect(await tileNames(house)).toEqual(['Kitchen', 'Living room', 'Office']);
    });

    test('and on the Climate card, whose rooms are the thermostats', async ({house}) => {
      test.skip(isPhone(), 'the Climate card is on the tablet');
      await house.tab('climate');
      await expect(house.root().locator('#climate .room .n')).toHaveText([
        'Bedroom',
        'Garage',
        'Living room',
        'Office',
      ]);
    });
  });

  test.describe('in French', () => {
    test.use({houseOpts: {cfg: FULL_CFG, names: 'fr', lang: 'fr'}});

    test('Salon stays Salon, left alone by the French layer', async ({house}) => {
      expect(await tileNames(house)).toEqual(['Bureau', 'Cuisine', 'Salon']);
    });
  });
});
