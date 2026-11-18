// The house's automations and today's runs still to come: what automationsOf reads of the made-up house's automation
// states, minutesOfDay in the house's zone, the sun's next events from sun.sun or its sensors, and upcomingRuns over time
// and sun triggers.
// Pattern: example tests at the pure functions over the test house (ADR 0005; Meszaros, xUnit Test Patterns).
// Must not: read the clock (`now` is the house's reference instant, a Saturday afternoon in Toronto) or hold a real name.
import {describe, expect, test} from 'vitest';
import type {HassEntities} from '../../../src/core/hass.ts';
import {createFormatters} from '../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../src/core/i18n/locale.ts';
import {
  asList,
  automationsOf,
  minutesOfDay,
  upcomingRuns,
  type Automation,
} from '../../../src/providers/automations.ts';
import {sunNext} from '../../../src/providers/sun.ts';
import {REFERENCE_MS} from '../../houses/clock.mjs';
import * as full from '../../houses/full.mjs';
import {fakeHass} from '../fake-hass.ts';

const fmt = createFormatters(englishLocale('America/Toronto'));
// 14:00 in Toronto
const NOW = REFERENCE_MS;
const STATES = fakeHass.fromHouse(full).states;
const names = {name: (key: string) => `name of ${key}`};
/** The house with some states changed: `null` removes one. */
const changed = (changes: Record<string, Record<string, unknown> | null>): HassEntities => {
  const states: Record<string, unknown> = {...STATES};
  for (const [id, change] of Object.entries(changes))
    if (change)
      states[id] = {
        ...STATES[id],
        ...change,
        attributes: {...STATES[id]?.attributes, ...(change.attributes as object)},
      };
    else delete states[id];
  return states as HassEntities;
};

test('automationsOf: every automation entity of the house, with its item id, name, switch, last run and current runs', () => {
  const list = automationsOf(STATES, names);
  expect(list.map(a => a.entity)).toEqual([
    'automation.lights_off_at_sunrise',
    'automation.heating_evening',
    'automation.front_door_light',
  ]);
  expect(list[1]).toEqual({
    entity: 'automation.heating_evening',
    item: 'heating_evening',
    name: 'name of automation.heating_evening',
    on: true,
    last: STATES['automation.heating_evening'].attributes.last_triggered as string,
    current: 0,
  });
});

test('automationsOf: a number id is kept as text, a missing one is undefined, an odd count of runs is none', () => {
  const states = changed({
    'automation.heating_evening': {state: 'off', attributes: {id: 7, current: 'x', last_triggered: null}},
    'automation.front_door_light': {attributes: {id: undefined, current: 2}},
  });
  const [, evening, door] = automationsOf(states, names);
  expect([evening.item, evening.on, evening.last, evening.current]).toEqual(['7', false, null, 0]);
  expect([door.item, door.current]).toEqual([undefined, 2]);
});

test('asList and minutesOfDay', () => {
  expect([asList(null), asList(1), asList([1, 2])]).toEqual([[], [1], [1, 2]]);
  expect(minutesOfDay(NOW, fmt)).toBe(14 * 60);
  expect(minutesOfDay('2026-11-07T21:07:00Z', fmt)).toBe(16 * 60 + 7);
});

test('sunNext: sun.sun first, then the sensors, nothing from an unavailable one', () => {
  const sun = STATES['sun.sun'].attributes as {next_rising: string; next_setting: string};
  expect(sunNext(STATES)).toEqual({nextRising: sun.next_rising, nextSetting: sun.next_setting});
  const sensors = changed({'sun.sun': null, 'sensor.sun_next_setting': {state: 'unavailable'}});
  expect(sunNext(sensors)).toEqual({nextRising: STATES['sensor.sun_next_rising'].state, nextSetting: null});
});

describe('upcomingRuns', () => {
  const auto = (item: string | undefined, on = true): Automation => ({
    entity: `automation.${item}`,
    item,
    name: `Auto ${item}`,
    on,
    last: null,
    current: 0,
  });
  const sun = {nextRising: '2026-11-08T06:50:00-05:00', nextSetting: '2026-11-07T16:50:00-05:00'};

  test('the time triggers still ahead today and the sun events that fall later today, sorted', () => {
    const configs = {
      t: {triggers: [{trigger: 'time', at: ['09:00:00', '18:30:00', 'input_datetime.x']}]},
      s: {
        trigger: [
          {platform: 'sun', event: 'sunset'},
          {platform: 'sun', event: 'sunrise'},
        ],
      },
    };
    expect(upcomingRuns(configs, [auto('t'), auto('s')], NOW, sun, fmt)).toEqual([
      {item: 's', name: 'Auto s', t: Date.parse(sun.nextSetting), mins: 16 * 60 + 50},
      {item: 't', name: 'Auto t', t: NOW + 270 * 60000, mins: 18 * 60 + 30},
    ]);
  });

  test('nothing from an automation that is off, has no item, no config or no sun time', () => {
    const configs = {t: {triggers: [{trigger: 'time', at: '23:00'}]}, n: null};
    expect(upcomingRuns(configs, [auto('t', false), auto(undefined), auto('n'), auto('gone')], NOW, sun, fmt)).toEqual(
      [],
    );
    const s = {s: {triggers: [{trigger: 'sun', event: 'sunset'}]}};
    expect(upcomingRuns(s, [auto('s')], NOW, {nextRising: null, nextSetting: null}, fmt)).toEqual([]);
  });
});
