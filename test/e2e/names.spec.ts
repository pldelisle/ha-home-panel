// Display names follow the panel's language: the config's names: block first, then the room dictionary, then the name
// Home Assistant gives (spec 11, "Display names"). The test house is English; with `frenchAreas` its areas carry the French
// names a French-speaking household gives them, and the English panel reads them as `Living room`.
import {test, expect} from './fixtures';
import {AFTERNOON, FULL_CFG} from './houses';
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
    test.use({houseOpts: {cfg: FULL_CFG, frenchAreas: true}});

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
    test.use({houseOpts: {cfg: FULL_CFG, frenchAreas: true, lang: 'fr'}});

    test('Salon stays Salon, left alone by the French layer', async ({house}) => {
      expect(await tileNames(house)).toEqual(['Bureau', 'Cuisine', 'Salon']);
    });

    test('the Climate card reads Salon for the living-room thermostat', async ({house}) => {
      test.skip(isPhone(), 'the Climate card is on the tablet');
      await house.tab('climate');
      await expect(house.root().locator('#climate .room .n')).toContainText(['Salon']);
    });
  });
});

test.describe('a house name the French layer would translate, if it were not one', () => {
  // `Away` and `Sleep` are words of the panel's own (they read "Absent" and "Sommeil"); a house that calls a room that says so by name
  test.use({
    houseOpts: {
      cfg: {...FULL_CFG, names: {'Living room': {fr: 'Away'}, Den: {fr: 'Sleep'}}},
      lang: 'fr',
      time: AFTERNOON,
    },
  });

  test('the Lights tab keeps the name the house gave', async ({house}) => {
    expect(await tileNames(house)).toEqual(['Away', 'Bureau', 'Cuisine']);
  });

  test('so does the Climate card, where the thermostat is no area, device or light', async ({house}) => {
    test.skip(isPhone(), 'the Climate card is on the tablet');
    await house.setState('climate.garage', {attributes: {friendly_name: 'Thermostat Den'}});
    // the French layer reads the house's names again a minute later
    await house.clock.fastForward(61_000);
    await house.tab('climate');
    await expect(house.root().locator('#climate .room .n')).toHaveText(['Chambre', 'Sleep', 'Away', 'Bureau']);
  });
});

test.describe('a name set for a device the house did not rename', () => {
  // the hall sensor's device has only the name its integration gave it, and the house names it by its id
  test.use({houseOpts: {cfg: {...FULL_CFG, names: {s2: {fr: 'Away'}}}, lang: 'fr'}});

  test('the Doors and motion card keeps the name the house gave, not the one the French layer has for it', async ({
    house,
  }) => {
    test.skip(isPhone(), 'the Cameras tab is on the tablet');
    await house.tab('cams');
    await expect(house.root().locator('#sensors .schip b')).toHaveText(['Front door', 'Away']);
  });
});

test.describe('an area with no name of its own', () => {
  test.use({houseOpts: {cfg: FULL_CFG}});

  test('the speaker is shown by its own name, as it always was, not by the id of its area', async ({house}) => {
    test.skip(isPhone(), 'the speakers are on the tablet');
    await house.setAreaName('living_room', '');
    await house.tab('media');
    await expect(house.root().locator('#pane-media hp-speaker-pod h3')).toHaveText(['Living room speaker']);
  });
});
