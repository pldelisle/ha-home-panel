// resolveConfig(): panel config + the house's states → what the panel runs with
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// config.js is spliced into the bundle as plain script text; run that same text here
const {resolveConfig, guessIcon, DEFAULT_ENTITIES} = new Function(readFileSync(new URL('../../src/config.js', import.meta.url), 'utf8') + '\nreturn {resolveConfig, guessIcon, DEFAULT_ENTITIES};')();

const st = (id, attrs = {}) => [id, {entity_id: id, state: 'on', attributes: attrs}];
const states = Object.fromEntries([
  st('weather.springfield_forecast'), st('weather.other'), st('sensor.springfield_temperature'), st('sensor.springfield_humidity'),
  st('climate.thermostat_living_room', {friendly_name: 'Thermostat Living Room'}), st('climate.bedroom', {friendly_name: 'Main bedroom'}), st('climate.heat_pump'),
  st('person.alex', {friendly_name: 'Alex Example'}), st('person.sam', {friendly_name: 'Sam'}),
  st('sensor.hilo_gateway_2'),
]);

test('no config and no states: generic defaults, nothing personal', () => {
  const c = resolveConfig(undefined, undefined);
  assert.equal(c.entities.weather, null);
  assert.deepEqual(c.rooms, []); assert.deepEqual(c.people, []); assert.deepEqual(c.scenes, []); assert.deepEqual(c.modes, []);
  assert.equal(c.house, null); assert.deepEqual(c.car, {name: null, color: null});
  assert.equal(c.entities.sun, 'sun.sun');
});

test('every default entity is null or a well-formed entity id', () => {
  for (const [k, v] of Object.entries(DEFAULT_ENTITIES)) assert.ok(v === null || /^[a-z_]+\.[a-z0-9_]+$/.test(v), `${k}: ${v}`);
});

test('weather: a *_forecast entity wins, and its town finds the Environment Canada sensors', () => {
  const c = resolveConfig({}, states);
  assert.equal(c.entities.weather, 'weather.springfield_forecast');
  assert.equal(c.entities.outT, 'sensor.springfield_temperature');
  assert.equal(c.entities.hum, 'sensor.springfield_humidity');
  assert.equal(c.entities.uv, null, 'a sensor that does not exist stays unset');
});

test('entities from the config win, in snake_case or by their short key', () => {
  const c = resolveConfig({entities: {weather: 'weather.other', grid_power: 'sensor.meter', whT: 'sensor.tank', heat_pump: 'climate.heat_pump', bogus: 'x.y'}}, states);
  assert.equal(c.entities.weather, 'weather.other');
  assert.equal(c.entities.outT, null, 'no Environment Canada sensors for weather.other');
  assert.equal(c.entities.grid, 'sensor.meter'); assert.equal(c.entities.whT, 'sensor.tank'); assert.equal(c.entities.hp, 'climate.heat_pump');
  assert.ok(!('bogus' in c.entities));
});

test('Hilo gateway: found under its _2 name', () => {
  assert.equal(resolveConfig({}, states).entities.gateway, 'sensor.hilo_gateway_2');
});

test('rooms: discovered from thermostats except the heat pump, with Hilo-style sensor names', () => {
  const c = resolveConfig({entities: {heat_pump: 'climate.heat_pump'}}, states);
  assert.deepEqual(c.rooms.map(r => r.climate), ['climate.bedroom', 'climate.thermostat_living_room']);
  const lr = c.rooms[1];
  assert.equal(lr.k, 'living_room');
  assert.equal(lr.temp, 'sensor.thermostat_living_room_temperature');
  assert.equal(lr.target, 'sensor.thermostat_living_room_target_temperature');
  assert.equal(lr.power, 'sensor.thermostat_living_room_power');
  assert.equal(lr.icon, 'sofa'); assert.equal(c.rooms[0].icon, 'bed');
});

test('rooms: the configured list, in order, with names, icons and sensor overrides', () => {
  const c = resolveConfig({rooms: [{climate: 'climate.bedroom', name: 'Kids', icon: 'bed', temperature: 'sensor.kids_temp'}, 'climate.garage', {climate: 'climate.x', icon: 'not-an-icon'}]}, states);
  assert.deepEqual(c.rooms.map(r => [r.k, r.n, r.icon]), [['bedroom', 'Kids', 'bed'], ['garage', null, 'car'], ['x', null, 'therm']]);
  assert.equal(c.rooms[0].temp, 'sensor.kids_temp');
});

test('people: configured names, else person entities by first name', () => {
  assert.deepEqual(resolveConfig({}, states).people, ['Alex', 'Sam']);
  assert.deepEqual(resolveConfig({people: 'Jo'}, states).people, ['Jo']);
});

test('house image: one URL for both themes, or day and night', () => {
  assert.deepEqual(resolveConfig({house_image: '/local/h.png'}).house, {day: '/local/h.png', night: '/local/h.png'});
  assert.deepEqual(resolveConfig({house_image: {night: '/local/n.png'}}).house, {day: '/local/n.png', night: '/local/n.png'});
  assert.equal(resolveConfig({house_image: {}}).house, null);
});

test('scenes, modes, Adaptive Lighting areas and car pass through', () => {
  const c = resolveConfig({scenes: ['scene.a'], modes: 'input_boolean.b', adaptive_lighting_areas: {hall: 'switch.al'}, car: {name: 'EV', color: '#123'}});
  assert.deepEqual(c.scenes, ['scene.a']); assert.deepEqual(c.modes, ['input_boolean.b']);
  assert.deepEqual(c.alAreas, {hall: 'switch.al'}); assert.deepEqual(c.car, {name: 'EV', color: '#123'});
});

test('HA adds _panel_custom to the config; it is ignored', () => {
  assert.doesNotThrow(() => resolveConfig({_panel_custom: {name: 'home-panel', module_url: '/local/x.js'}}, states));
});

test('room icons from names, English and French', () => {
  assert.equal(guessIcon('Chambre des maîtres'), 'bed'); assert.equal(guessIcon('Salle de bain'), 'bath');
  assert.equal(guessIcon('Bureau'), 'desk'); assert.equal(guessIcon('Salon'), 'sofa'); assert.equal(guessIcon('Attic'), 'therm');
});
