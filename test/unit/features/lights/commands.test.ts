// The Lights commands as tables: each intent's inputs to the calls it makes, one row per branch of the legacy `lightCmd` and `linkTo`.
import {describe, expect, test} from 'vitest';
import type {Command} from '../../../../src/core/commands.ts';
import {
  allOff,
  isAuto,
  isNight,
  link,
  pairOf,
  setAuto,
  setBrightness,
  setColorTemp,
  setNight,
  toggleArea,
  toggleOne,
  type CommandTile,
} from '../../../../src/features/lights/commands.ts';
import {readLights} from '../../../../src/features/lights/inputs.ts';
import {LINK_CFG} from '../../../e2e/houses.ts';
import {fullHouse, readingOf, storeOf} from '../media/support.ts';

type Mode = 'auto' | 'manual' | 'night' | 'off' | 'none';
interface Spec {
  key?: string;
  ids?: string[];
  on?: string[];
  mode?: Mode;
  /** Night only: the sleep mode on while the switch is off. */
  nightAlone?: boolean;
  br?: number;
  k?: number | null;
  tunable?: string[];
  link?: CommandTile['link'];
}

/** A tile from a few facts: its lights `<key>_1` and `<key>_2`, which are on, its mode and its colour. */
function tile({
  key = 'den',
  ids,
  on = [],
  mode = 'none',
  nightAlone = false,
  br = 50,
  k = null,
  tunable,
  link = null,
}: Spec = {}): CommandTile {
  const lights = ids ?? [`light.${key}_1`, `light.${key}_2`];
  const al = mode === 'none' ? null : `switch.adaptive_lighting_${key}`;
  const alOn = mode !== 'off' && mode !== 'none' && !nightAlone;
  const nightOn = mode === 'night' || nightAlone;
  return {
    key,
    ids: lights,
    al,
    link,
    mode: {
      alOn,
      nightSwitch: al && `${al}_sleep_mode`,
      nightOn,
      manual: mode === 'manual',
      auto: alOn && mode !== 'manual',
      mode: '',
    },
    state: {on, any: on.length > 0, avail: true, br, ct: null, k, tint: '', tunable: tunable ?? lights},
  };
}

const calls = (commands: Command[]) =>
  commands.map(({domain, service, data, done}) => [`${domain}.${service}`, data, ...(done ? [done.key] : [])]);
const WITH = {manualControl: true};
const WITHOUT = {manualControl: false};

describe('allOff, toggleOne, toggleArea', () => {
  test('All off turns off every lit light at once, and does nothing when none is lit', () => {
    expect(calls(allOff([tile({on: ['light.den_1']}), tile({key: 'attic', on: ['light.attic_2']})]))).toEqual([
      ['light.turn_off', {entity_id: ['light.den_1', 'light.attic_2']}],
    ]);
    expect(allOff([tile()])).toEqual([]);
  });

  test('a chip toggles its bulb; a tile switches its pair by its own lights', () => {
    expect(calls(toggleOne('light.den_1'))).toEqual([['light.toggle', {entity_id: 'light.den_1'}]]);
    const lit = tile({on: ['light.den_1']});
    const dark = tile({key: 'attic'});
    expect(calls(toggleArea([lit, dark]))).toEqual([
      ['light.turn_off', {entity_id: ['light.den_1', 'light.den_2', 'light.attic_1', 'light.attic_2']}],
    ]);
    expect(calls(toggleArea([dark, lit]))[0][0]).toBe('light.turn_on');
  });
});

describe('Auto', () => {
  test.each([
    [
      'on, the switch off, with the service',
      tile({mode: 'off'}),
      true,
      WITH,
      [
        ['switch.turn_on', {entity_id: 'switch.adaptive_lighting_den'}],
        [
          'adaptive_lighting.set_manual_control',
          {entity_id: 'switch.adaptive_lighting_den', lights: ['light.den_1', 'light.den_2'], manual_control: false},
          'lights.autoOn',
        ],
      ],
    ],
    [
      'on, the switch on but held by hand, without the service: nothing to send',
      tile({mode: 'manual'}),
      true,
      WITHOUT,
      [],
    ],
    [
      'on, the switch off, without the service',
      tile({mode: 'off'}),
      true,
      WITHOUT,
      [['switch.turn_on', {entity_id: 'switch.adaptive_lighting_den'}, 'lights.autoOn']],
    ],
    [
      'off, Night on: both switches off',
      tile({mode: 'night'}),
      false,
      WITH,
      [
        ['switch.turn_off', {entity_id: 'switch.adaptive_lighting_den'}],
        ['switch.turn_off', {entity_id: 'switch.adaptive_lighting_den_sleep_mode'}, 'lights.autoOff'],
      ],
    ],
    [
      'off, Night off',
      tile({mode: 'auto'}),
      false,
      WITH,
      [['switch.turn_off', {entity_id: 'switch.adaptive_lighting_den'}, 'lights.autoOff']],
    ],
    ['a tile with no switch sends nothing', tile(), true, WITH, []],
  ] as const)('%s', (_name, x, on, services, expected) => {
    expect(calls(setAuto([x], on, services))).toEqual(expected);
  });

  test('a pair is under Auto when every tile with a switch is', () => {
    expect(isAuto([tile({mode: 'auto'}), tile({key: 'attic'})])).toBe(true);
    expect(isAuto([tile({mode: 'auto'}), tile({key: 'attic', mode: 'manual'})])).toBe(false);
  });
});

describe('Night', () => {
  test('on hands each room with a sleep mode back to Auto; off only turns the sleep mode off', () => {
    expect(calls(setNight([tile({mode: 'manual'}), tile({key: 'attic'})], true, WITH))).toEqual([
      ['switch.turn_on', {entity_id: 'switch.adaptive_lighting_den_sleep_mode'}],
      [
        'adaptive_lighting.set_manual_control',
        {entity_id: 'switch.adaptive_lighting_den', lights: ['light.den_1', 'light.den_2'], manual_control: false},
        'lights.nightOn',
      ],
    ]);
    expect(calls(setNight([tile({mode: 'night'})], false, WITH))).toEqual([
      ['switch.turn_off', {entity_id: 'switch.adaptive_lighting_den_sleep_mode'}, 'lights.nightOff'],
    ]);
  });

  test('a room is in Night while its sleep mode and its switch are on', () => {
    expect(isNight(tile({mode: 'night'}))).toBe(true);
    expect(isNight(tile({mode: 'off', nightAlone: true}))).toBe(false);
  });
});

describe('by hand', () => {
  const leaveWith = [
    'adaptive_lighting.set_manual_control',
    {entity_id: 'switch.adaptive_lighting_den', lights: ['light.den_1', 'light.den_2'], manual_control: true},
  ];
  const leaveWithout = ['switch.turn_off', {entity_id: 'switch.adaptive_lighting_den'}];
  const nightOff = ['switch.turn_off', {entity_id: 'switch.adaptive_lighting_den_sleep_mode'}];

  test.each([
    [
      'under Auto, with the service: held by hand, then the lit light, and the toast',
      tile({mode: 'auto', on: ['light.den_1']}),
      40,
      WITH,
      [leaveWith, ['light.turn_on', {entity_id: ['light.den_1'], brightness_pct: 40}, 'lights.setByHand']],
    ],
    [
      'under Night, without the service: Night off, the switch off, then every light when none is lit',
      tile({mode: 'night'}),
      40,
      WITHOUT,
      [
        nightOff,
        leaveWithout,
        ['light.turn_on', {entity_id: ['light.den_1', 'light.den_2'], brightness_pct: 40}, 'lights.setByHand'],
      ],
    ],
    [
      'already by hand: the light alone, no toast',
      tile({mode: 'manual', on: ['light.den_2']}),
      40,
      WITH,
      [['light.turn_on', {entity_id: ['light.den_2'], brightness_pct: 40}]],
    ],
    [
      'under one percent: every light off',
      tile({on: ['light.den_2']}),
      0.4,
      WITH,
      [['light.turn_off', {entity_id: ['light.den_1', 'light.den_2']}]],
    ],
  ] as const)('brightness %s', (_name, x, pct, services, expected) => {
    expect(calls(setBrightness([x], pct, services))).toEqual(expected);
  });

  test('colour goes only to the lights that take one; with none, only the leave-Auto calls go, with no toast', () => {
    const x = tile({mode: 'auto', on: ['light.den_1', 'light.den_2'], tunable: ['light.den_2']});
    expect(calls(setColorTemp([x], 2700, WITH))).toEqual([
      leaveWith,
      ['light.turn_on', {entity_id: ['light.den_2'], color_temp_kelvin: 2700}, 'lights.setByHand'],
    ]);
    expect(calls(setColorTemp([tile({on: ['light.den_1']})], 2700, WITH))).toEqual([
      ['light.turn_on', {entity_id: ['light.den_1'], color_temp_kelvin: 2700}],
    ]);
    expect(calls(setColorTemp([tile({mode: 'auto', tunable: []})], 2700, WITH))).toEqual([leaveWith]);
  });
});

describe('link', () => {
  const pairs = {
    den: tile({key: 'den', link: {other: 'attic', first: true}}),
    attic: tile({key: 'attic', link: {other: 'den', first: false}}),
  };

  test('the new pair replaces both rooms’ old ones; the partner starts out dark when this room is', () => {
    const office = tile({key: 'office'});
    const kitchen = tile({key: 'kitchen', on: ['light.kitchen_1']});
    expect(link(office, 'kitchen', [pairs.den, pairs.attic, office, kitchen])).toEqual({
      pairs: [
        ['den', 'attic'],
        ['office', 'kitchen'],
      ],
      toast: 'lights.roomsLinked',
      commands: [{domain: 'light', service: 'turn_off', data: {entity_id: ['light.kitchen_1', 'light.kitchen_2']}}],
    });
    expect(link(pairs.attic, 'office', [pairs.den, pairs.attic, office])?.pairs).toEqual([['attic', 'office']]);
    expect(link(office, 'den', [pairs.den, pairs.attic, office])?.commands).toEqual([]); // both dark: nothing to copy
  });

  test.each([
    [
      'a colour set by hand goes to the bulbs that take one, the brightness to the rest',
      {mode: 'manual', k: 2700},
      ['light.p_1'],
      [
        ['light.turn_on', {entity_id: ['light.p_1'], brightness_pct: 60, color_temp_kelvin: 2700}],
        ['light.turn_on', {entity_id: ['light.p_2'], brightness_pct: 60}],
      ],
    ],
    [
      'every partner bulb takes a colour: one call',
      {mode: 'manual', k: 2700},
      ['light.p_1', 'light.p_2'],
      [['light.turn_on', {entity_id: ['light.p_1', 'light.p_2'], brightness_pct: 60, color_temp_kelvin: 2700}]],
    ],
    [
      'under Auto the colour follows on its own: the brightness only',
      {mode: 'auto', k: 2700},
      ['light.p_1'],
      [['light.turn_on', {entity_id: ['light.p_1', 'light.p_2'], brightness_pct: 60}]],
    ],
    [
      'no known colour: the brightness only',
      {mode: 'manual', k: null},
      ['light.p_1'],
      [['light.turn_on', {entity_id: ['light.p_1', 'light.p_2'], brightness_pct: 60}]],
    ],
    [
      'a partner with no tunable bulb: the brightness only',
      {mode: 'manual', k: 2700},
      [],
      [['light.turn_on', {entity_id: ['light.p_1', 'light.p_2'], brightness_pct: 60}]],
    ],
  ] as const)('copying a lit room: %s', (_name, mine, tunable, expected) => {
    const me = tile({key: 'me', on: ['light.me_1'], br: 60, ...mine});
    const partner = tile({key: 'p', tunable: [...tunable]});
    expect(calls(link(me, 'p', [me, partner])!.commands)).toEqual(expected);
  });

  test('None unlinks the room and keeps the other pairs; picking the current partner, or a tile that is gone, changes nothing', () => {
    const office = tile({key: 'office', link: {other: 'kitchen', first: true}});
    const kitchen = tile({key: 'kitchen', link: {other: 'office', first: false}});
    expect(link(kitchen, '', [pairs.den, pairs.attic, office, kitchen])).toEqual({
      pairs: [['den', 'attic']],
      toast: 'lights.roomUnlinked',
      commands: [],
    });
    expect(link(kitchen, 'office', [office, kitchen])).toBeNull();
    expect(link(kitchen, 'garage', [office, kitchen])).toBeNull();
    expect(link(tile(), '', [tile()])).toBeNull();
  });
});

describe('pairOf, on the test house', () => {
  test('a linked tile acts with its partner, a tile alone by itself', () => {
    const store = storeOf(fullHouse, LINK_CFG);
    const {states, registries, names} = readingOf(fullHouse);
    const {tiles} = readLights(states, registries, names, store.config, null);
    expect(pairOf(tiles[1], tiles).map(t => t.key)).toEqual(['light.kitchen_sink', 'light.kitchen_island']);
    expect(pairOf({...tiles[2], link: null}, tiles).map(t => t.key)).toEqual(['office']);
    // the island's tile is lit, so the pair goes off, the sink's bulb with it
    expect(calls(toggleArea(pairOf(tiles[0], tiles)))).toEqual([
      ['light.turn_off', {entity_id: ['light.kitchen_island_1', 'light.kitchen_island_2', 'light.kitchen_sink_1']}],
    ]);
  });
});
