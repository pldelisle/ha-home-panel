// The fixture recorder: the anonymiser on a literal house and a literal mapping, the scan that finds a leftover, `main` driven
// with a fake connection and a temporary folder, and the personal-data scan over a fixture folder. No Home Assistant is
// involved, and no name in this file belongs to a real house; strings that a banned pattern would match are written in two pieces.
// Pattern: example-based tests at the pure function and at the shell's parameters (ADR 0005, Meszaros, xUnit Test Patterns).
// Must not: open a socket, read the environment, or write anywhere but a temporary folder.
import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DROPPED_KEYS, anonymise, replacerOf, scan, slug} from '../../scripts/lib/anonymise.mjs';
import {fetchHouse, main, parseArguments, stringify, STATISTIC_SPANS} from '../../scripts/record-fixture.mjs';
import {BANNED_PATTERNS, bannedHits, scannedFiles, scannedTexts} from '../personal-data.mjs';
import * as full from '../houses/full.mjs';
import {REFERENCE_MS} from '../houses/clock.mjs';
import {readHouse} from '../houses/read.mjs';

// two pieces, so that this file holds no string the personal-data scan looks for
const BANNED_TOWN = 'masc' + 'ouche';
const BANNED_ADDRESS = '192.168.' + '1.20';
// the pattern that finds the town, as the scan prints it
const TOWN_RULE = String(BANNED_PATTERNS.find(re => re.test(BANNED_TOWN)));

const MAPPING = {
  entities: {
    'sensor.real_town_temperature': 'sensor.springfield_temperature',
    'person.zoe': 'robin',
    'light.cabin_lamp': 'switch.shelf_lamp',
  },
  strings: {'Real Town': 'Springfield', 'Family Name': 'Example', Real: 'Fake', Zoë: 'Robin', Cabin: 'Shed'},
};

/** A small house as Home Assistant's replies make it, with the real names the mapping is there to remove. */
const house = () => ({
  states: {
    'sensor.real_town_temperature': {
      entity_id: 'sensor.real_town_temperature',
      state: '4.2',
      attributes: {
        friendly_name: 'Real Town temperature',
        latitude: 45.123456,
        longitude: -73.987654,
        entity_picture: '/api/image/serve/secret/512x512',
        entity_id: ['sensor.real_town_temperature', 'binary_sensor.real_town_temperature'],
        owner: "Family Name's house",
      },
      context: {id: 'abc', parent_id: null, user_id: 'u1'},
    },
    'person.zoe': {entity_id: 'person.zoe', state: 'home', attributes: {friendly_name: 'Zoë', access_token: 'tok'}},
    'light.cabin_lamp': {entity_id: 'light.cabin_lamp', state: 'on', attributes: {friendly_name: 'Cabin lamp'}},
  },
  entities: {
    'sensor.real_town_temperature': {
      entity_id: 'sensor.real_town_temperature',
      id: 'registry-uuid',
      unique_id: 'AA:BB:CC:DD',
      config_entry_id: 'cfg',
      device_id: 'zzz-device',
      area_id: 'real_town_cabin',
      platform: 'demo',
    },
    'light.cabin_lamp': {entity_id: 'light.cabin_lamp', device_id: 'ghost-device', platform: 'demo'},
    'person.zoe': {entity_id: 'person.zoe', platform: 'person'},
  },
  devices: {
    'zzz-device': {
      id: 'zzz-device',
      name: 'Real Town thermostat',
      area_id: 'real_town_cabin',
      via_device_id: 'aaa-device',
      connections: [['mac', 'aa:bb']],
      identifiers: [['demo', '1']],
      serial_number: 'SN1',
      sw_version: '1.2',
      hw_version: '3',
      configuration_url: 'http://x',
      config_entries: ['cfg'],
      primary_config_entry: 'cfg',
    },
    'aaa-device': {id: 'aaa-device', name: 'Hub', area_id: null},
  },
  areas: {real_town_cabin: {area_id: 'real_town_cabin', name: 'Real Town cabin'}},
  statistics: {
    'hour@2026-11-02T00:00:00.000Z': {
      'sensor.real_town_temperature': [{start: 1, end: 2, mean: 3}],
    },
  },
});

describe('anonymise', () => {
  const out = anonymise(house(), MAPPING);

  test('ids are renamed in keys, ids and lists, the domain kept, whole ids only', () => {
    expect(Object.keys(out.states)).toEqual([
      'sensor.springfield_temperature',
      'person.robin', // the mapping wrote `robin` with no domain: the original's domain stays
      'light.shelf_lamp', // the mapping wrote `switch.`: the original's domain stays
    ]);
    expect(out.states['sensor.springfield_temperature'].entity_id).toBe('sensor.springfield_temperature');
    // `binary_sensor.real_town_temperature` is another entity: the id inside it is not replaced, though its words are
    expect(out.states['sensor.springfield_temperature'].attributes.entity_id).toEqual([
      'sensor.springfield_temperature',
      'binary_sensor.springfield_temperature',
    ]);
    expect(Object.keys(out.entities).sort()).toEqual(Object.keys(out.states).sort());
  });

  test('names are replaced inside attribute values, longest key first, and the same words spelled as an id', () => {
    expect(out.states['sensor.springfield_temperature'].attributes.friendly_name).toBe('Springfield temperature');
    expect(out.states['sensor.springfield_temperature'].attributes.owner).toBe("Example's house");
    expect(out.states['person.robin'].attributes.friendly_name).toBe('Robin');
    expect(out.states['light.shelf_lamp'].attributes.friendly_name).toBe('Shed lamp');
    expect(out.areas).toEqual({springfield_shed: {area_id: 'springfield_shed', name: 'Springfield shed'}});
    expect(out.entities['sensor.springfield_temperature'].area_id).toBe('springfield_shed');
    expect(out.devices.device_002.name).toBe('Springfield thermostat');
  });

  test('a short key inside a long one does not half-replace it', () => {
    const replace = replacerOf({strings: {Real: 'Fake', 'Real Town': 'Springfield', 'Real Town Hall': 'Hall'}});
    expect(replace('Real Town Hall, Real Town, Real')).toBe('Hall, Springfield, Fake');
  });

  test('an exact key wins over the slug of another key', () => {
    const replace = replacerOf({strings: {'Real Town': 'B', real_town: 'A'}});
    expect(replace('real_town and Real Town')).toBe('A and B');
  });

  test('latitude and longitude are rounded to one decimal, wherever they sit', () => {
    const attributes = out.states['sensor.springfield_temperature'].attributes;
    expect(attributes.latitude).toBe(45.1);
    expect(attributes.longitude).toBe(-74);
    expect(anonymise({states: {z: {attributes: {latitude: '45.123456', nested: {longitude: 1.26}}}}}, {})).toEqual({
      states: {z: {attributes: {latitude: '45.123456', nested: {longitude: 1.3}}}},
      entities: {},
      devices: {},
      areas: {},
    });
  });

  test('the dropped keys are gone, at every depth', () => {
    const text = JSON.stringify(out);
    for (const key of DROPPED_KEYS)
      // the device registry keeps one `id` of its own, the stable fake one, checked below
      if (key !== 'id') expect(text, key).not.toContain(`"${key}"`);
    expect(out.states['sensor.springfield_temperature'].context).toEqual({parent_id: null});
    expect(out.states['person.robin'].attributes).toEqual({friendly_name: 'Robin'});
    expect(out.entities['sensor.springfield_temperature']).not.toHaveProperty('id');
    expect(text).not.toContain('secret');
  });

  test('the device registry keeps its links under stable fake ids, in the order of the real ones', () => {
    expect(Object.keys(out.devices).sort()).toEqual(['device_001', 'device_002']);
    expect(out.devices.device_002.id).toBe('device_002');
    expect(out.devices.device_002.via_device_id).toBe('device_001');
    expect(out.devices.device_001).toEqual({id: 'device_001', name: 'Hub', area_id: null});
    expect(out.entities['sensor.springfield_temperature'].device_id).toBe('device_002');
    // a device the registry does not hold, and an entity with no device at all
    expect(out.entities['light.shelf_lamp'].device_id).toBeNull();
    expect(out.entities['person.robin']).not.toHaveProperty('device_id');
    // the order of the rows in the reply does not change the ids
    const reversed = house();
    reversed.devices = Object.fromEntries(Object.entries(reversed.devices).reverse());
    expect(anonymise(reversed, MAPPING).devices).toEqual(out.devices);
  });

  test('statistics keep their keys and rows, with the statistic ids renamed', () => {
    expect(out.statistics).toEqual({
      'hour@2026-11-02T00:00:00.000Z': {'sensor.springfield_temperature': [{start: 1, end: 2, mean: 3}]},
    });
  });

  test('a house with no registries, no statistics and an empty mapping comes back as it is, plain', () => {
    const plain = {
      states: {'sun.sun': {entity_id: 'sun.sun', state: 'above_horizon', attributes: {n: [1, null, true]}}},
    };
    expect(anonymise(plain, {})).toEqual({...plain, entities: {}, devices: {}, areas: {}});
    expect(anonymise(plain, undefined)).toEqual({...plain, entities: {}, devices: {}, areas: {}});
  });

  test('the input is not changed', () => {
    const input = house();
    anonymise(input, MAPPING);
    expect(input).toEqual(house());
  });

  test('what the replacer leaves alone: no tables, a key that slugs to nothing', () => {
    expect(replacerOf({})('Real Town sensor.x')).toBe('Real Town sensor.x');
    expect(replacerOf({entities: {}, strings: {'?': '!'}})('is it? yes')).toBe('is it! yes');
  });

  test.each([
    [{entities: []}, 'mapping.entities must be an object'],
    [{strings: 'x'}, 'mapping.strings must be an object'],
    [{strings: {'': 'x'}}, 'mapping.strings has an empty key, which would match everywhere'],
    [{strings: {a: 1}}, 'mapping.strings["a"] must be a string'],
    [{entities: {'sensor.a': null}}, 'mapping.entities["sensor.a"] must be a string'],
    [{entities: {nodomain: 'x'}}, 'mapping.entities["nodomain"] is not an entity id'],
  ])('a mapping that cannot be applied is refused: %j', (mapping, message) => {
    expect(() => replacerOf(mapping)).toThrow(message);
    expect(() => anonymise({states: {}}, mapping)).toThrow(message);
    expect(() => scan({}, mapping, [])).toThrow(message);
  });

  test('slug spells a name the way an id does', () => {
    expect(slug('Zoë  Real-Town!')).toBe('zoe_real_town');
    expect(slug('???')).toBe('');
  });
});

describe('scan', () => {
  const anonymised = anonymise(house(), MAPPING);

  test('an anonymised house has no leftover', () => {
    expect(scan(anonymised, MAPPING, BANNED_PATTERNS)).toEqual([]);
  });

  test('a mapped string left in a value is reported with its path, whatever its case or accents', () => {
    const leaky = structuredClone(anonymised);
    leaky.states['person.robin'].attributes.friendly_name = 'ZOE at the cabin';
    leaky.areas.springfield_shed.tags = ['ok', 'the REAL TOWN way'];
    expect(scan(leaky, MAPPING, [])).toEqual(
      expect.arrayContaining([
        {path: '$.states["person.robin"].attributes.friendly_name', kind: 'value', found: 'Zoë', source: 'mapping'},
        {path: '$.states["person.robin"].attributes.friendly_name', kind: 'value', found: 'Cabin', source: 'mapping'},
        {path: '$.areas.springfield_shed.tags[1]', kind: 'value', found: 'Real Town', source: 'mapping'},
      ]),
    );
  });

  test('a mapped string left in a key, in its id spelling, is reported', () => {
    const leaky = {states: {'sensor.real_town_pressure': {state: '1'}}, entities: {'sensor.real_town_temperature': {}}};
    expect(scan(leaky, MAPPING, [])).toEqual([
      {path: '$.states["sensor.real_town_pressure"]', kind: 'key', found: 'Real Town', source: 'mapping'},
      {path: '$.states["sensor.real_town_pressure"]', kind: 'key', found: 'Real', source: 'mapping'},
      {
        path: '$.entities["sensor.real_town_temperature"]',
        kind: 'key',
        found: 'sensor.real_town_temperature',
        source: 'mapping',
      },
      {path: '$.entities["sensor.real_town_temperature"]', kind: 'key', found: 'Real Town', source: 'mapping'},
      {path: '$.entities["sensor.real_town_temperature"]', kind: 'key', found: 'Real', source: 'mapping'},
    ]);
  });

  test('a banned pattern is reported with its path, mapped or not', () => {
    const leaky = {states: {a: {attributes: {note: `at ${BANNED_ADDRESS}`, list: [`near ${BANNED_TOWN}`]}}}};
    const found = scan(leaky, {}, BANNED_PATTERNS);
    expect(found.map(f => [f.path, f.source])).toEqual([
      ['$.states.a.attributes.note', 'pattern'],
      ['$.states.a.attributes.list[0]', 'pattern'],
    ]);
    expect(found[1].found).toBe(TOWN_RULE);
  });

  test('numbers and nulls hold no string to find', () => {
    expect(scan({a: 1, b: null, c: [2, false]}, MAPPING, BANNED_PATTERNS)).toEqual([]);
  });
});

describe('parseArguments', () => {
  test('--map, --out and a comma list of --statistics', () => {
    expect(parseArguments(['--map', 'm.json', '--out', 'o.json', '--statistics', 'a.b, c.d,'])).toEqual({
      map: 'm.json',
      out: 'o.json',
      statistics: ['a.b', 'c.d'],
    });
    expect(parseArguments(['--map', 'm', '--out', 'o']).statistics).toEqual([]);
  });

  test('a missing flag or an unknown one is refused', () => {
    expect(() => parseArguments(['--map', 'm'])).toThrow('--map and --out are required');
    expect(() => parseArguments(['--out', 'o'])).toThrow('--map and --out are required');
    expect(() => parseArguments(['--map', 'm', '--out', 'o', '--token', 'x'])).toThrow();
  });
});

describe('stringify', () => {
  test('is JSON: what it writes parses back to the same value', () => {
    const value = {a: [1, 'x', null], b: {c: [], d: {}}, e: [{f: 1}, {g: [true]}], h: 'quote " and \\'};
    expect(JSON.parse(stringify(value))).toEqual(value);
  });

  test('keeps a flat object or list on one line, and spreads the rest', () => {
    expect(stringify({rows: [{start: 1, mean: 2}], tags: ['a', 'b'], none: [], nothing: {}})).toBe(
      [
        '{',
        '  "rows": [',
        '    {"start": 1, "mean": 2}',
        '  ],',
        '  "tags": ["a", "b"],',
        '  "none": [],',
        '  "nothing": {}',
        '}',
      ].join('\n'),
    );
    expect(stringify('x')).toBe('"x"');
  });

  test('spreads a flat object that is too wide for a line', () => {
    const wide = {text: 'x'.repeat(250)};
    expect(stringify(wide)).toBe(`{\n  "text": "${'x'.repeat(250)}"\n}`);
  });
});

/** A connection that answers like Home Assistant, from a literal house, and records what it was asked. */
function fakeConnection(raw = rawHouse()) {
  const asked = [];
  return {
    asked,
    closed: false,
    haVersion: '2026.11.0',
    sendMessagePromise(message) {
      asked.push(message);
      const reply = {
        get_states: raw.states,
        'config/entity_registry/list': raw.entities,
        'config/device_registry/list': raw.devices,
        'config/area_registry/list': raw.areas,
        'recorder/statistics_during_period': {'sensor.real_town_temperature': [{start: 1, end: 2, mean: 3}]},
      }[message.type];
      return reply === undefined ? Promise.reject(new Error(`no reply for ${message.type}`)) : Promise.resolve(reply);
    },
    close() {
      this.closed = true;
    },
  };
}

/** The same house as an array each, the way the four messages answer. */
function rawHouse() {
  const h = house();
  return {
    states: Object.values(h.states),
    entities: Object.values(h.entities),
    devices: Object.values(h.devices),
    areas: Object.values(h.areas),
  };
}

const NOW = new Date('2026-11-09T12:00:00.000Z');

describe('fetchHouse', () => {
  test('asks for the states and the three registries and keys what comes back as hass keys it', async () => {
    const connection = fakeConnection();
    const recorded = await fetchHouse(connection, {now: NOW});
    expect(connection.asked.map(m => m.type).sort()).toEqual([
      'config/area_registry/list',
      'config/device_registry/list',
      'config/entity_registry/list',
      'get_states',
    ]);
    expect(recorded.recordedAt).toBe('2026-11-09T12:00:00.000Z');
    expect(recorded.source).toBe('home-assistant 2026.11.0');
    expect(Object.keys(recorded.states)).toEqual(Object.keys(house().states));
    expect(Object.keys(recorded.devices)).toEqual(['zzz-device', 'aaa-device']);
    expect(Object.keys(recorded.areas)).toEqual(['real_town_cabin']);
    expect(recorded).not.toHaveProperty('statistics');
  });

  test('with ids, asks for the statistics of each period over its span, and keeps the raw reply under period and start', async () => {
    const connection = fakeConnection();
    const recorded = await fetchHouse(connection, {now: NOW, statisticIds: ['sensor.real_town_temperature']});
    const asked = connection.asked.filter(m => m.type === 'recorder/statistics_during_period');
    expect(asked.map(m => m.period)).toEqual(Object.keys(STATISTIC_SPANS));
    expect(
      asked.every(m => m.statistic_ids.length === 1 && m.statistic_ids[0] === 'sensor.real_town_temperature'),
    ).toBe(true);
    expect(asked[1].start_time).toBe('2026-11-02T12:00:00.000Z'); // hour: 7 days before
    expect(Object.keys(recorded.statistics)).toEqual(asked.map(m => `${m.period}@${m.start_time}`));
    expect(recorded.statistics['hour@2026-11-02T12:00:00.000Z']).toEqual({
      'sensor.real_town_temperature': [{start: 1, end: 2, mean: 3}],
    });
  });
});

describe('main', () => {
  let dir, mapPath, outPath, logs, errors;
  const run = (args, env = {HASS_URL: 'http://ha.test:8123', HASS_TOKEN: 'secret-token'}, deps = {}) =>
    main(args, env, {now: () => NOW, log: m => logs.push(m), error: m => errors.push(m), ...deps});
  const args = (...more) => ['--map', mapPath, '--out', outPath, ...more];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'record-fixture-'));
    mapPath = join(dir, 'anonymise.json');
    outPath = join(dir, 'nested', 'houses', 'main.json');
    writeFileSync(mapPath, JSON.stringify(MAPPING));
    logs = [];
    errors = [];
  });
  afterEach(() => rmSync(dir, {recursive: true, force: true}));

  test('writes the anonymised fixture, in a folder it makes, and closes the connection', async () => {
    const connection = fakeConnection();
    const seen = [];
    const code = await run(args('--statistics', 'sensor.real_town_temperature'), undefined, {
      connect: async options => (seen.push(options), connection),
    });
    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(seen).toEqual([{url: 'http://ha.test:8123', token: 'secret-token'}]);
    expect(connection.closed).toBe(true);
    const written = JSON.parse(readFileSync(outPath, 'utf8'));
    expect(Object.keys(written)).toEqual([
      'recordedAt',
      'source',
      'states',
      'entities',
      'devices',
      'areas',
      'statistics',
    ]);
    expect(written.recordedAt).toBe('2026-11-09T12:00:00.000Z');
    expect(written.source).toBe('home-assistant 2026.11.0');
    expect(Object.keys(written.states)).toContain('sensor.springfield_temperature');
    expect(written.statistics['hour@2026-11-02T12:00:00.000Z']).toEqual({
      'sensor.springfield_temperature': [{start: 1, end: 2, mean: 3}],
    });
    expect(logs).toEqual([
      expect.stringContaining(
        'wrote ' + outPath + ': 3 states, 3 entities, 2 devices, 1 areas, statistics for 1 id(s)',
      ),
    ]);
    // what was written holds nothing of the mapping and nothing a banned pattern finds
    expect(scan(written, MAPPING, BANNED_PATTERNS)).toEqual([]);
    expect(readFileSync(outPath, 'utf8')).not.toMatch(/real.town|secret/i);
  });

  test('records the full test house, whole, with the house renamed', async () => {
    const read = readHouse(full, {now: REFERENCE_MS, timeZone: full.config.time_zone});
    const raw = {
      states: Object.values(read.states),
      entities: Object.values(read.entities),
      devices: Object.values(read.devices),
      areas: Object.values(read.areas),
    };
    writeFileSync(mapPath, JSON.stringify({strings: {Springfield: 'Shelbyville'}}));
    expect(await run(args(), undefined, {connect: async () => fakeConnection(raw)})).toBe(0);
    const written = readFileSync(outPath, 'utf8');
    expect(written).not.toMatch(/springfield/i);
    expect(written).toContain('sensor.shelbyville_temperature');
    expect(Object.keys(JSON.parse(written).states)).toHaveLength(Object.keys(read.states).length);
  });

  test('refuses and writes nothing when a banned pattern is left, naming where', async () => {
    const raw = rawHouse();
    raw.states[2].attributes.note = `parked in ${BANNED_TOWN}`;
    const code = await run(args(), undefined, {connect: async () => fakeConnection(raw)});
    expect(code).toBe(1);
    expect(existsSync(outPath)).toBe(false);
    expect(existsSync(join(dir, 'nested'))).toBe(false);
    expect(errors[0]).toContain('refusing to write');
    expect(errors.join('\n')).toContain(
      `$.states["light.shelf_lamp"].attributes.note (value) still holds ${TOWN_RULE}`,
    );
  });

  test('refuses and writes nothing when a mapped string survives its own replacement', async () => {
    writeFileSync(mapPath, JSON.stringify({strings: {'Real Town': 'Real Town Two'}}));
    const code = await run(args(), undefined, {connect: async () => fakeConnection()});
    expect(code).toBe(1);
    expect(existsSync(outPath)).toBe(false);
    expect(errors.join('\n')).toContain('still holds "Real Town"');
  });

  test('the connection is closed when a reply fails, and the failure is reported', async () => {
    const connection = fakeConnection();
    connection.sendMessagePromise = () => Promise.reject(new Error('socket dropped'));
    expect(await run(args(), undefined, {connect: async () => connection})).toBe(1);
    expect(connection.closed).toBe(true);
    expect(errors).toEqual(['failed: socket dropped']);
    expect(existsSync(outPath)).toBe(false);
  });

  test.each([
    [1, 'failed: cannot connect to HASS_URL'],
    [2, 'failed: Home Assistant refused HASS_TOKEN'],
    [3, 'failed: the connection was lost'],
  ])('the library throws the number %i: it is said in words', async (number, message) => {
    expect(await run(args(), undefined, {connect: () => Promise.reject(number)})).toBe(1);
    expect(errors).toEqual([message]);
  });

  test('a thrown value that is neither a library error nor an Error is shown as it is', async () => {
    expect(await run(args(), undefined, {connect: () => Promise.reject('odd')})).toBe(1);
    expect(errors).toEqual(['failed: odd']);
  });

  test('a mapping file that is not JSON fails before any connection is made', async () => {
    writeFileSync(mapPath, '{not json');
    let connected = false;
    const code = await run(args(), undefined, {connect: async () => ((connected = true), fakeConnection())});
    expect(code).toBe(1);
    expect(connected).toBe(false);
    expect(errors[0]).toMatch(/^failed: /);
  });

  test('a mapping inside the repository is refused, so it is never committed by accident', async () => {
    const code = await run(args(), undefined, {repoRoot: dir, connect: async () => fakeConnection()});
    expect(code).toBe(1);
    expect(errors[0]).toContain('is inside the repository');
    expect(existsSync(outPath)).toBe(false);
  });

  test('what counts is where the mapping file really is: a link into the repository does not make it part of it, a link out of it does', async () => {
    const repo = join(dir, 'repo');
    const outside = join(dir, 'outside');
    mkdirSync(repo);
    mkdirSync(outside);
    writeFileSync(join(outside, 'm.json'), JSON.stringify(MAPPING));
    writeFileSync(join(repo, 'm.json'), JSON.stringify(MAPPING));
    symlinkSync(outside, join(repo, 'to-outside'));
    symlinkSync(repo, join(outside, 'to-repo'));
    mapPath = join(repo, 'to-outside', 'm.json');
    expect(await run(args(), undefined, {repoRoot: repo, connect: async () => fakeConnection()})).toBe(0);
    mapPath = join(outside, 'to-repo', 'm.json');
    expect(await run(args(), undefined, {repoRoot: repo, connect: async () => fakeConnection()})).toBe(1);
  });

  test.each([
    ['no token', [], {HASS_URL: 'http://ha.test'}],
    ['no url', [], {HASS_TOKEN: 't'}],
    ['no flags', ['--statistics', 'a.b'], {HASS_URL: 'u', HASS_TOKEN: 't'}],
    ['an unknown flag', ['--map', 'm', '--out', 'o', '--nope'], {HASS_URL: 'u', HASS_TOKEN: 't'}],
  ])('usage errors exit 2 and show the usage: %s', async (_, flags, env) => {
    let connected = false;
    const code = await run(flags.length ? flags : args(), env, {
      connect: async () => ((connected = true), fakeConnection()),
    });
    expect(code).toBe(2);
    expect(connected).toBe(false);
    expect(errors[0]).toContain('usage: HASS_URL=');
  });

  test('the URL and the token come from the environment and nowhere else', async () => {
    // the real connection is never opened here; the options handed to `connect` are the only place they travel
    const seen = [];
    await run(
      args(),
      {HASS_URL: 'https://example.test', HASS_TOKEN: 'abc'},
      {connect: async o => (seen.push(o), fakeConnection())},
    );
    expect(seen).toEqual([{url: 'https://example.test', token: 'abc'}]);
  });

  test('the injected files replace the real ones', async () => {
    const written = [];
    const code = await run(args(), undefined, {
      connect: async () => fakeConnection(),
      readFile: path => (path === mapPath ? JSON.stringify(MAPPING) : Promise.reject(new Error('unexpected read'))),
      writeFile: (path, text) => written.push([path, text]),
    });
    expect(code).toBe(0);
    expect(written).toHaveLength(1);
    expect(written[0][0]).toBe(outPath);
    expect(written[0][1].endsWith('}\n')).toBe(true);
  });
});

describe('the personal-data scan over a fixture folder', () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'personal-data-'));
    mkdirSync(join(root, 'test', 'unit', 'fixtures', 'houses'), {recursive: true});
  });
  afterEach(() => rmSync(root, {recursive: true, force: true}));

  test('reads a fixture under test/unit/fixtures/ and reports a banned string planted in it', () => {
    writeFileSync(
      join(root, 'test', 'unit', 'fixtures', 'houses', 'planted.json'),
      JSON.stringify({states: {a: {attributes: {friendly_name: `Kitchen, ${BANNED_TOWN}`}}}}),
    );
    writeFileSync(join(root, 'test', 'unit', 'fixtures', 'houses', 'clean.json'), JSON.stringify({states: {}}));
    expect(scannedFiles(root).sort()).toEqual([
      'test/unit/fixtures/houses/clean.json',
      'test/unit/fixtures/houses/planted.json',
    ]);
    const hits = bannedHits(scannedTexts(root));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain(`test/unit/fixtures/houses/planted.json: found ${TOWN_RULE}`);
  });

  test('leaves out what the repository leaves out: the scan itself, binaries and dependencies', () => {
    for (const file of ['test/personal-data.mjs', 'shot.png', 'node_modules/x/index.js']) {
      mkdirSync(join(root, file, '..'), {recursive: true});
      writeFileSync(join(root, file), BANNED_TOWN);
    }
    expect(scannedFiles(root)).toEqual([]);
  });

  test('the repository address is not a hit, a name beside it is', () => {
    expect(bannedHits([['a', 'github.com/pldelisle/ha-home-panel']])).toEqual([]);
    expect(bannedHits([['a', `${BANNED_TOWN} near pldelisle/ha-home-panel`]])).toHaveLength(1);
  });
});
