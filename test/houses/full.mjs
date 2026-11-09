// The full test house: the bare house plus thermostats, lights, sensors, scenes, people, media, a car, an EV charger, a
// water heater, Environment Canada style weather sensors and three automations (the Hilo card stays hidden).
// Pattern: Object Mother (Fowler, ObjectMother) written with a Test Data Builder (Meszaros; Freeman and Pryce), exported as plain data.
// Must not: hold behaviour or read a clock (times are markers from clock.mjs); nothing in it belongs to a real house.
import * as bare from './bare.mjs';
import {builder} from './build.mjs';
import {fromNow} from './clock.mjs';

const b = builder(bare);
const {areas} = b.data;

// Environment Canada style sensors, found from the weather entity's name
for (const [k, v] of Object.entries({
  current_condition: 'Mainly Sunny',
  temperature: 4.2,
  high_temperature: 7,
  low_temperature: -1,
  normal_high_temperature: 6,
  normal_low_temperature: -2,
  wind_speed: 14,
  wind_direction: 'SW',
  humidity: 71,
  uv_index: 1,
  aqhi: 2,
  dew_point: -0.5,
  barometric_pressure: 101.9,
  tendency: 'rising',
  wind_gust: 25,
  observation_time: fromNow(-1800e3),
  summary: 'Sunny with cloudy periods.',
}))
  b.add(`sensor.springfield_${k}`, v, k === 'temperature' ? {unit_of_measurement: '°C'} : {});
// energy: a whole-house meter, a water heater and an EV charger, named in the config
b.add('sensor.house_power', 3240, {unit_of_measurement: 'W'});
b.add('sensor.water_heater_power', 0, {unit_of_measurement: 'W'});
b.add('sensor.water_heater_temperature', 50, {unit_of_measurement: '°C'});
b.add('sensor.charger_power', 7.1, {unit_of_measurement: 'kW'});
b.add('sensor.charger_status', 'Charging');
b.add('number.charger_max_current', 32, {min: 6, max: 40});
b.add('switch.charger_pause', 'on');
b.add('lock.charger_lock', 'unlocked');
// thermostats, named the way the room discovery expects (sensor.<name>_temperature / _target_temperature / _power)
['living_room', 'office', 'bedroom', 'garage'].forEach((k, i) => {
  b.add(
    `climate.${k}`,
    'heat',
    {
      current_temperature: 20 + i * 0.4,
      temperature: 21,
      hvac_action: i % 2 ? 'idle' : 'heating',
      min_temp: 5,
      max_temp: 30,
      friendly_name: areas[k].name,
    },
    {area_id: k, platform: 'demo'},
  );
  b.add(`sensor.${k}_temperature`, 20 + i * 0.4, {unit_of_measurement: '°C'});
  b.add(`sensor.${k}_target_temperature`, 21, {unit_of_measurement: '°C'});
  b.add(`sensor.${k}_power`, i % 2 ? 0 : 1.2, {unit_of_measurement: 'kW'});
});
b.add(
  'light.office_1',
  'on',
  {
    brightness: 200,
    supported_color_modes: ['color_temp', 'hs'],
    color_mode: 'color_temp',
    color_temp_kelvin: 4000,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6500,
    friendly_name: 'Office ceiling',
  },
  {area_id: 'office', platform: 'hue', device_id: 'l2'},
  {id: 'l2', area_id: 'office', name: 'Office ceiling'},
);
b.add('switch.adaptive_lighting_office', 'on', {
  friendly_name: 'Adaptive Lighting: Office',
  color_temp_kelvin: 3800,
  brightness_pct: 80,
  sun_position: 0.4,
  configured_lights: ['light.office_1'],
});
b.add('switch.adaptive_lighting_office_sleep_mode', 'off', {
  friendly_name: 'Adaptive Lighting Sleep Mode: Office',
});
// two light groups in one area: one tile by default, one tile each with split_light_areas
const ct = {
  supported_color_modes: ['color_temp'],
  color_mode: 'color_temp',
  color_temp_kelvin: 3000,
  min_color_temp_kelvin: 2200,
  max_color_temp_kelvin: 6500,
};
['island_1', 'island_2', 'sink_1'].forEach((k, i) =>
  b.add(
    `light.kitchen_${k}`,
    i < 2 ? 'on' : 'off',
    {...ct, brightness: i < 2 ? 150 : 0},
    {platform: 'hue', hidden: true},
  ),
);
b.add(
  'light.kitchen_island',
  'on',
  {
    ...ct,
    brightness: 150,
    entity_id: ['light.kitchen_island_1', 'light.kitchen_island_2'],
    friendly_name: 'Kitchen Island',
  },
  {area_id: 'kitchen', platform: 'group'},
);
b.add(
  'light.kitchen_sink',
  'off',
  {...ct, entity_id: ['light.kitchen_sink_1'], friendly_name: 'Kitchen Sink'},
  {area_id: 'kitchen', platform: 'group'},
);
b.add('input_boolean.kitchen_lights_linked', 'on', {friendly_name: 'Kitchen lights linked'});
b.add('scene.movie_night', 'unknown', {friendly_name: 'Movie night'});
b.add('scene.dinner', fromNow(-7200e3), {friendly_name: 'Dinner'});
b.add('input_boolean.kids_bedtime', 'off', {friendly_name: 'Kids bedtime'});
b.add(
  'binary_sensor.front_door',
  'off',
  {device_class: 'door', friendly_name: 'Front door'},
  {area_id: 'living_room', platform: 'zha', device_id: 's1'},
  {id: 's1', area_id: 'living_room', name: 'Front door'},
);
b.add(
  'binary_sensor.hall_motion',
  'on',
  {device_class: 'motion', friendly_name: 'Hall motion'},
  {area_id: 'office', platform: 'zha', device_id: 's2'},
  {id: 's2', area_id: 'office', name: 'Hall motion'},
);
b.add('person.alex', 'home', {friendly_name: 'Alex Example'});
b.add('person.sam', 'not_home', {friendly_name: 'Sam Example'});
b.add(
  'media_player.living_room_tv',
  'on',
  {
    device_class: 'tv',
    source: 'Netflix',
    friendly_name: 'Living room TV',
    supported_features: 16 | 32 | 4 | 1 | 8 | 128 | 256,
  },
  {platform: 'samsungtv', area_id: 'living_room', device_id: 'tv1'},
  {id: 'tv1', area_id: 'living_room', name: 'Living room TV'},
);
b.add(
  'media_player.living_room_speaker',
  'playing',
  {
    friendly_name: 'Living room speaker',
    media_title: 'Test tone',
    media_artist: 'Nobody',
    volume_level: 0.35,
    supported_features: 16 | 32 | 4 | 1 | 16384,
  },
  {platform: 'cast', area_id: 'living_room'},
);
// a FordPass car (the panel finds it by sensor.fordpass_<name>_soc)
b.add('sensor.fordpass_test_soc', 64, {batteryRange: 280});
b.add('sensor.fordpass_test_elvehcharging', 'CHARGING', {globalAcTargetSoc: 90});
b.add('sensor.fordpass_test_elvehplug', 'CONNECTED');
b.add('lock.fordpass_test_doorlock', 'locked');
b.add('device_tracker.fordpass_test_tracker', 'home');
b.add('sensor.fordpass_test_odometer', 12000);
b.add('sensor.fordpass_test_tirepressure', 'NORMAL_OPERATION', {
  frontLeft: 240,
  frontRight: 241,
  rearLeft: 238,
  rearRight: 239,
});
b.add('sensor.fordpass_test_lastrefresh', fromNow(-600e3));

export const {states, entities, devices} = b.data;
export {areas};
export const {config, user, services} = bare;
/**
 * The automations the Automations tab lists, each `{entity_id, config}` (`noRun: true` for one with no run stored). The
 * reader adds their entities to the states and gives each one finished run today, so a test that serves other
 * automations changes the states and the traces with them.
 */
export const automations = [
  {
    entity_id: 'automation.lights_off_at_sunrise',
    config: {
      id: 'lights_off_at_sunrise',
      alias: 'Lights - off at sunrise',
      description: 'Every light goes off when the sun rises.',
      triggers: [{trigger: 'sun', event: 'sunrise'}],
      conditions: [],
      actions: [{action: 'light.turn_off', target: {entity_id: 'all'}}],
      mode: 'single',
    },
  },
  {
    entity_id: 'automation.heating_evening',
    config: {
      id: 'heating_evening',
      alias: 'Heating - evening setpoints',
      triggers: [{trigger: 'time', at: '18:00:00'}],
      conditions: [{condition: 'state', entity_id: 'input_boolean.heating_away', state: 'off'}],
      actions: [
        {action: 'climate.set_temperature', target: {entity_id: 'climate.living_room'}, data: {temperature: 21}},
      ],
      mode: 'single',
    },
  },
  {
    entity_id: 'automation.front_door_light',
    config: {
      id: 'front_door_light',
      alias: 'Entrance - light when the door opens after dark',
      triggers: [{trigger: 'state', entity_id: 'binary_sensor.front_door', to: 'on'}],
      conditions: [{condition: 'state', entity_id: 'sun.sun', state: 'below_horizon'}],
      actions: [
        {action: 'light.turn_on', target: {entity_id: 'light.living_room_1'}},
        {delay: {minutes: 5}},
        {action: 'light.turn_off', target: {entity_id: 'light.living_room_1'}},
      ],
      mode: 'restart',
    },
  },
];
export const house = {states, entities, devices, areas, automations, config, user, services};
