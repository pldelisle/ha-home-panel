// lightsModel and sheetModel from the test house, in English and French: what the pane's line, the card, the tiles, the strip and a room's
// sheet say, on, off, unavailable, linked, with and without Adaptive Lighting, for an admin and for anyone else.
import {describe, expect, test} from 'vitest';
import type {HassEntities} from '../../../../src/core/hass.ts';
import {readLights} from '../../../../src/features/lights/inputs.ts';
import {lightsModel, sheetModel, type LightsDeps} from '../../../../src/features/lights/model.ts';
import {FULL_CFG, LINK_CFG} from '../../../e2e/houses.ts';
import {entity} from '../../fake-hass.ts';
import {depsOf, fullHouse, houseOf, NOW, readingOf, storeOf, type Language} from '../media/support.ts';

type House = typeof fullHouse;
const SUN = {rise: NOW - 6 * 36e5, noon: NOW, set: NOW + 5 * 36e5};

/** The test house with some states replaced: `[id, state, attributes]`, the attributes merged over the house's. */
const withStates = (...changes: [string, string, Record<string, unknown>?][]): House => {
  const states: HassEntities = {...fullHouse.states};
  for (const [id, state, attributes] of changes)
    states[id] = entity(id, state, {...states[id]?.attributes, ...attributes});
  return {...fullHouse, states};
};
const inputsOf = (house: House = fullHouse, config: unknown = FULL_CFG, systemData: unknown = null) => {
  const store = storeOf(house, config);
  const {states, registries, names} = readingOf(house);
  return readLights(states, registries, names, store.config, systemData);
};
const deps = (language: Language = 'en', extra: Partial<LightsDeps> = {}): LightsDeps => {
  const {t, fmt} = depsOf(fullHouse, language);
  return {t, fmt, now: NOW, sun: SUN, compact: false, editing: false, isAdmin: true, ...extra};
};
const subs = (view: ReturnType<typeof lightsModel>) => view.tiles.map(tile => [tile.name, tile.sub]);

describe('lightsModel', () => {
  test('the test house in English: the line, the card and the tiles', () => {
    const view = lightsModel(inputsOf(), deps());
    expect(view.summary).toBe('4 lights on · Adaptive Lighting on everywhere');
    expect(view.card).toEqual({title: 'Lights', right: '4 lights on', empty: false});
    expect(view.emptyHint).toBeNull();
    expect(view.allOff).toEqual({show: true, count: 4, label: 'All off'});
    expect(subs(view)).toEqual([
      ['Kitchen', '2 of 3 on · 59% · 3000 K'],
      ['Living room', '71% · 2700 K'],
      ['Office', '78% · Auto'],
    ]);
    expect(view.tiles[0]).toEqual({
      key: 'kitchen',
      name: 'Kitchen',
      sub: '2 of 3 on · 59% · 3000 K',
      label: 'Kitchen: 2 of 3 on · 59% · 3000 K',
      on: true,
      available: true,
      tint: 'rgb(255,177,110)',
      linkedWith: null,
      pair: null,
      pairTint: '',
    });
    expect(view.arrange).toEqual({
      show: true,
      editing: false,
      canReset: false,
      label: 'Arrange',
      resetLabel: 'Reset order',
    });
  });

  test('in French: the catalog’s words, the layer’s spaces, and the Adaptive Lighting line in French', () => {
    const view = lightsModel(inputsOf(), deps('fr'));
    expect(view.summary).toBe('4 lumières allumées · Éclairage adaptatif actif partout');
    expect(subs(view)).toEqual([
      ['Kitchen', '2 sur 3 allumées · 59 % · 3000 K'],
      ['Living room', '71 % · 2700 K'],
      ['Office', '78 % · Auto'],
    ]);
    expect(view.tiles[2].label).toBe('Office : 78 % · Auto');
    expect(view.strip?.right).toBe('Maintenant 3800 K · actif partout');
  });

  test('a phone’s tile leaves out the colour temperature, and its strip the marks’ names', () => {
    const view = lightsModel(inputsOf(), deps('en', {compact: true}));
    expect(subs(view)[1]).toEqual(['Living room', '71%']);
    expect(view.tiles[1].label).toBe('Living room: 71% · 2700 K');
    expect(view.strip?.marks.map(m => m.text)).toEqual(['8:00 am', '2:00 pm', '7:00 pm']);
  });

  test('the strip: the sun’s marks, the live kelvin of a lit switch, else the curve’s; some on, none on', () => {
    expect(lightsModel(inputsOf(), deps()).strip).toMatchObject({
      title: 'Adaptive Lighting today',
      right: 'Now 3800 K · on everywhere',
      now: '58.33%',
      marks: [
        {at: '33.33%', text: 'Sunrise 8:00 am'},
        {at: '58.33%', text: 'Noon 2:00 pm'},
        {at: '79.17%', text: 'Sunset 7:00 pm'},
      ],
    });
    const curve = withStates(['switch.adaptive_lighting_office', 'on', {color_temp_kelvin: null}]);
    expect(lightsModel(inputsOf(curve), deps()).strip?.right).toBe('Now 5500 K · on everywhere');
    const off = withStates(['switch.adaptive_lighting_office', 'off']);
    expect(lightsModel(inputsOf(off), deps()).strip?.right).toBe('Off everywhere');
    expect(lightsModel(inputsOf(off), deps()).summary).toBe('4 lights on · Adaptive Lighting off everywhere');
  });

  test('two switches, one on: the line and the strip say how many', () => {
    const house = houseOf(
      [
        ['light.a', 'on', {brightness: 255}, {area_id: 'den'}],
        ['light.b', 'off', {}, {area_id: 'attic'}],
        ['switch.adaptive_lighting_a', 'on', {configured_lights: ['light.a']}, {}],
        ['switch.adaptive_lighting_b', 'off', {configured_lights: ['light.b']}, {}],
      ],
      [],
      {den: 'Den', attic: 'Attic'},
    );
    const view = lightsModel(inputsOf(house, {}), deps());
    expect(view.summary).toBe('1 light on · Adaptive Lighting on in 1 of 2');
    expect(view.strip?.right).toBe('Now 5500 K · on in 1 of 2');
    expect(subs(view)).toEqual([
      ['Attic', 'Off'],
      ['Den', '100% · Auto'],
    ]);
  });

  test('all off, unavailable, a light with no area, no Adaptive Lighting: no strip, the Other tile named', () => {
    const house = houseOf(
      [
        ['light.a', 'off', {}, {}],
        ['light.b', 'unavailable', {}, {area_id: 'den'}],
      ],
      [],
      {den: 'Den'},
    );
    const view = lightsModel(inputsOf(house, {}), deps('en', {isAdmin: false}));
    expect(view.summary).toBe('All lights off');
    expect(view.card.right).toBe('All off');
    expect(view.allOff.show).toBe(false);
    expect(view.strip).toBeNull();
    expect(subs(view)).toEqual([
      ['Den', 'Unavailable'],
      ['Other lights', 'Off'],
    ]);
    expect(view.arrange.show).toBe(false);
  });

  test('a house with no light: the card and the phone say so', () => {
    const view = lightsModel(inputsOf(houseOf([]), {}), deps());
    expect(view.card).toEqual({title: 'Lights', right: 'No lights found', empty: true});
    expect(view.emptyHint).toBe('No lights found.');
    expect(view.tiles).toEqual([]);
    expect(lightsModel(inputsOf(houseOf([]), {}), deps('fr')).emptyHint).toBe('Aucune lumière trouvée.');
  });

  test('linked rooms: each tile names its partner, the pair block’s place and colour; Arrange counts a pair as one', () => {
    const view = lightsModel(inputsOf(fullHouse, LINK_CFG), deps());
    expect(view.tiles.map(t => [t.name, t.linkedWith, t.pair, !!t.pairTint])).toEqual([
      ['Island', 'Sink', 'first', true],
      ['Sink', 'Island', 'second', false],
      ['Office', 'Living room', 'first', true],
      ['Living room', 'Office', 'second', false],
    ]);
    expect(view.tiles[0].label).toBe('Island: 59% · 3000 K · Sink');
    expect(view.arrange.show).toBe(true);
    const one = lightsModel(
      inputsOf(fullHouse, {
        ...FULL_CFG,
        light_links: [
          ['kitchen', 'office'],
          ['living_room', 'kitchen'],
        ],
      }),
      deps(),
    );
    expect(one.arrange.show).toBe(true); // the pair and the living room: two units
  });

  test('arranging: the line says how to drag, the button says Done, and Reset shows while an order is saved', () => {
    const editing = deps('en', {editing: true});
    expect(lightsModel(inputsOf(), editing)).toMatchObject({
      summary: 'Drag the lights into the order you want',
      arrange: {editing: true, canReset: false, label: 'Done'},
    });
    expect(lightsModel(inputsOf(fullHouse, FULL_CFG, {light_order: ['office']}), editing).arrange.canReset).toBe(true);
    expect(lightsModel(inputsOf(fullHouse, FULL_CFG, {light_order: ['office']}), deps()).arrange.canReset).toBe(false);
  });
});

describe('sheetModel', () => {
  test('the office: on under Auto, its two sliders, Auto and Night, no chips, the Linked with row', () => {
    const sheet = sheetModel('office', inputsOf(), deps())!;
    expect(sheet).toMatchObject({
      key: 'office',
      title: 'Office',
      sub: '78% · Auto',
      power: {on: true, available: true, label: 'Office lights', tint: 'rgb(255,206,166)'},
      brightness: {
        name: 'Brightness',
        value: 78,
        min: 0,
        max: 100,
        off: false,
        text: '78%',
        label: 'Brightness',
        valueText: '78%',
        disabled: false,
      },
      colour: {
        name: 'Colour temperature',
        value: 4000,
        min: 2000,
        max: 6500,
        night: false,
        text: '4000 K',
        label: 'Neutral white',
        valueText: '4000 K',
        disabled: false,
        warm: 'rgb(255,137,14)',
        cool: 'rgb(255,254,250)',
      },
      modes: {
        auto: {
          id: 'switch.adaptive_lighting_office',
          on: true,
          available: true,
          label: 'Auto',
          desc: 'Brightness and colour follow the time of day',
        },
        night: {
          id: 'switch.adaptive_lighting_office_sleep_mode',
          on: false,
          label: 'Night',
          desc: 'Very dim red light for the night',
        },
      },
      bulbs: null,
      link: {show: true, enabled: true, label: 'Linked with', desc: 'Moves together with another room', value: 'None'},
    });
    expect(sheet.picker.title).toBe('Link with');
    expect(sheet.picker.options.map(o => [o.key, o.name, o.sub, o.checked])).toEqual([
      ['', 'None', 'This room moves on its own', true],
      ['kitchen', 'Kitchen', '2 of 3 on · 59% · 3000 K', false],
      ['living_room', 'Living room', '71% · 2700 K', false],
    ]);
  });

  test('Night: the colour pill says Night and red, very dim; the switches’ readings follow their states', () => {
    const night = withStates(
      ['switch.adaptive_lighting_office_sleep_mode', 'on'],
      ['switch.adaptive_lighting_office', 'unavailable'],
    );
    expect(sheetModel('office', inputsOf(night), deps())!.modes?.auto).toMatchObject({on: false, available: false});
    const on = withStates(['switch.adaptive_lighting_office_sleep_mode', 'on']);
    expect(sheetModel('office', inputsOf(on), deps())).toMatchObject({
      sub: '78% · Night',
      colour: {night: true, text: 'Night', label: 'Red, very dim', valueText: 'Night'},
      modes: {night: {on: true}},
    });
    expect(sheetModel('office', inputsOf(on), deps('fr'))).toMatchObject({
      colour: {text: 'Nuit', label: 'Rouge, très tamisé'},
    });
  });

  test('the kitchen: chips for its two groups, no modes; dark, its sliders off and the colour disabled', () => {
    const kitchen = sheetModel('kitchen', inputsOf(), deps())!;
    expect(kitchen.modes).toBeNull();
    expect(kitchen.bulbs).toEqual({
      label: 'Bulbs',
      chips: [
        {id: 'light.kitchen_island', on: true, available: true, label: 'Island'},
        {id: 'light.kitchen_sink', on: false, available: true, label: 'Sink'},
      ],
    });
    expect(kitchen.colour).toMatchObject({label: 'Warm white'});
    const dark = withStates(['light.kitchen_island_1', 'off'], ['light.kitchen_island_2', 'off']);
    expect(sheetModel('kitchen', inputsOf(dark), deps())).toMatchObject({
      sub: 'Off',
      power: {on: false, tint: ''},
      brightness: {value: 0, off: true, text: 'Off', valueText: 'Off'},
      colour: {value: 4350, disabled: true, label: 'Neutral white'},
    });
  });

  test('a cool white, no colour control, unavailable', () => {
    const cool = withStates(['light.office_1', 'on', {color_temp_kelvin: 5500}]);
    expect(sheetModel('office', inputsOf(cool), deps())?.colour?.label).toBe('Cool white');
    const living = sheetModel('living_room', inputsOf(withStates(['light.living_room_1', 'unavailable'])), deps())!;
    expect(living).toMatchObject({sub: 'Unavailable', power: {available: false}, brightness: {disabled: true}});
    const plain = withStates(['light.living_room_1', 'on', {supported_color_modes: ['brightness']}]);
    expect(sheetModel('living_room', inputsOf(plain), deps())?.colour).toBeNull();
  });

  test('linked: the row names the partner; the picker checks it and says who a room is now with; a non-admin cannot change it', () => {
    const inputs = inputsOf(fullHouse, LINK_CFG);
    const island = sheetModel('light.kitchen_island', inputs, deps('en', {isAdmin: false}))!;
    expect(island.link).toEqual({
      show: true,
      enabled: false,
      label: 'Linked with',
      desc: 'Only an admin can change this',
      value: 'Sink',
    });
    expect(island.picker.back).toBe('Island');
    expect(island.picker.options.map(o => [o.name, o.checked, o.nowWith])).toEqual([
      ['None', false, ''],
      ['Sink', true, ''],
      ['Office', false, 'now with Living room'],
      ['Living room', false, 'now with Office'],
    ]);
    expect(sheetModel('light.kitchen_island', inputs, deps('fr'))!.picker.options[2].nowWith).toBe(
      'maintenant avec Living room',
    );
  });

  test('a house with one tile has no Linked with row; a tile that is gone has no sheet', () => {
    const one = houseOf([['light.a', 'on', {brightness: 128}, {area_id: 'den'}]], [], {den: 'Den'});
    expect(sheetModel('den', inputsOf(one, {}), deps())?.link.show).toBe(false);
    expect(sheetModel('garage', inputsOf(), deps())).toBeNull();
  });
});
