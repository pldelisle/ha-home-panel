// resolveConfig(): panel config + the house's states → what the panel runs with
import {test, expect} from 'vitest';
import {resolveConfig, guessIcon, DEFAULT_ENTITIES} from '../../src/core/config.ts';

const st = (id: string, attrs: Record<string, unknown> = {}) =>
  [id, {entity_id: id, state: 'on', attributes: attrs}] as const;
const states = Object.fromEntries([
  st('weather.springfield_forecast'),
  st('weather.other'),
  st('sensor.springfield_temperature'),
  st('sensor.springfield_humidity'),
  st('climate.thermostat_living_room', {friendly_name: 'Thermostat Living Room'}),
  st('climate.bedroom', {friendly_name: 'Main bedroom'}),
  st('climate.heat_pump'),
  st('person.alex', {friendly_name: 'Alex Example'}),
  st('person.sam', {friendly_name: 'Sam'}),
  st('sensor.hilo_gateway_2'),
]);

test('no config and no states: generic defaults, nothing personal', () => {
  const c = resolveConfig(undefined, undefined);
  expect(c.entities.weather).toBe(null);
  expect(c.rooms).toStrictEqual([]);
  expect(c.people).toStrictEqual([]);
  expect(c.scenes).toStrictEqual([]);
  expect(c.modes).toStrictEqual([]);
  expect(c.house).toBe(null);
  expect(c.car).toStrictEqual({name: null, color: null, battery_kwh: null});
  expect(c.names).toStrictEqual({});
  expect(c.entities.sun).toBe('sun.sun');
});

test('every default entity is null or a well-formed entity id', () => {
  for (const [k, v] of Object.entries(DEFAULT_ENTITIES))
    expect(v === null || /^[a-z_]+\.[a-z0-9_]+$/.test(v), `${k}: ${v}`).toBeTruthy();
});

test('weather: a *_forecast entity wins, and its town finds the Environment Canada sensors', () => {
  const c = resolveConfig({}, states);
  expect(c.entities.weather).toBe('weather.springfield_forecast');
  expect(c.entities.outT).toBe('sensor.springfield_temperature');
  expect(c.entities.hum).toBe('sensor.springfield_humidity');
  expect(c.entities.uv, 'a sensor that does not exist stays unset').toBe(null);
});

test('entities from the config win, in snake_case or by their short key', () => {
  const c = resolveConfig(
    {
      entities: {
        weather: 'weather.other',
        grid_power: 'sensor.meter',
        whT: 'sensor.tank',
        heat_pump: 'climate.heat_pump',
        bogus: 'x.y',
      },
    },
    states,
  );
  expect(c.entities.weather).toBe('weather.other');
  expect(c.entities.outT, 'no Environment Canada sensors for weather.other').toBe(null);
  expect(c.entities.grid).toBe('sensor.meter');
  expect(c.entities.whT).toBe('sensor.tank');
  expect(c.entities.hp).toBe('climate.heat_pump');
  expect(!('bogus' in c.entities)).toBeTruthy();
});

test('weather: without a *_forecast entity, the first weather entity', () => {
  expect(resolveConfig({}, Object.fromEntries([st('weather.home'), st('sensor.x')])).entities.weather).toBe(
    'weather.home',
  );
});

test('Hilo gateway: found under its _2 name', () => {
  expect(resolveConfig({}, states).entities.gateway).toBe('sensor.hilo_gateway_2');
});

test('rooms: discovered from thermostats except the heat pump, with Hilo-style sensor names', () => {
  const c = resolveConfig({entities: {heat_pump: 'climate.heat_pump'}}, states);
  expect(c.rooms.map(r => r.climate)).toStrictEqual(['climate.bedroom', 'climate.thermostat_living_room']);
  const lr = c.rooms[1];
  expect(lr.k).toBe('living_room');
  expect(lr.temp).toBe('sensor.thermostat_living_room_temperature');
  expect(lr.target).toBe('sensor.thermostat_living_room_target_temperature');
  expect(lr.power).toBe('sensor.thermostat_living_room_power');
  expect(lr.icon).toBe('sofa');
  expect(c.rooms[0].icon).toBe('bed');
});

test('rooms: the configured list, in order, with names, icons and sensor overrides', () => {
  const c = resolveConfig(
    {
      rooms: [
        {climate: 'climate.bedroom', name: 'Kids', icon: 'bed', temperature: 'sensor.kids_temp'},
        'climate.garage',
        {climate: 'climate.x', icon: 'not-an-icon'},
      ],
    },
    states,
  );
  expect(c.rooms.map(r => [r.k, r.n, r.icon])).toStrictEqual([
    ['bedroom', 'Kids', 'bed'],
    ['garage', null, 'car'],
    ['x', null, 'therm'],
  ]);
  expect(c.rooms[0].temp).toBe('sensor.kids_temp');
});

test('people: configured names, else person entities by first name', () => {
  expect(resolveConfig({}, states).people).toStrictEqual(['Alex', 'Sam']);
  expect(resolveConfig({people: 'Jo'}, states).people).toStrictEqual(['Jo']);
});

test('house image: one URL for both themes, or day and night', () => {
  expect(resolveConfig({house_image: '/local/h.png'}).house).toStrictEqual({
    day: '/local/h.png',
    night: '/local/h.png',
  });
  expect(resolveConfig({house_image: {night: '/local/n.png'}}).house).toStrictEqual({
    day: '/local/n.png',
    night: '/local/n.png',
  });
  expect(resolveConfig({house_image: {}}).house).toBe(null);
});

test('scenes, modes, Adaptive Lighting areas and car pass through', () => {
  const c = resolveConfig({
    scenes: ['scene.a'],
    modes: 'input_boolean.b',
    adaptive_lighting_areas: {hall: 'switch.al'},
    car: {name: 'EV', color: '#123'},
  });
  expect(c.scenes).toStrictEqual(['scene.a']);
  expect(c.modes).toStrictEqual(['input_boolean.b']);
  expect(c.alAreas).toStrictEqual({hall: 'switch.al'});
  expect(c.car).toStrictEqual({name: 'EV', color: '#123', battery_kwh: null});
  expect(resolveConfig({car: {battery_kwh: 91}}).car.battery_kwh).toBe(91);
  expect(resolveConfig({car: {battery_kwh: 'x'}}).car.battery_kwh).toBe(null);
});

test('split_light_areas: a list or one area, empty by default', () => {
  expect(resolveConfig({}).splitLightAreas).toStrictEqual([]);
  expect(resolveConfig({split_light_areas: 'living_room'}).splitLightAreas).toStrictEqual(['living_room']);
  expect(resolveConfig({split_light_areas: ['kitchen', 'den']}).splitLightAreas).toStrictEqual(['kitchen', 'den']);
});

test('names: passed through as the user wrote it, an empty record when it is not a record', () => {
  const names = {'Living room': {fr: 'Salon'}, 'light.lamp': {en: 'Lamp', fr: 'Lampe'}};
  expect(resolveConfig({names}).names).toStrictEqual(names);
  expect(resolveConfig({}).names).toStrictEqual({});
  expect(resolveConfig({names: ['Salon']}).names).toStrictEqual({});
  expect(resolveConfig({names: 'Salon'}).names).toStrictEqual({});
  expect(resolveConfig({names: null}).names).toStrictEqual({});
});

test('HA adds _panel_custom to the config; it is ignored', () => {
  expect(() => resolveConfig({_panel_custom: {name: 'home-panel', module_url: '/local/x.js'}}, states)).not.toThrow();
});

test('room icons from names, English and French', () => {
  expect(guessIcon('Chambre des maîtres')).toBe('bed');
  expect(guessIcon('Salle de bain')).toBe('bath');
  expect(guessIcon('Bureau')).toBe('desk');
  expect(guessIcon('Salon')).toBe('sofa');
  expect(guessIcon('Attic')).toBe('therm');
});

test('light_links: pairs as a list or with a switch; anything else is dropped', () => {
  expect(resolveConfig({}).lightLinks).toStrictEqual([]);
  expect(
    resolveConfig({
      light_links: [['a', 'b'], {lights: ['light.x', 'light.y'], switch: 'input_boolean.l'}, ['only-one'], 'nonsense'],
    }).lightLinks,
  ).toStrictEqual([
    {keys: ['a', 'b'], sw: null},
    {keys: ['light.x', 'light.y'], sw: 'input_boolean.l'},
  ]);
});

test('idle_stack: on by default, reminders need an HH:MM time, away_mode alias', () => {
  expect(resolveConfig({}, {}).stack).toStrictEqual({on: true, sunriseOff: false, reminders: []});
  const c = resolveConfig(
    {
      entities: {away_mode: 'input_boolean.away'},
      idle_stack: {
        enabled: false,
        sunrise_lights_off: true,
        reminders: [{at: '20:00', title: 'Bedtime', text: 'Lamp to night', lead: 20}, {at: 'later'}, null],
      },
    },
    {},
  );
  expect(c.entities.away).toBe('input_boolean.away');
  expect(c.stack).toStrictEqual({
    on: false,
    sunriseOff: true,
    reminders: [{at: '20:00', title: 'Bedtime', text: 'Lamp to night', lead: 20}],
  });
});

test('discovery reads a friendly name as the old resolver did: through String(), a falsy value as no name', () => {
  const named = (name: unknown) =>
    resolveConfig({}, Object.fromEntries([st('person.x', {friendly_name: name})])).people;
  expect(named(['Bob'])).toStrictEqual(['Bob']);
  expect(named(7)).toStrictEqual(['7']);
  expect(named(0)).toStrictEqual([]);
  expect(named('')).toStrictEqual([]);
  expect(named(null)).toStrictEqual([]);
  expect(named({a: 1})).toStrictEqual(['[object']);
  expect(guessIcon(['Bedroom'])).toBe('bed');
  expect(guessIcon(0)).toBe('therm');
  expect(guessIcon(null)).toBe('therm');
  const room = resolveConfig({}, Object.fromEntries([st('climate.z', {friendly_name: ['Bedroom']})])).rooms;
  expect(room.map(r => r.icon)).toStrictEqual(['bed']);
});
