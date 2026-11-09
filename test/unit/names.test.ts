// The display-name resolver: a config's names: block, the room dictionary and the Home Assistant name, in that order.
// Literal inputs and literal expected strings; the hass is the shared fake with a few areas, devices and entities.
import {describe, expect, test} from 'vitest';
import {createNames, type NamesConfig} from '../../src/core/i18n/names.ts';
import {ROOM_NAMES} from '../../src/core/i18n/room-names.ts';
import {entity, fakeHass} from './fake-hass.ts';

const hass = fakeHass({
  states: {
    'light.lampe_salon': entity('light.lampe_salon', 'on', {friendly_name: 'Lampe du salon'}),
    'light.plain': entity('light.plain', 'on', {friendly_name: 'Garage'}),
    'light.nameless': entity('light.nameless', 'on', {}),
    'light.numeric': entity('light.numeric', 'on', {friendly_name: 42}),
    'scene.cuisine': entity('scene.cuisine', 'off', {friendly_name: 'Cuisine'}),
  },
  areas: {
    salon: {area_id: 'salon', name: 'Salon'},
    sdb: {area_id: 'sdb', name: 'Salle de bain'},
    study: {area_id: 'study', name: 'Bureau'},
    living: {area_id: 'living', name: 'Living room'},
    gym: {area_id: 'gym', name: 'Gym'},
  },
  devices: {
    d1: {id: 'd1', name: 'Cuisine', name_by_user: null},
    d2: {id: 'd2', name: 'Chambre', name_by_user: 'Salle à manger'},
    d3: {id: 'd3', name: null, name_by_user: null},
  },
});

describe('where the Home Assistant name comes from', () => {
  const {name} = createNames({}, 'xx', hass);

  test('an entity id gives its friendly name', () => {
    expect(name('light.lampe_salon')).toBe('Lampe du salon');
  });
  test('an area id gives the area name', () => {
    expect(name('salon')).toBe('Salon');
    expect(name('gym')).toBe('Gym');
  });
  test('a device id gives the name the user gave it, else its own name', () => {
    expect(name('d1')).toBe('Cuisine');
    expect(name('d2')).toBe('Salle à manger');
  });
  test('a key Home Assistant does not know is returned as given', () => {
    expect(name('Some name')).toBe('Some name');
    expect(name('light.nameless')).toBe('light.nameless');
    expect(name('light.numeric')).toBe('light.numeric');
    expect(name('d3')).toBe('d3');
  });
  test('no hass at all returns the key', () => {
    expect(createNames({}, 'fr', null).name('Salon')).toBe('Salon');
  });
});

describe('the dictionary', () => {
  test('English reads the French word', () => {
    const {name} = createNames({}, 'en', hass);
    expect(name('salon')).toBe('Living room');
    expect(name('sdb')).toBe('Bathroom');
    expect(name('d1')).toBe('Kitchen');
    expect(name('d2')).toBe('Dining room');
  });
  test('French reads the English word', () => {
    const {name} = createNames({}, 'fr', hass);
    expect(name('living')).toBe('Salon');
    expect(name('Living room')).toBe('Salon');
    expect(name('Main bedroom')).toBe('Chambre principale');
  });
  test('the word is matched whole, without case or accent', () => {
    const en = createNames({}, 'en', hass).name;
    expect(en('SALLE  À   MANGER')).toBe('Dining room');
    expect(en('salle a manger')).toBe('Dining room');
    expect(en('  Entrée ')).toBe('Entrance');
    expect(en('sous-sol')).toBe('Basement');
    const fr = createNames({}, 'fr', hass).name;
    expect(fr('LAUNDRY room')).toBe('Salle de lavage');
    expect(fr('entrance')).toBe('Entrée');
  });
  test('a compound name is left alone', () => {
    expect(createNames({}, 'en', hass).name('light.lampe_salon')).toBe('Lampe du salon');
    expect(createNames({}, 'fr', hass).name('Living room lamp')).toBe('Living room lamp');
    expect(createNames({}, 'en', hass).name('Salon de jardin')).toBe('Salon de jardin');
  });
  test('a name with no match comes back as given', () => {
    expect(createNames({}, 'en', hass).name('gym')).toBe('Gym');
    expect(createNames({}, 'fr', hass).name('Gym')).toBe('Gym');
  });
  test('a word that is the same in both languages stays', () => {
    expect(createNames({}, 'en', hass).name('light.plain')).toBe('Garage');
    expect(createNames({}, 'fr', hass).name('light.plain')).toBe('Garage');
  });
  test('a language with no column reads the name as given', () => {
    expect(createNames({}, 'de', hass).name('salon')).toBe('Salon');
    expect(createNames({}, '', hass).name('living')).toBe('Living room');
  });
  test('a region or a capital on the language still picks the column', () => {
    expect(createNames({}, 'fr-CA', hass).name('living')).toBe('Salon');
    expect(createNames({}, 'FR', hass).name('living')).toBe('Salon');
    expect(createNames({}, 'en-GB', hass).name('salon')).toBe('Living room');
  });
  test('the table has the 18 rows the spec lists, by their English keys', () => {
    expect(ROOM_NAMES.map(([en]) => en)).toEqual([
      'Living room',
      'Kitchen',
      'Bedroom',
      'Main bedroom',
      'Office',
      'Bathroom',
      'Dining room',
      'Laundry room',
      'Laundry',
      'Basement',
      'Entrance',
      'Hallway',
      'Garage',
      'Outside',
      'Backyard',
      'Deck',
      'Vestibule',
      'Attic',
    ]);
  });
  test('English reads each French word of the list as the English one', () => {
    const {name} = createNames({}, 'en', null);
    const pairs = [
      ['Salon', 'Living room'],
      ['Cuisine', 'Kitchen'],
      ['Chambre', 'Bedroom'],
      ['Chambre principale', 'Main bedroom'],
      ['Bureau', 'Office'],
      ['Salle de bain', 'Bathroom'],
      ['Salle à manger', 'Dining room'],
      ['Salle de lavage', 'Laundry room'],
      ['Buanderie', 'Laundry'],
      ['Sous-sol', 'Basement'],
      ['Entrée', 'Entrance'],
      ['Couloir', 'Hallway'],
      ['Garage', 'Garage'],
      ['Extérieur', 'Outside'],
      ['Cour', 'Backyard'],
      ['Terrasse', 'Deck'],
      ['Vestibule', 'Vestibule'],
      ['Grenier', 'Attic'],
    ];
    for (const [fr, en] of pairs) expect(name(fr), fr).toBe(en);
  });
  test('French reads each English word of the list as the French one', () => {
    const {name} = createNames({}, 'fr', null);
    const pairs = [
      ['Living room', 'Salon'],
      ['Kitchen', 'Cuisine'],
      ['Bedroom', 'Chambre'],
      ['Main bedroom', 'Chambre principale'],
      ['Office', 'Bureau'],
      ['Bathroom', 'Salle de bain'],
      ['Dining room', 'Salle à manger'],
      ['Laundry room', 'Salle de lavage'],
      ['Laundry', 'Buanderie'],
      ['Basement', 'Sous-sol'],
      ['Entrance', 'Entrée'],
      ['Hallway', 'Couloir'],
      ['Garage', 'Garage'],
      ['Outside', 'Extérieur'],
      ['Backyard', 'Cour'],
      ['Deck', 'Terrasse'],
      ['Vestibule', 'Vestibule'],
      ['Attic', 'Grenier'],
    ];
    for (const [en, fr] of pairs) expect(name(en), en).toBe(fr);
  });
});

describe('the names: block', () => {
  const names: NamesConfig = {
    'light.lampe_salon': {en: 'Living room lamp', fr: 'Lampe du salon'},
    living: {fr: 'Séjour'},
    Gym: {en: 'Fitness room'},
    Salon: {en: 'Lounge'},
    Cuisine: {fr: '  '},
    d1: {en: 'Galley'},
  };

  test('an entity id is overridden for the language', () => {
    expect(createNames({names}, 'en', hass).name('light.lampe_salon')).toBe('Living room lamp');
    expect(createNames({names}, 'fr', hass).name('light.lampe_salon')).toBe('Lampe du salon');
  });
  test('an area id is overridden, and beats the dictionary', () => {
    expect(createNames({names}, 'fr', hass).name('living')).toBe('Séjour');
  });
  test('the exact Home Assistant name is overridden, and beats the dictionary', () => {
    expect(createNames({names}, 'en', hass).name('gym')).toBe('Fitness room');
    expect(createNames({names}, 'en', hass).name('Gym')).toBe('Fitness room');
    expect(createNames({names}, 'en', hass).name('salon')).toBe('Lounge');
  });
  test('the id wins over the name when both are given', () => {
    const both = {salon: {en: 'By id'}, Salon: {en: 'By name'}};
    expect(createNames({names: both}, 'en', hass).name('salon')).toBe('By id');
  });
  test('a device id is overridden', () => {
    expect(createNames({names}, 'en', hass).name('d1')).toBe('Galley');
  });
  test('an override for another language does not apply, so the dictionary or the name follows', () => {
    expect(createNames({names}, 'en', hass).name('living')).toBe('Living room');
    expect(createNames({names}, 'fr', hass).name('Gym')).toBe('Gym');
    expect(createNames({names}, 'fr', hass).name('salon')).toBe('Salon');
  });
  test('a blank or malformed override is ignored', () => {
    expect(createNames({names}, 'fr', hass).name('scene.cuisine')).toBe('Cuisine');
    const bad = {Gym: {en: 7}, living: 'Séjour', salon: null} as unknown as NamesConfig;
    expect(createNames({names: bad}, 'en', hass).name('Gym')).toBe('Gym');
    expect(createNames({names: bad}, 'fr', hass).name('living')).toBe('Salon');
    expect(createNames({names: bad}, 'en', hass).name('salon')).toBe('Living room');
  });
  test('the keys of Object.prototype are not overrides', () => {
    expect(createNames({names}, 'en', hass).name('constructor')).toBe('constructor');
    expect(createNames({names}, 'en', hass).name('toString')).toBe('toString');
  });
  test('a missing names: block changes nothing', () => {
    expect(createNames({}, 'fr', hass).name('living')).toBe('Salon');
    expect(createNames({names: undefined}, 'en', hass).name('salon')).toBe('Living room');
  });
});

describe('a fallback for an id Home Assistant has no name for', () => {
  test('is the answer when the house did not name the id either', () => {
    const {name} = createNames({}, 'en', hass);
    expect(name('light.nameless', 'Scene')).toBe('Scene');
    expect(name('light.numeric', '')).toBe('');
    expect(name('d3', 'TV')).toBe('TV');
    expect(createNames({}, 'fr', null).name('scene.movie', 'Scene')).toBe('Scene');
  });
  test('gives way to an override by that id, the first link of the chain', () => {
    const {name} = createNames({names: {'light.nameless': {en: 'Reading light'}}}, 'en', hass);
    expect(name('light.nameless', 'Scene')).toBe('Reading light');
    expect(createNames({names: {'light.nameless': {fr: 'Liseuse'}}}, 'en', hass).name('light.nameless', 'Scene')).toBe(
      'Scene',
    );
  });
  test('is not read when Home Assistant has the name: the chain answers as without it', () => {
    expect(createNames({}, 'en', hass).name('salon', 'Room')).toBe('Living room');
    expect(createNames({}, 'en', hass).name('gym', 'Room')).toBe('Gym');
    expect(createNames({names: {Salon: {en: 'Lounge'}}}, 'en', hass).name('salon', 'Room')).toBe('Lounge');
  });
  test('a name key with a fallback is an id Home Assistant does not know, so the fallback answers', () => {
    expect(createNames({}, 'en', hass).name('Salon', 'Room')).toBe('Room');
  });
});

describe('the hass is read when a name is asked for', () => {
  test('a name changed in Home Assistant is read at once', () => {
    const live = {...hass, states: {...hass.states}};
    const {name} = createNames({}, 'en', live);
    expect(name('light.nameless')).toBe('light.nameless');
    live.states['light.nameless'] = entity('light.nameless', 'on', {friendly_name: 'Salle de bain'});
    expect(name('light.nameless')).toBe('Bathroom');
  });
});
