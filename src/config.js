// ---------- configuration ----------
// Everything that belongs to one house lives here: which entities feed each card, the rooms, the people, the house picture.
// It comes from the `config:` block under `panel_custom:` in configuration.yaml (HA hands it over as panel.config),
// and anything left out falls back to a default found from the house's own entities.
// resolveConfig() is pure (no DOM, no hass object), so the tests run it under Node.

// Entities each card reads. null = not set; the card or tile that needs it stays hidden or shows a dash.
// Names that an integration always creates the same way are defaults (the sun, Hilo's gateway sensors);
// names that carry a device's or a town's name are found from the house's entities or set in the config.
const DEFAULT_ENTITIES = {
  // weather: the weather entity, plus Environment Canada's sensors found by the weather entity's prefix (weather.<town>_forecast → sensor.<town>_*)
  weather: null, cond: null, outT: null, hi: null, lo: null, nhi: null, nlo: null, wind: null, windDir: null, hum: null, uv: null, aqhi: null, warnings: null,
  dew: null, pres: null, tend: null, gust: null, chill: null, humidex: null, vis: null, pop: null, summary: null, obs: null, bearing: null,
  watches: null, advisories: null, statements: null,
  sun: 'sun.sun', setting: 'sensor.sun_next_setting', rising: 'sensor.sun_next_rising', dawn: 'sensor.sun_next_dawn',
  // energy: whole-house power, energy total, water heater, EV charger
  grid: null, energy: 'sensor.hilo_energy_total', whP: null, whT: null, whE: null,
  evP: null, wbStatus: null, wbAmps: null, wbPause: null, wbLock: null, wbPrice: null,
  // Hilo (Hydro-Québec's demand-response service) and Hydro-Québec's own integration
  rate: 'sensor.hilo_gateway_hilo_rate_current', rateLow: 'sensor.hilo_gateway_hilo_rate_low', rateMed: 'sensor.hilo_gateway_hilo_rate_medium',
  rateReward: 'sensor.hilo_gateway_hilo_rate_reward_rate', defi: 'sensor.hilo_gateway_defi_hilo', rewards: 'sensor.hilo_gateway_recompenses_hilo',
  gateway: 'sensor.hilo_gateway', hq: null, hqPeak: null, hqUpcoming: null,
  // a heat pump or air conditioner shown beside the rooms
  hp: null,
};
// Environment Canada sensor suffix for each weather key (sensor.<town>_<suffix>)
const EC_SUFFIX = {
  cond: 'current_condition', outT: 'temperature', hi: 'high_temperature', lo: 'low_temperature', nhi: 'normal_high_temperature', nlo: 'normal_low_temperature',
  wind: 'wind_speed', windDir: 'wind_direction', hum: 'humidity', uv: 'uv_index', aqhi: 'aqhi', warnings: 'warnings', dew: 'dew_point', pres: 'barometric_pressure',
  tend: 'tendency', gust: 'wind_gust', chill: 'wind_chill', humidex: 'humidex', vis: 'visibility', pop: 'chance_of_precipitation', summary: 'summary',
  obs: 'observation_time', bearing: 'wind_bearing', watches: 'watches', advisories: 'advisories', statements: 'statements',
};
// the config's snake_case names for the entity keys above (both spellings are accepted)
const ENTITY_ALIAS = {
  condition: 'cond', outdoor_temperature: 'outT', high: 'hi', low: 'lo', normal_high: 'nhi', normal_low: 'nlo', wind_direction: 'windDir', humidity: 'hum',
  sun_setting: 'setting', sun_rising: 'rising', sun_dawn: 'dawn', grid_power: 'grid', energy_total: 'energy',
  water_heater_power: 'whP', water_heater_temperature: 'whT', water_heater_energy: 'whE',
  ev_charger_power: 'evP', ev_charger_status: 'wbStatus', ev_charger_current: 'wbAmps', ev_charger_pause: 'wbPause', ev_charger_lock: 'wbLock', ev_charger_price: 'wbPrice',
  hilo_rate: 'rate', hilo_rate_low: 'rateLow', hilo_rate_medium: 'rateMed', hilo_rate_reward: 'rateReward', hilo_challenge: 'defi', hilo_rewards: 'rewards', hilo_gateway: 'gateway',
  hydro_quebec_balance: 'hq', hydro_quebec_peak: 'hqPeak', hydro_quebec_upcoming_peak: 'hqUpcoming', heat_pump: 'hp',
};
const ROOM_ICONS = ['sofa', 'door', 'desk', 'bed', 'bath', 'drop', 'car', 'house', 'therm'];
// a room's icon from its name, when the config doesn't give one
const guessIcon = s => {
  const n = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /bed|chambre|nursery|kid/.test(n) ? 'bed' : /bath|salle de bain|toilet/.test(n) ? 'bath' : /office|bureau|study|desk/.test(n) ? 'desk' : /powder|salle d.?eau|laundry|lavage/.test(n) ? 'drop'
     : /living|sejour|salon|family|lounge/.test(n) ? 'sofa' : /entr|hall|foyer|vestibul/.test(n) ? 'door'
    : /garage/.test(n) ? 'car' : 'therm';
};
// a room: its thermostat, and the sensors that hold its temperature, setpoint and heating power history
// (by default the thermostat's own name plus _temperature / _target_temperature / _power, which is how Hilo names them)
function roomSpec(r, states) {
  const climate = typeof r === 'string' ? r : r.climate;
  const obj = String(climate).replace(/^climate\./, ''), o = typeof r === 'string' ? {} : r;
  const fn = states && states[climate] && states[climate].attributes && states[climate].attributes.friendly_name;
  const n = o.name ?? null;
  return {k: o.key || obj.replace(/^thermostat_/, ''), n, icon: ROOM_ICONS.includes(o.icon) ? o.icon : guessIcon(n || fn || obj), climate,
    temp: o.temperature || `sensor.${obj}_temperature`, target: o.target || `sensor.${obj}_target_temperature`, power: o.power || `sensor.${obj}_power`};
}
const asList = v => v == null ? [] : Array.isArray(v) ? v : [v];
const firstWord = s => String(s || '').trim().split(/\s+/)[0];

// panel.config (+ the house's states) → the settings the panel runs with
function resolveConfig(cfg, states) {
  cfg = cfg && typeof cfg === 'object' ? cfg : {}; states = states || {};
  const ids = Object.keys(states), has = id => !!states[id];
  const E = {...DEFAULT_ENTITIES};
  const given = {};
  for (const [k, v] of Object.entries(cfg.entities || {})) { const key = ENTITY_ALIAS[k] || k; if (key in E) given[key] = v || null; }
  // weather: the configured entity, else the first weather entity (forecast entities first)
  E.weather = given.weather !== undefined ? given.weather : (ids.find(i => /^weather\..+_forecast$/.test(i)) || ids.find(i => i.startsWith('weather.')) || null);
  const town = E.weather && (E.weather.match(/^weather\.(.+?)(?:_forecast)?$/) || [])[1];
  if (town) for (const [k, suf] of Object.entries(EC_SUFFIX)) { const id = `sensor.${town}_${suf}`; if (has(id)) E[k] = id; }
  // Hilo's gateway sensor is sensor.hilo_gateway, or _2 after the integration was added twice
  if (!has(E.gateway)) E.gateway = ids.find(i => /^sensor\.hilo_gateway(_\d+)?$/.test(i)) || E.gateway;
  Object.assign(E, given);
  // rooms: the configured list, else every thermostat except the heat pump
  const rooms = (cfg.rooms ? asList(cfg.rooms) : ids.filter(i => i.startsWith('climate.') && i !== E.hp).sort()).filter(Boolean).map(r => roomSpec(r, states));
  // people shown in who's home: the configured first names, else each person entity's first name
  const people = cfg.people ? asList(cfg.people).map(String)
    : ids.filter(i => i.startsWith('person.')).map(i => firstWord((states[i].attributes || {}).friendly_name)).filter(Boolean);
  const house = typeof cfg.house_image === 'string' ? {day: cfg.house_image, night: cfg.house_image}
    : cfg.house_image && typeof cfg.house_image === 'object' ? {day: cfg.house_image.day || cfg.house_image.night || null, night: cfg.house_image.night || cfg.house_image.day || null} : null;
  const car = cfg.car && typeof cfg.car === 'object' ? cfg.car : {};
  return {
    entities: E, rooms, people,
    scenes: asList(cfg.scenes).map(String),                 // scene order; scenes not listed follow alphabetically
    modes: asList(cfg.modes).map(String),                   // input_booleans shown as on/off routine tiles beside the scenes
    splitLightAreas: asList(cfg.split_light_areas).map(String), // HA areas whose light groups each get their own tile
    alAreas: cfg.adaptive_lighting_areas && typeof cfg.adaptive_lighting_areas === 'object' ? {...cfg.adaptive_lighting_areas} : {},
    house: house && house.day ? house : null,
    car: {name: car.name ? String(car.name) : null, color: car.color ? String(car.color) : null},
  };
}
