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
    expect(checkConfig({nam: 'x'})).toEqual([{path: 'nam', key: 'config.unknownKey', values: {path: 'nam'}}]);
    expect(checkConfig({house_image: {dya: '/a.png'}})[0].values).toEqual({path: 'house_image.dya', hint: 'day'});
  });

  test('the nearest key wins', () => {
    expect(checkConfig({mode: ['x']})[0].values).toEqual({path: 'mode', hint: 'modes'});
  });

  // a hint needs a plausible match: two edits at most, and no more than a third of the longer word, one edit at least
  test('a short key is not matched to another short key two edits away', () => {
    const entity = (key: string) => checkConfig({entities: {[key]: 'sensor.x'}}).map(p => [p.key, p.values]);
    // foo is two edits from lo and low, temp from tend, ac from hi: each would be a false hint
    expect(entity('foo')).toEqual([['config.unknownEntity', {path: 'entities.foo'}]]);
    expect(entity('temp')).toEqual([['config.unknownEntity', {path: 'entities.temp'}]]);
    expect(entity('ac')).toEqual([['config.unknownEntity', {path: 'entities.ac'}]]);
    expect(entity('far_away_key')).toEqual([['config.unknownEntity', {path: 'entities.far_away_key'}]]);
    expect(checkConfig({foo: 1})).toEqual([{path: 'foo', key: 'config.unknownKey', values: {path: 'foo'}}]);
  });

  test('one edit is a hint at any length, two edits from six letters up', () => {
    const entity = (key: string) => checkConfig({entities: {[key]: 'sensor.x'}})[0].values;
    expect(entity('hii')).toEqual({path: 'entities.hii', hint: 'hi'});
    expect(entity('windd')).toEqual({path: 'entities.windd', hint: 'wind'});
    expect(entity('grid_pwr')).toEqual({path: 'entities.grid_pwr', hint: 'grid_power'});
    expect(entity('humidty')).toEqual({path: 'entities.humidty', hint: 'humidity'});
    expect(checkConfig({sceenss: ['a']})[0].values).toEqual({path: 'sceenss', hint: 'scenes'});
  });

  test('_panel_custom is accepted but never suggested: panel_custom is just unknown', () => {
    expect(checkConfig({panel_custom: {}})).toEqual([
      {path: 'panel_custom', key: 'config.unknownKey', values: {path: 'panel_custom'}},
    ]);
    expect(checkConfig({_panel_custom: {}})).toEqual([]);
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
        values: {path: 'idle_stack.reminders[0].lead', expected: 'number', got: 'text'},
      },
    ]);
  });

  // the values name a plain word (the message chooses its wording in each language), never a type name
  test('each plain word: text, number, yesno, list, block, nothing', () => {
    const wrong = (raw: unknown) => checkConfig(raw).map(p => [p.path, p.key, p.values.expected, p.values.got]);
    expect(wrong({people: 3})).toEqual([['people', 'config.wrongType', 'text', 'number']]);
    expect(wrong({idle_stack: {enabled: 'yes'}})).toEqual([
      ['idle_stack.enabled', 'config.wrongType', 'yesno', 'text'],
    ]);
    expect(wrong({car: {battery_kwh: true}})).toEqual([['car.battery_kwh', 'config.wrongType', 'number', 'yesno']]);
    expect(wrong({car: 'red'})).toEqual([['car', 'config.wrongType', 'block', 'text']]);
    expect(wrong({car: ['red']})).toEqual([['car', 'config.wrongType', 'block', 'list']]);
    expect(wrong({names: {Salon: 'Living room'}})).toEqual([['names.Salon', 'config.wrongType', 'block', 'text']]);
    expect(wrong({names: ['Salon']})).toEqual([['names', 'config.wrongType', 'block', 'list']]);
    expect(wrong({scenes: {a: 1}})).toEqual([['scenes', 'config.wrongType', 'text', 'block']]);
    expect(wrong({modes: [['x']]})).toEqual([['modes[0]', 'config.wrongType', 'text', 'list']]);
    expect(wrong({rooms: [null]})).toEqual([['rooms[0]', 'config.wrongType', 'text', 'nothing']]);
    expect(wrong({adaptive_lighting_areas: {hall: 4}})).toEqual([
      ['adaptive_lighting_areas.hall', 'config.wrongType', 'text', 'number'],
    ]);
    expect(wrong({entities: {grid_power: 4}})).toEqual([['entities.grid_power', 'config.wrongType', 'text', 'number']]);
  });

  test('a value that no YAML holds is a value, not a type name', () => {
    expect(checkConfig({car: {battery_kwh: 10n}}).map(p => p.values)).toEqual([
      {path: 'car.battery_kwh', expected: 'number', got: 'other'},
    ]);
  });

  test('an unquoted time that YAML read as a number is a wrong type, not a time', () => {
    // YAML 1.1 reads 20:00 as the sexagesimal number 1200
    expect(checkConfig({idle_stack: {reminders: [{at: 1200}]}})).toEqual([
      {
        path: 'idle_stack.reminders[0].at',
        key: 'config.wrongType',
        values: {path: 'idle_stack.reminders[0].at', expected: 'text', got: 'number'},
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

  test('a number outside the list is named, and what is not text or a number is a wrong type, not a word in the list', () => {
    expect(checkConfig({rooms: [{climate: 'climate.a', icon: 5}]})[0].values).toEqual({
      path: 'rooms[0].icon',
      got: '5',
      options: 'sofa, door, desk, bed, bath, drop, car, house, therm',
    });
    expect(checkConfig({rooms: [{climate: 'climate.a', icon: ['bed']}]})).toEqual([
      {
        path: 'rooms[0].icon',
        key: 'config.wrongType',
        values: {path: 'rooms[0].icon', expected: 'text', got: 'list'},
      },
    ]);
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

describe('an undefined value is a setting that is not there', () => {
  test('an undefined optional value is no problem, and the others are kept', () => {
    expect(checkConfig({entities: {grid: undefined, whT: 'sensor.x'}})).toEqual([]);
    expect(checkConfig({car: {name: undefined}, people: undefined, names: {a: undefined}})).toEqual([]);
    expect(resolveConfig({entities: {grid: undefined, whT: 'sensor.tank'}}).entities.whT).toBe('sensor.tank');
    expect(resolveConfig({names: {a: undefined, b: {en: 'B'}}}).names).toEqual({b: {en: 'B'}});
  });

  test('a required key that is undefined is missing, and only that', () => {
    expect(checkConfig({rooms: [{climate: undefined, name: 'Office'}]})).toEqual([
      {path: 'rooms[0]', key: 'config.missingKey', values: {path: 'rooms[0]', missing: 'climate'}},
    ]);
    expect(checkConfig({light_links: [{lights: undefined}]})[0].key).toBe('config.missingKey');
  });

  test('an undefined list element is a wrong type of its own, not a missing key of the list', () => {
    expect(checkConfig({scenes: [undefined]})).toEqual([
      {
        path: 'scenes[0]',
        key: 'config.wrongType',
        values: {path: 'scenes[0]', expected: 'text', got: 'nothing'},
      },
    ]);
    expect(resolveConfig({scenes: ['scene.a', undefined, 'scene.b']}).scenes).toEqual(['scene.a', 'scene.b']);
  });
});

describe('the catalog has a message for every kind', () => {
  test('every config.* key is in English and in French, with the spec text in English', () => {
    expect(en['config.unknownKey']).toBe('{path}: unknown setting.');
    expect(en['config.unknownKeyHint']).toBe('{path}: unknown setting. Did you mean {hint}?');
    expect(en['config.unknownEntity']).toBe('{path}: not an entity the panel reads. See the example configuration.');
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
    expect(say('fr', hint.key, hint.values)).toBe('peoples : réglage inconnu. Vouliez-vous écrire people ?');
    const [wrong] = checkConfig({idle_stack: {reminders: [{at: '20:00', lead: 'thirty'}]}});
    expect(say('en', wrong.key, wrong.values)).toBe('idle_stack.reminders[0].lead: expected a number, got text.');
    expect(say('fr', wrong.key, wrong.values)).toBe('idle_stack.reminders[0].lead : attendu un nombre, reçu du texte.');
  });

  test('every kind reads as a sentence in both languages, with the values the checker gives it', () => {
    const problems = checkConfig({
      frobnicate: 1,
      peoples: [],
      entities: {frobnicate: 'sensor.a'},
      car: 'red',
      rooms: [{climate: 'climate.a', icon: 'couch'}, {name: 'x'}],
      light_links: [['one']],
      idle_stack: {reminders: [{at: '8pm'}]},
    });
    const sentences = problems.map(p => [p.key, say('en', p.key, p.values), say('fr', p.key, p.values)]);
    expect(sentences).toEqual([
      [
        'config.wrongType',
        'car: expected a block of settings, got text.',
        'car : attendu un bloc de réglages, reçu du texte.',
      ],
      [
        'config.notOneOf',
        'rooms[0].icon: couch is not one of sofa, door, desk, bed, bath, drop, car, house, therm.',
        'rooms[0].icon : couch ne fait pas partie de sofa, door, desk, bed, bath, drop, car, house, therm.',
      ],
      ['config.missingKey', 'rooms[1]: climate is required.', 'rooms[1] : climate est obligatoire.'],
      [
        'config.notAPair',
        'light_links[0]: a link needs exactly two cards.',
        'light_links[0] : un lien doit relier exactement deux cartes.',
      ],
      [
        'config.notATime',
        'idle_stack.reminders[0].at: 8pm is not a time like 20:00.',
        "idle_stack.reminders[0].at : 8pm n'est pas une heure comme 20:00.",
      ],
      ['config.unknownKey', 'frobnicate: unknown setting.', 'frobnicate : réglage inconnu.'],
      [
        'config.unknownKeyHint',
        'peoples: unknown setting. Did you mean people?',
        'peoples : réglage inconnu. Vouliez-vous écrire people ?',
      ],
      [
        'config.unknownEntity',
        'entities.frobnicate: not an entity the panel reads. See the example configuration.',
        "entities.frobnicate : ce n'est pas une entité que le panneau lit. Voir l'exemple de configuration.",
      ],
    ]);
  });

  test('each plain word is a word of its own in both languages', () => {
    const wrong = (expected: string, got: string) => say('en', 'config.wrongType', {path: 'x', expected, got});
    const mal = (expected: string, got: string) => say('fr', 'config.wrongType', {path: 'x', expected, got});
    const words = [
      ['text', 'text', 'du texte'],
      ['number', 'a number', 'un nombre'],
      ['yesno', 'yes or no', 'oui ou non'],
      ['list', 'a list', 'une liste'],
      ['block', 'a block of settings', 'un bloc de réglages'],
      ['nothing', 'nothing', 'rien'],
      ['other', 'a value', 'une valeur'],
    ];
    for (const [word, english, french] of words) {
      expect(wrong(word, 'text'), word).toBe(`x: expected ${english}, got text.`);
      expect(wrong('text', word), word).toBe(`x: expected text, got ${english}.`);
      expect(mal(word, 'text'), word).toBe(`x : attendu ${french}, reçu du texte.`);
      expect(mal('text', word), word).toBe(`x : attendu du texte, reçu ${french}.`);
    }
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
