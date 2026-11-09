// The bare test house: only the sun, one weather entity and one light, so every optional section must stay hidden.
// Pattern: Object Mother (Fowler, ObjectMother) written with a Test Data Builder (Meszaros; Freeman and Pryce), exported as plain data.
// Must not: hold behaviour or read a clock (times are markers from clock.mjs); nothing in it belongs to a real house.
import {builder} from './build.mjs';
import {nextAt, sunState} from './clock.mjs';

const b = builder({
  areas: {
    living_room: {area_id: 'living_room', name: 'Living room'},
    office: {area_id: 'office', name: 'Office'},
    bedroom: {area_id: 'bedroom', name: 'Bedroom'},
    garage: {area_id: 'garage', name: 'Garage'},
    kitchen: {area_id: 'kitchen', name: 'Kitchen'},
  },
});

// the sun at a believable time of day: rises 07:00 and sets 16:45 local time
b.add('sun.sun', sunState([7, 0], [16, 45]), {
  next_rising: nextAt(7, 0),
  next_setting: nextAt(16, 45),
  next_midnight: nextAt(23, 52),
});
b.add('sensor.sun_next_setting', nextAt(16, 45));
b.add('sensor.sun_next_rising', nextAt(7, 0));
b.add('sensor.sun_next_dawn', nextAt(7, 0, -1800e3));
b.add('weather.springfield_forecast', 'partlycloudy', {
  temperature: 4.2,
  humidity: 71,
  wind_speed: 14,
  pressure: 101.9,
  friendly_name: 'Springfield',
});
b.add(
  'light.living_room_1',
  'on',
  {
    brightness: 180,
    supported_color_modes: ['color_temp'],
    color_mode: 'color_temp',
    color_temp_kelvin: 2700,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6500,
    friendly_name: 'Living room lamp',
  },
  {area_id: 'living_room', platform: 'hue', device_id: 'l1'},
  {id: 'l1', area_id: 'living_room', name: 'Living room lamp'},
);

export const {states, entities, devices, areas} = b.data;
/** The house's `hass.config`: its zone and place (made up), which the clock markers and the weather read. */
export const config = {time_zone: 'America/Toronto', latitude: 43.65, longitude: -79.38, country: 'CA'};
/** The signed-in user (an admin; the harness's `?admin=0` turns that off). */
export const user = {name: 'Alex Example', is_admin: true};
/** The services the house offers beyond Home Assistant's own. */
export const services = {adaptive_lighting: {}};
/** The automations the Automations tab lists: none in the bare house. */
export const automations = [];
export const house = {states, entities, devices, areas, automations, config, user, services};
