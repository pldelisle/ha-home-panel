// The house's automations and today's runs still to come: what automationsOf reads of a state, minutesOfDay in the house's
// zone, the sun's next events from sun.sun or its sensors, and upcomingRuns over time and sun triggers.
// Pattern: example tests at the pure functions over a literal house (ADR 0005; Meszaros, xUnit Test Patterns).
// Must not: read the clock (`now` is a literal Saturday afternoon in Toronto) or hold a real name.
import {describe, expect, test} from 'vitest';
import type {HassEntities} from '../../../src/core/hass.ts';
import {createFormatters} from '../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../src/core/i18n/locale.ts';
import {
  asList,
  automationsOf,
  minutesOfDay,
  sunNext,
  upcomingRuns,
  type Automation,
} from '../../../src/providers/automations.ts';

const fmt = createFormatters(englishLocale('America/Toronto'));
// 14:00 in Toronto
const NOW = Date.parse('2026-11-07T14:00:00-05:00');
const state = (entity_id: string, s: string, attributes: Record<string, unknown> = {}) => ({
  entity_id,
  state: s,
  attributes,
  last_changed: '',
  last_updated: '',
  context: {id: '', parent_id: null, user_id: null},
});
const statesOf = (...list: ReturnType<typeof state>[]) =>
  Object.fromEntries(list.map(s => [s.entity_id, s])) as unknown as HassEntities;
const names = {name: (key: string) => `name of ${key}`};

test('automationsOf: every automation entity, with its item id, name, switch, last run and current runs', () => {
  const states = statesOf(
    state('automation.a', 'on', {id: 'a1', last_triggered: '2026-11-07T10:00:00Z', current: 2}),
    state('automation.b', 'off', {id: 7, current: 'x'}),
    state('light.c', 'on'),
  );
  expect(automationsOf(states, names)).toEqual([
    {
      entity: 'automation.a',
      item: 'a1',
      name: 'name of automation.a',
      on: true,
      last: '2026-11-07T10:00:00Z',
      current: 2,
    },
    {entity: 'automation.b', item: undefined, name: 'name of automation.b', on: false, last: null, current: 0},
  ]);
});

test('asList and minutesOfDay', () => {
  expect([asList(null), asList(1), asList([1, 2])]).toEqual([[], [1], [1, 2]]);
  expect(minutesOfDay(NOW, fmt)).toBe(14 * 60);
  expect(minutesOfDay('2026-11-07T21:07:00Z', fmt)).toBe(16 * 60 + 7);
});

test('sunNext: sun.sun first, then the sensors, nothing from an unavailable one', () => {
  expect(sunNext(statesOf(state('sun.sun', 'above_horizon', {next_rising: 'R', next_setting: 'S'})))).toEqual({
    nextRising: 'R',
    nextSetting: 'S',
  });
  expect(
    sunNext(statesOf(state('sensor.sun_next_rising', 'R2'), state('sensor.sun_next_setting', 'unavailable'))),
  ).toEqual({nextRising: 'R2', nextSetting: null});
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
