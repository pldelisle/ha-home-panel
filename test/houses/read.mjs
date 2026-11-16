// The one reader of a test house: resolves its time markers, adds its automations' entities, and answers what the registry
// and recorder would. The harness and `fakeHass.fromHouse` both call it, so a model test and a screenshot see the same house.
// Pattern: interpreter over plain data (Gamma et al., Interpreter, kept to one reading function); a house is data, this is its only reader.
// Must not: read the real clock (it takes `now`), touch the DOM or the page, or keep state between two readings.
import {stateOf} from './build.mjs';
import {dayStart, resolveTimes} from './clock.mjs';

/** The names a French-speaking household gives the five areas, as Home Assistant would hold them (the harness's `french_areas=1`). */
export const FRENCH_AREA_NAMES = {
  living_room: 'Salon',
  office: 'Bureau',
  bedroom: 'Chambre',
  garage: 'Garage',
  kitchen: 'Cuisine',
};

/** The house with its areas, and the thermostats named after them, carrying the French names. */
function inFrench(house) {
  const areas = structuredClone(house.areas),
    states = {...house.states};
  for (const [id, name] of Object.entries(FRENCH_AREA_NAMES)) {
    if (areas[id]) areas[id].name = name;
    const thermostat = states[`climate.${id}`];
    if (thermostat)
      states[thermostat.entity_id] = {...thermostat, attributes: {...thermostat.attributes, friendly_name: name}};
  }
  return {...house, areas, states};
}

/**
 * The automations as the harness has always served them: each one's entity (last triggered at its run's start, hours
 * apart through the day), and one finished run today with a trace of its steps. Returns the entities and the replies.
 */
function automationRuns(automations, now, timeZone) {
  const t0 = dayStart(now, timeZone),
    iso = ms => new Date(ms).toISOString(),
    entities = [],
    list = [],
    traces = {};
  automations.forEach((c, i) => {
    const start = t0 + (7 + i * 5) * 3600e3,
      run_id = 'r' + i;
    if (c.noRun) {
      // an automation with no run stored since Home Assistant started (its flow has no subtitles)
      entities.push(
        stateOf(c.entity_id, 'on', {
          id: c.config.id,
          friendly_name: c.config.alias,
          last_triggered: null,
          current: 0,
          mode: c.config.mode,
        }),
      );
      return;
    }
    const trace = {
      'trigger/0': [{path: 'trigger/0', timestamp: iso(start), changed_variables: {trigger: {idx: '0'}}}],
    };
    (c.config.conditions || []).forEach((x, j) => {
      trace[`condition/${j}`] = [{path: `condition/${j}`, timestamp: iso(start + 300), result: {result: true}}];
    });
    c.config.actions.forEach((x, j) => {
      trace[`action/${j}`] = [{path: `action/${j}`, timestamp: iso(start + 600 + j * 300)}];
    });
    const summary = {
      item_id: c.config.id,
      run_id,
      domain: 'automation',
      state: 'stopped',
      script_execution: 'finished',
      timestamp: {start: iso(start), finish: iso(start + 2000)},
      trigger: 'test',
      last_step: `action/${c.config.actions.length - 1}`,
    };
    list.push(summary);
    traces[c.config.id + '/' + run_id] = {...summary, trace, config: c.config};
    entities.push(
      stateOf(c.entity_id, 'on', {
        id: c.config.id,
        friendly_name: c.config.alias,
        last_triggered: iso(start),
        current: 0,
        mode: c.config.mode,
      }),
    );
  });
  return {entities, list, traces};
}

/** How far apart the recorder's points are, and how many the panel gets, for each period (an unknown period reads as a day). */
const PERIODS = {'5minute': {step: 3e5, n: 300}, hour: {step: 36e5, n: 170}, day: {step: 864e5, n: 60}};

/** The Air sensors' own ranges, `[base, swing]` by id: the purifier's and the station's only, so no other entity's curve moves. */
const AIR_CURVES = [
  [/^sensor\.office_purifier_pm2_5$/, 14, 12],
  [/^sensor\.office_purifier_co2$/, 560, 260],
  [/^sensor\.office_purifier_voc$/, 140, 120],
  [/^sensor\.office_purifier_humidity$/, 34, 10],
  [/^sensor\.outdoor_station_pm2_5$/, 14, 12],
  [/^sensor\.outdoor_aqi$/, 36, 18],
];

/** Smooth made-up curves for the recorder's statistics, one series per known entity id. */
function statisticsOf(states, now, ids, period) {
  const out = {},
    {step, n} = PERIODS[period] ?? PERIODS.day;
  for (const id of ids) {
    if (!states[id]) continue;
    out[id] = [];
    for (let i = n; i >= 0; i--) {
      const t = now - i * step,
        w = Math.sin(i / 6) * 0.5 + 0.5;
      const [, base, swing] = AIR_CURVES.find(([re]) => re.test(id)) ?? [],
        v =
          base !== undefined
            ? base + swing * w
            : /temperature/.test(id)
              ? 19 + 3 * w
              : /power/.test(id)
                ? 0.4 + 2 * w
                : 10 + 5 * w;
      out[id].push({
        start: t,
        end: t + step,
        mean: v,
        min: v - 0.5,
        max: v + 0.5,
        change: period === 'day' ? 20 + 10 * w : 1 + w,
        sum: 0,
      });
    }
  }
  return out;
}

/**
 * The history of the door and motion sensors, as `history/history_during_period` sends it with `minimal_response`: three on-periods
 * in the last eight hours, whatever the window asked (3 min, 40 s and 1 h 5 min, the last ended 48 min ago), each beginning at seven
 * minutes past an hour so that a time shows its minutes. A thermostat or heat pump (`climate.`) has two readings with their
 * attributes, five days ago and two hours ago (the recorder keeps about ten days of state history, so a month's line starts late);
 * every other id has none.
 */
function historyOf(now, ids) {
  const MIN = 6e4,
    HOUR = 36e5,
    run = (from, length) => [
      {s: 'on', lu: (now - from) / 1000},
      {s: 'off', lu: (now - from + length) / 1000},
    ];
  const rows = [
    {s: 'off', lu: (now - 30 * HOUR) / 1000},
    ...run(7 * HOUR + 53 * MIN, 3 * MIN),
    ...run(4 * HOUR + 53 * MIN, 40e3),
    ...run(HOUR + 53 * MIN, 65 * MIN),
  ];
  const unit = [
    {s: 'heat', a: {current_temperature: 19, temperature: 22}, lu: (now - 120 * HOUR) / 1000},
    {s: 'heat', a: {current_temperature: 20.5, temperature: 22}, lu: (now - 2 * HOUR) / 1000},
  ];
  return Object.fromEntries(
    ids.flatMap(id => (id.startsWith('binary_sensor.') ? [[id, rows]] : id.startsWith('climate.') ? [[id, unit]] : [])),
  );
}

/**
 * Reads `house` at the instant `now` (milliseconds), with local wall-clock markers resolved in `timeZone` (the host's
 * zone when undefined). Options: `frenchAreas` renames the areas as a French-speaking household does; `automations`
 * replaces the house's own list. Returns `{states, entities, devices, areas}` and the replies of the websocket calls the
 * panel makes against the registry and the recorder: `ws(msg)` answers a message the way the harness always has.
 */
/**
 * @param {{states: object, entities: object, devices: object, areas: object, automations: any[]}} house
 * @param {{now: number, timeZone?: string, frenchAreas?: boolean, automations?: any[]}} options
 */
export function readHouse(house, {now, timeZone, frenchAreas = false, automations = house.automations} = {}) {
  const raw = frenchAreas ? inFrench(house) : house;
  const {states, entities, devices, areas} = resolveTimes(
    {states: raw.states, entities: raw.entities, devices: raw.devices, areas: raw.areas},
    now,
    timeZone,
  );
  const runs = automationRuns(automations, now, timeZone);
  for (const s of resolveTimes(runs.entities, now, timeZone)) states[s.entity_id] = s;
  const replies = {
    'trace/list': () => runs.list,
    'trace/get': m => runs.traces[m.item_id + '/' + m.run_id],
    'automation/config': m => ({config: (automations.find(c => c.entity_id === m.entity_id) || {}).config}),
    'recorder/statistics_during_period': m => statisticsOf(states, now, m.statistic_ids, m.period),
    'history/history_during_period': m => historyOf(now, m.entity_ids ?? []),
    camera_thumbnail: () => ({}),
    'lovelace/resources': () => [],
  };
  return {
    states,
    entities,
    devices,
    areas,
    /** the message types the house answers */
    types: Object.keys(replies),
    /** the reply to a registry or recorder message; `{}` for a type the house does not answer */
    ws: msg => (Object.hasOwn(replies, msg.type) ? replies[msg.type](msg) : {}),
  };
}
