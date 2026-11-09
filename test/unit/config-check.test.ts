// checkConfig(): what is wrong with a panel config, as values. Every kind of the spec's table, with the path, the message
// key and the values written out; then what resolveConfig keeps of a config that has problems. Expected values are literals.
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {describe, expect, test} from 'vitest';
import {checkConfig, panelConfig, resolveConfig, ROOM_ICONS, type PanelConfig} from '../../src/core/config.ts';
import {en} from '../../src/core/i18n/en.ts';
import {fr} from '../../src/core/i18n/fr.ts';
import {createMessages} from '../../src/core/i18n/messages.ts';

describe('what is valid', () => {
  test('the config block of examples/configuration.yaml has no problem', () => {
    const example = parse(readFileSync('examples/configuration.yaml', 'utf8')) as {
      panel_custom: {config: unknown}[];
    };
    expect(checkConfig(example.panel_custom[0].config)).toEqual([]);
  });

  test('nothing, an empty block, and what is not a block of settings have no problem', () => {
    for (const raw of [undefined, null, {}, [], 'rooms', 5, true]) expect(checkConfig(raw)).toEqual([]);
  });

  test('Home Assistant adds _panel_custom to the config, and it is not a setting of ours', () => {
    expect(checkConfig({_panel_custom: {name: 'home-panel', module_url: '/local/x.js'}})).toEqual([]);
  });

  test('both spellings of an entity, the shorthand and the long form of a room, one value or a list', () => {
    expect(
      checkConfig({
        people: 'Jo',
        scenes: 'scene.a',
        entities: {grid_power: 'sensor.a', whT: 'sensor.b', weather: null},
        rooms: 'climate.a',
        light_links: {lights: ['a', 'b']},
        idle_stack: {reminders: {at: '8:05', lead: 10}},
        house_image: '/local/h.png',
      }),
    ).toEqual([]);
    expect(
      checkConfig({
        rooms: [
          'climate.a',
          {climate: 'climate.b', name: 'B', icon: 'bed', key: 'b', temperature: 's.t', target: 's.u', power: 's.p'},
        ],
        light_links: [['a', 'b'], {lights: ['c', 'd'], switch: 'input_boolean.l'}],
        names: {Salon: {en: 'Living room', fr: 'Salon'}},
      }),
    ).toEqual([]);
  });

  test('names parses as a record of records of text', () => {
    expect(panelConfig.is({names: {'light.lamp': {en: 'Lamp', fr: 'Lampe'}}})).toBe(true);
    expect(panelConfig.is({names: {'light.lamp': 'Lamp'}})).toBe(false);
    const typed: PanelConfig = {names: {Salon: {en: 'Living room'}}};
    expect(typed.names?.Salon.en).toBe('Living room');
  });
});

describe('config.unknownKey and config.unknownKeyHint', () => {
  test('a key that is far from every key is unknown, at the top and one level down', () => {
    expect(checkConfig({frobnicate: 1})).toEqual([
      {path: 'frobnicate', key: 'config.unknownKey', values: {path: 'frobnicate'}},
    ]);
    expect(checkConfig({car: {paint: 'red'}})).toEqual([
      {path: 'car.paint', key: 'config.unknownKey', values: {path: 'car.paint'}},
    ]);
  });

  test('peoples is people with one letter too many', () => {
    expect(checkConfig({peoples: ['Alex']})).toEqual([
      {path: 'peoples', key: 'config.unknownKeyHint', values: {path: 'peoples', hint: 'people'}},
    ]);
  });

  test('climat in a room is climate, and the room has no climate', () => {
    expect(checkConfig({rooms: [{climat: 'climate.office'}]})).toEqual([
      {path: 'rooms[0]', key: 'config.missingKey', values: {path: 'rooms[0]', missing: 'climate'}},
      {
        path: 'rooms[0].climat',
        key: 'config.unknownKeyHint',
        values: {path: 'rooms[0].climat', hint: 'climate'},
      },
    ]);
  });

  test('grid_powr under entities is grid_power', () => {
    expect(checkConfig({entities: {grid_powr: 'sensor.house_power'}})).toEqual([
      {
        path: 'entities.grid_powr',
        key: 'config.unknownKeyHint',
        values: {path: 'entities.grid_powr', hint: 'grid_power'},
      },
    ]);
  });

  test('a swapped pair of letters, and a key under a list element or a reminder, get a hint too', () => {
    expect(checkConfig({sceens: ['scene.a']})[0].values).toEqual({path: 'sceens', hint: 'scenes'});
    expect(checkConfig({idle_stack: {reminders: [{att: '20:00'}]}}).map(p => p.values)).toEqual([
      {path: 'idle_stack.reminders[0]', missing: 'at'},
      {path: 'idle_stack.reminders[0].att', hint: 'at'},
    ]);
    expect(checkConfig({light_links: [{lights: ['a', 'b'], swich: 'input_boolean.x'}]})[0].values).toEqual({
      path: 'light_links[0].swich',
      hint: 'switch',
    });
  });

  test('the hint comes from the keys valid at that level, not from the top', () => {
    // `name` is a key of a room and of the car, not of the top level
    expect(checkConfig({nam: 'x'})[0].key).toBe('config.unknownKeyHint'); // names
    expect(checkConfig({house_image: {dya: '/a.png'}})[0].values).toEqual({path: 'house_image.dya', hint: 'day'});
  });

  test('the nearest key wins', () => {
    expect(checkConfig({mode: ['x']})[0].values).toEqual({path: 'mode', hint: 'modes'});
  });
});

describe('config.unknownEntity', () => {
  test('a key under entities that no card reads, and is not near one that is', () => {
    expect(checkConfig({entities: {frobnicate: 'sensor.x'}})).toEqual([
      {path: 'entities.frobnicate', key: 'config.unknownEntity', values: {path: 'entities.frobnicate'}},
    ]);
  });

  test('Object.prototype members are not entities', () => {
    expect(checkConfig({entities: {constructor: 'sensor.x'}}).map(p => p.key)).toEqual(['config.unknownEntity']);
  });
});

describe('config.wrongType', () => {
  test('a text where a number is expected', () => {
    expect(checkConfig({idle_stack: {reminders: [{at: '20:00', lead: 'thirty'}]}})).toEqual([
      {
        path: 'idle_stack.reminders[0].lead',
        key: 'config.wrongType',
        values: {path: 'idle_stack.reminders[0].lead', expected: 'a number', got: 'text'},
      },
    ]);
  });

  test('each plain word: text, a number, yes or no, a list, a block of settings, nothing', () => {
    const wrong = (raw: unknown) => checkConfig(raw).map(p => [p.path, p.key, p.values.expected, p.values.got]);
    expect(wrong({people: 3})).toEqual([['people', 'config.wrongType', 'text', 'a number']]);
    expect(wrong({idle_stack: {enabled: 'yes'}})).toEqual([
      ['idle_stack.enabled', 'config.wrongType', 'yes or no', 'text'],
    ]);
    expect(wrong({car: {battery_kwh: true}})).toEqual([
      ['car.battery_kwh', 'config.wrongType', 'a number', 'yes or no'],
    ]);
    expect(wrong({car: 'red'})).toEqual([['car', 'config.wrongType', 'a block of settings', 'text']]);
    expect(wrong({car: ['red']})).toEqual([['car', 'config.wrongType', 'a block of settings', 'a list']]);
    expect(wrong({names: {Salon: 'Living room'}})).toEqual([
      ['names.Salon', 'config.wrongType', 'a block of settings', 'text'],
    ]);
    expect(wrong({names: ['Salon']})).toEqual([['names', 'config.wrongType', 'a block of settings', 'a list']]);
    expect(wrong({scenes: {a: 1}})).toEqual([['scenes', 'config.wrongType', 'text', 'a block of settings']]);
    expect(wrong({modes: [['x']]})).toEqual([['modes[0]', 'config.wrongType', 'text', 'a list']]);
    expect(wrong({rooms: [null]})).toEqual([['rooms[0]', 'config.wrongType', 'text', 'nothing']]);
    expect(wrong({adaptive_lighting_areas: {hall: 4}})).toEqual([
      ['adaptive_lighting_areas.hall', 'config.wrongType', 'text', 'a number'],
    ]);
    expect(wrong({entities: {grid_power: 4}})).toEqual([
      ['entities.grid_power', 'config.wrongType', 'text', 'a number'],
    ]);
  });

  test('an unquoted time that YAML read as a number is a wrong type, not a time', () => {
    // YAML 1.1 reads 20:00 as the sexagesimal number 1200
    expect(checkConfig({idle_stack: {reminders: [{at: 1200}]}})).toEqual([
      {
        path: 'idle_stack.reminders[0].at',
        key: 'config.wrongType',
        values: {path: 'idle_stack.reminders[0].at', expected: 'text', got: 'a number'},
      },
    ]);
  });
});

describe('config.notOneOf', () => {
  test('an icon outside the list names the list', () => {
    expect(checkConfig({rooms: [{climate: 'climate.a', icon: 'couch'}]})).toEqual([
      {
        path: 'rooms[0].icon',
        key: 'config.notOneOf',
        values: {
          path: 'rooms[0].icon',
          got: 'couch',
          options: 'sofa, door, desk, bed, bath, drop, car, house, therm',
        },
      },
    ]);
    expect(ROOM_ICONS.join(', ')).toBe('sofa, door, desk, bed, bath, drop, car, house, therm');
  });
});

describe('config.notAPair', () => {
  test('a link of one card, of three, or of something else', () => {
    const at = (path: string) => ({path, key: 'config.notAPair', values: {path}});
    expect(checkConfig({light_links: [['office']]})).toEqual([at('light_links[0]')]);
    expect(checkConfig({light_links: [['a', 'b', 'c']]})).toEqual([at('light_links[0]')]);
    expect(checkConfig({light_links: [['a', 3]]})).toEqual([at('light_links[0]')]);
    expect(checkConfig({light_links: ['nonsense']})).toEqual([at('light_links[0]')]);
    expect(checkConfig({light_links: 5})).toEqual([at('light_links')]);
  });

  test('a pair written bare, not in a list, is a list of two texts', () => {
    expect(checkConfig({light_links: ['office', 'hallway']}).map(p => p.path)).toEqual([
      'light_links[0]',
      'light_links[1]',
    ]);
  });

  test('the lights of a link with a switch are a pair too, and a lights key is required', () => {
    expect(checkConfig({light_links: [{lights: ['a'], switch: 'input_boolean.x'}]})).toEqual([
      {path: 'light_links[0].lights', key: 'config.notAPair', values: {path: 'light_links[0].lights'}},
    ]);
    expect(checkConfig({light_links: [{switch: 'input_boolean.x'}]})).toEqual([
      {path: 'light_links[0]', key: 'config.missingKey', values: {path: 'light_links[0]', missing: 'lights'}},
    ]);
  });
});

describe('config.notATime', () => {
  test('a reminder time that is not HH:MM', () => {
    expect(checkConfig({idle_stack: {reminders: [{at: '8pm'}]}})).toEqual([
      {
        path: 'idle_stack.reminders[0].at',
        key: 'config.notATime',
        values: {path: 'idle_stack.reminders[0].at', got: '8pm'},
      },
    ]);
  });

  test('8:00 and 20:00 are times, as the resolver has always read them', () => {
    expect(checkConfig({idle_stack: {reminders: [{at: '8:00'}, {at: ' 20:00 '}]}})).toEqual([]);
  });
});

describe('config.missingKey', () => {
  test('a room object without a thermostat, and a reminder without a time', () => {
    expect(checkConfig({rooms: ['climate.a', {name: 'Office'}]})).toEqual([
      {path: 'rooms[1]', key: 'config.missingKey', values: {path: 'rooms[1]', missing: 'climate'}},
    ]);
    expect(checkConfig({idle_stack: {reminders: [{title: 'Bedtime'}]}})).toEqual([
      {
        path: 'idle_stack.reminders[0]',
        key: 'config.missingKey',
        values: {path: 'idle_stack.reminders[0]', missing: 'at'},
      },
    ]);
  });
});

describe('the catalog has a message for every kind', () => {
  test('every config.* key is in English and in French, with the spec text in English', () => {
    expect(en['config.unknownKey']).toBe('{path}: unknown setting.');
    expect(en['config.unknownKeyHint']).toBe('{path}: unknown setting. Did you mean {hint}?');
    expect(en['config.unknownEntity']).toBe('{path}: not an entity the panel reads. See the example configuration.');
    expect(en['config.wrongType']).toBe('{path}: expected {expected}, got {got}.');
    expect(en['config.notOneOf']).toBe('{path}: {got} is not one of {options}.');
    expect(en['config.notAPair']).toBe('{path}: a link needs exactly two cards.');
    expect(en['config.notATime']).toBe('{path}: {got} is not a time like 20:00.');
    expect(en['config.missingKey']).toBe('{path}: {missing} is required.');
    expect(en['config.title']).toBe("Check the panel's configuration");
    expect(Object.keys(fr).filter(k => k.startsWith('config.'))).toEqual(
      Object.keys(en).filter(k => k.startsWith('config.')),
    );
  });
});

describe('the messages read as sentences', () => {
  const say = (language: string, key: Parameters<ReturnType<typeof createMessages>['t']>[0], values = {}) =>
    createMessages({language, tag: language}).t(key, values);

  test('a problem fills its message, in English and in French', () => {
    const [hint] = checkConfig({peoples: ['Alex']});
    expect(say('en', hint.key, hint.values)).toBe('peoples: unknown setting. Did you mean people?');
    expect(say('fr', hint.key, hint.values)).toBe('peoples : réglage inconnu. Vouliez-vous écrire people?');
    const [wrong] = checkConfig({idle_stack: {reminders: [{at: '20:00', lead: 'thirty'}]}});
    expect(say('en', wrong.key, wrong.values)).toBe('idle_stack.reminders[0].lead: expected a number, got text.');
  });

  test('every kind fills in both languages, with the values the checker gives it', () => {
    const problems = checkConfig({
      frobnicate: 1,
      peoples: [],
      entities: {frobnicate: 'sensor.a'},
      car: 'red',
      rooms: [{climate: 'climate.a', icon: 'couch'}, {name: 'x'}],
      light_links: [['one']],
      idle_stack: {reminders: [{at: '8pm'}]},
    });
    expect(new Set(problems.map(p => p.key)).size).toBe(8);
    for (const p of problems)
      for (const language of ['en', 'fr']) expect(say(language, p.key, p.values), p.path).toContain(p.path);
  });

  test('the lead line counts the settings', () => {
    expect(say('en', 'config.intro', {n: 1})).toBe('One setting could not be used and was ignored:');
    expect(say('en', 'config.intro', {n: 3})).toBe('3 settings could not be used and were ignored:');
    expect(say('fr', 'config.intro', {n: 1})).toBe("Un réglage n'a pas pu être utilisé et a été ignoré :");
    expect(say('fr', 'config.intro', {n: 3})).toBe("3 réglages n'ont pas pu être utilisés et ont été ignorés :");
    expect(say('en', 'config.footer')).toBe('Fix configuration.yaml and restart Home Assistant.');
    expect(say('fr', 'config.footer')).toBe('Corrigez configuration.yaml, puis redémarrez Home Assistant.');
  });
});

describe('resolveConfig keeps what is understood', () => {
  const rooms = (raw: unknown) => resolveConfig(raw).rooms.map(r => [r.climate, r.icon]);

  test('a bad room is dropped and the other rooms are kept', () => {
    expect(rooms({rooms: ['climate.bedroom', {name: 'Office'}, 'climate.garage']})).toEqual([
      ['climate.bedroom', 'bed'],
      ['climate.garage', 'car'],
    ]);
    expect(rooms({rooms: ['climate.bedroom', {climat: 'climate.office'}, 'climate.garage']}).length).toBe(2);
  });

  test('a bad icon is dropped, so the icon is guessed and the room stays', () => {
    expect(rooms({rooms: [{climate: 'climate.bedroom', icon: 'couch'}]})).toEqual([['climate.bedroom', 'bed']]);
  });

  test('a valid light link stays beside a bad one, and a bad switch keeps the link without it', () => {
    expect(
      resolveConfig({
        light_links: [['a', 'b'], ['only-one'], {lights: ['c', 'd'], switch: 7}, {lights: 'e'}],
      }).lightLinks,
    ).toEqual([
      {keys: ['a', 'b'], sw: null},
      {keys: ['c', 'd'], sw: null},
    ]);
  });

  test('a bad reminder is dropped and the good one is kept, a bad lead falls back to 30', () => {
    expect(
      resolveConfig({
        idle_stack: {reminders: [{at: '8pm', title: 'A'}, {title: 'B'}, {at: '07:30', title: 'C', lead: 'soon'}]},
      }).stack.reminders,
    ).toEqual([{at: '07:30', title: 'C', text: '', lead: 30}]);
  });

  test('a bad leaf takes its default, a bad key is ignored, the rest of the config applies', () => {
    const c = resolveConfig({
      peoples: ['Alex'],
      people: 7,
      car: {name: 'EV', battery_kwh: 'big', paint: 'red'},
      scenes: ['scene.a'],
      names: {Salon: 'x', Den: {en: 'Den'}},
      entities: {grid_powr: 'sensor.x', whT: 'sensor.tank'},
    });
    expect(c.people).toEqual([]);
    expect(c.car).toEqual({name: 'EV', color: null, battery_kwh: null});
    expect(c.scenes).toEqual(['scene.a']);
    expect(c.names).toEqual({Den: {en: 'Den'}});
    expect(c.entities.grid).toBe(null);
    expect(c.entities.whT).toBe('sensor.tank');
  });

  test('the input is not changed', () => {
    const raw = {rooms: ['climate.a', {name: 'x'}], peoples: ['A']};
    resolveConfig(raw);
    expect(raw).toEqual({rooms: ['climate.a', {name: 'x'}], peoples: ['A']});
  });

  test('a config that is not a block of settings is empty', () => {
    expect(resolveConfig('rooms').rooms).toEqual([]);
    expect(resolveConfig(['a']).people).toEqual([]);
    expect(resolveConfig(null).stack).toEqual({on: true, sunriseOff: false, reminders: []});
  });
});
