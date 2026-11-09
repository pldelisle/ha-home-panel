// The one reader of a test house: resolves its time markers, adds its automations' entities, and answers what the registry
// and recorder would. The harness and `fakeHass.fromHouse` both call it, so a model test and a screenshot see the same house.
// Pattern: interpreter over plain data (a house is data, this is its single reading; Fowler's "Separated Presentation" applied to fixtures).
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

/** Smooth made-up curves for the recorder's statistics, one series per known entity id. */
function statisticsOf(states, now, ids, period) {
  const out = {},
    step = period === '5minute' ? 3e5 : period === 'hour' ? 36e5 : 864e5,
    n = period === '5minute' ? 300 : period === 'hour' ? 170 : 60;
  for (const id of ids) {
    if (!states[id]) continue;
    out[id] = [];
    for (let i = n; i >= 0; i--) {
      const t = now - i * step,
        w = Math.sin(i / 6) * 0.5 + 0.5;
      const v = /temperature/.test(id) ? 19 + 3 * w : /power/.test(id) ? 0.4 + 2 * w : 10 + 5 * w;
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
    'history/history_during_period': () => ({}),
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
    /** the reply to a registry or recorder message; `otherwise` for a type the house does not answer */
    ws: (msg, otherwise = {}) => (Object.hasOwn(replies, msg.type) ? replies[msg.type](msg) : otherwise),
  };
}
