// Panel configs for the made-up house in harness.html. Nothing here belongs to a real house.

// the full test house names its energy devices in the config, the way a real install would
export const FULL_CFG = {
  people: ['Alex', 'Sam'],
  entities: {
    grid_power: 'sensor.house_power',
    water_heater_power: 'sensor.water_heater_power',
    water_heater_temperature: 'sensor.water_heater_temperature',
    ev_charger_power: 'sensor.charger_power',
    ev_charger_status: 'sensor.charger_status',
    ev_charger_current: 'number.charger_max_current',
    ev_charger_pause: 'switch.charger_pause',
    ev_charger_lock: 'lock.charger_lock',
  },
  scenes: ['scene.dinner', 'scene.movie_night'],
  modes: ['input_boolean.kids_bedtime'],
  car: {color: '#B03A2E'},
};

// the kitchen's two groups are linked through a switch; the office is linked to the living room with no switch
export const LINK_CFG = {
  ...FULL_CFG,
  split_light_areas: ['kitchen'],
  light_links: [
    {lights: ['light.kitchen_island', 'light.kitchen_sink'], switch: 'input_boolean.kitchen_lights_linked'},
    ['office', 'living_room'],
  ],
};

// the tabs each screen shows; a tab hidden on purpose (no car, say) is skipped by the tests
export const TABLET_TABS = ['home', 'lights', 'climate', 'weather', 'car', 'energy', 'air', 'media', 'cams', 'auto'];
export const PHONE_TABS = ['home', 'lights', 'climate', 'car'];
