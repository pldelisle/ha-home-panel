// The words of a flow: every trigger, condition and action shape the legacy panel worded, pinned to the English it drew
// (the tables were checked line by line against the legacy `auTrig`, `auCond` and `auAct` before #271 deleted them), the
// French of the trace fixtures' configs, and the helpers' corners.
// Pattern: table-driven example tests at the pure function (ADR 0005; Meszaros, xUnit Test Patterns, "Parameterized Test").
// Must not: mount an element, read the clock, or hold a real name (the made-up house's states only).
import {readdirSync, readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import type {HassEntities} from '../../../../src/core/hass.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {
  actionText,
  conditionText,
  cut,
  durationText,
  nameOf,
  shortAlias,
  triggerText,
  type SentenceDeps,
} from '../../../../src/features/automations/sentences.ts';
import * as full from '../../../houses/full.mjs';
import {fakeHass} from '../../fake-hass.ts';

type Row = [Record<string, unknown> | string, string, string];

// the made-up house's states: its front door and hall motion sensor, its kitchen lights and living room heat pump
const STATES = fakeHass.fromHouse(full).states;

const depsOf = (language: 'en' | 'fr', states: HassEntities): SentenceDeps => ({
  t: createMessages({language, tag: `${language}-CA`}).t,
  fmt: createFormatters({
    ...englishLocale('America/Toronto'),
    hour12: language === 'en' ? true : undefined,
    language,
    tag: `${language}-CA`,
    numberLocale: `${language}-CA`,
  }),
  states,
  names: {name: key => String(states[key]?.attributes.friendly_name ?? key)},
});
const EN = depsOf('en', STATES);

const TRIGGERS: Row[] = [
  [{trigger: 'state', entity_id: 'binary_sensor.front_door', to: 'on'}, 'Door', 'Front opened'],
  [
    {trigger: 'state', entity_id: 'binary_sensor.front_door', to: 'off', for: '00:05:00'},
    'Door',
    'Front closed for 5 min',
  ],
  [
    {trigger: 'state', entity_id: ['binary_sensor.hall_motion', 'binary_sensor.front_door'], to: ['on', 'off']},
    'Motion',
    'Hall or Front detects motion or clear',
  ],
  [
    {trigger: 'state', entity_id: 'binary_sensor.hall_motion', to: 'on', for: {minutes: 2}},
    'Motion',
    'Hall detects motion for 2 min',
  ],
  [{platform: 'state', entity_id: 'climate.living_room', to: 'fan_only'}, 'Climate', 'Living room → fan only'],
  [{trigger: 'state', entity_id: 'light.kitchen_island', to: 'on', for: 90}, 'Light', 'Kitchen Island → on for 2 min'],
  [
    {trigger: 'state', entity_id: 'light.kitchen_island', attribute: 'brightness_x'},
    'State',
    'Kitchen Island brightness x changes',
  ],
  [{trigger: 'state', entity_id: 'event.button_1'}, 'Button', 'Button 1 pressed'],
  [{trigger: 'state', entity_id: 'sensor.x', for: '{{ x }}'}, 'State', 'X changes for a while'],
  [
    {trigger: 'state', entity_id: ['light.kitchen_island', 'light.kitchen_sink', 'climate.living_room']},
    'State',
    'Kitchen Island, Kitchen Sink +1 changes',
  ],
  [{trigger: 'numeric_state', entity_id: 'zone.home', below: 1}, 'Presence', 'Nobody home'],
  [
    {trigger: 'numeric_state', entity_id: 'zone.home', above: 0, for: '00:01:00'},
    'Presence',
    'Someone comes home for 1 min',
  ],
  [{trigger: 'numeric_state', entity_id: 'zone.home', below: 3}, 'Presence', 'People home < 3'],
  [{trigger: 'numeric_state', entity_id: 'zone.home', above: 2}, 'Presence', 'People home > 2'],
  [{trigger: 'numeric_state', entity_id: 'sensor.t', above: 5}, 'Value', 'T > 5'],
  [
    {trigger: 'numeric_state', entity_id: 'sensor.t', below: 5, attribute: 'temp', for: '01:30:00'},
    'Value',
    'T temp < 5 for 1.5 h',
  ],
  [{trigger: 'numeric_state', entity_id: 'sensor.t', above: 5, below: 9}, 'Value', 'T > 5 and < 9'],
  [{trigger: 'numeric_state', entity_id: 'sensor.t'}, 'Value', 'T '],
  [{trigger: 'time', at: '06:00:00'}, 'Time', '6:00 am'],
  [{trigger: 'time', at: ['06:00:00', 'input_datetime.wake']}, 'Time', '6:00 am, Wake'],
  [{trigger: 'time_pattern', minutes: '/5'}, 'Every', '5 min'],
  [{trigger: 'time_pattern', hours: 2}, 'Every', '2 h'],
  [{trigger: 'time_pattern', seconds: '/30'}, 'Every', '30 s'],
  [{trigger: 'time_pattern'}, 'Every', 'pattern'],
  [{trigger: 'sun', event: 'sunrise'}, 'Sun', 'Sunrise'],
  [{trigger: 'sun', event: 'sunset', offset: '-00:30:00'}, 'Sun', 'Sunset -00:30:00'],
  [{trigger: 'homeassistant', event: 'start'}, 'System', 'Home Assistant starts'],
  [{trigger: 'homeassistant', event: 'shutdown'}, 'System', 'Home Assistant stops'],
  [{trigger: 'event', event_type: 'automation_reloaded'}, 'Event', 'Automations reloaded'],
  [{trigger: 'event', event_type: 'my_custom_event'}, 'Event', 'My custom event'],
  [
    {
      trigger: 'template',
      value_template: "{{ is_state('light.kitchen_island', 'on') and states('sensor.t') | float > 3 }}",
    },
    'When',
    'Kitchen Island on and T > 3',
  ],
  [
    {trigger: 'template', value_template: "{{ not is_state('binary_sensor.front_door', 'on') }}", for: 30},
    'When',
    'Front not open for 30 s',
  ],
  [
    {trigger: 'zone', entity_id: 'person.alex', zone: 'zone.home', event: 'leave'},
    'Zone',
    'Alex Example leaves Home zone',
  ],
  [{trigger: 'zone', entity_id: 'person.alex', zone: 'zone.work', event: 'enter'}, 'Zone', 'Alex Example enters Work'],
  [{trigger: 'conversation_turn_on', entity_id: 'light.kitchen_island'}, 'Request', 'Kitchen Island asked to turn on'],
  [{trigger: 'mqtt'}, 'Trigger', 'Mqtt'],
  [{}, 'Trigger', 'Trigger'],
  [{alias: 'My trigger'}, 'Trigger', 'My trigger'],
];
const CONDITIONS: Row[] = [
  ["{{ is_state('light.kitchen_island','on') }}", 'Check', 'Kitchen Island on'],
  [{alias: 'Checked'}, 'Check', 'Checked'],
  [{condition: 'state', entity_id: 'zone.home', state: '0'}, 'Presence', 'Nobody home'],
  [{condition: 'state', entity_id: 'zone.home', state: 2, for: '00:10:00'}, 'Presence', '2 at home for 10 min'],
  [{condition: 'state', entity_id: 'binary_sensor.front_door', state: 'off'}, 'Doors', 'Front is closed'],
  [
    {condition: 'state', entity_id: ['binary_sensor.front_door', 'light.kitchen_island'], state: 'on'},
    'Doors',
    'Front and Kitchen Island are open',
  ],
  [
    {
      condition: 'state',
      entity_id: ['light.kitchen_island', 'light.kitchen_sink', 'climate.living_room'],
      state: ['on', 'off'],
      attribute: 'x',
      for: {hours: 1},
    },
    'Light',
    'Kitchen Island, Kitchen Sink +1 are on or off (x) for 1 h',
  ],
  [{condition: 'state', entity_id: 'binary_sensor.hall_motion', state: 'on'}, 'Motion', 'Hall is motion'],
  [{condition: 'state', entity_id: 'climate.living_room', state: 'fan_only'}, 'Climate', 'Living room is fan only'],
  [{condition: 'numeric_state', entity_id: 'sensor.t', above: 1, attribute: 'some_attr'}, 'Value', 'T some attr > 1'],
  [{condition: 'trigger', id: 'a'}, 'Started by', 'the “a” trigger'],
  [{condition: 'trigger', id: ['a', 'b']}, 'Started by', 'the “a” or “b” trigger'],
  [{condition: 'trigger'}, 'Started by', 'the “” trigger'],
  [{condition: 'state', entity_id: 'binary_sensor.front_door', state: 'not_home'}, 'Doors', 'Front is not_home'],
  [
    {condition: 'time', after: '22:00:00', before: '06:00:00', weekday: ['sat', 'sun']},
    'Time',
    'after 10:00 pm and before 6:00 am and sat, sun',
  ],
  [{condition: 'time', weekday: 'mon'}, 'Time', 'mon'],
  [{condition: 'time'}, 'Time', ''],
  [
    {condition: 'template', value_template: '{{ next_rising and next_midnight }} next_midnight next_rising'},
    'Check',
    'Between solar midnight and sunrise',
  ],
  [
    {
      condition: 'template',
      value_template:
        "{{ state_attr('climate.living_room', 'current_temperature') >= 20 and repeat.index <= 3 or not wait.completed }}",
    },
    'Check',
    'Living room current temperature ≥ 20 and try ≤ 3 or the wait timed out',
  ],
  [
    {condition: 'template', value_template: "{{ wait.completed and state_attr(trigger, 'to_state') != 'x_y' }}"},
    'Check',
    'the wait finished and trigger to state ≠ x y',
  ],
  [
    {condition: 'template', value_template: "{% if x %}{{ is_state(trigger.entity_id, 'on') }}{% endif %}"},
    'Check',
    'the door is open',
  ],
  [{condition: 'template', value_template: "{{ not is_state(trigger.entity_id, 'on') }}"}, 'Check', 'the door closes'],
  [{condition: 'template', value_template: ''}, 'Check', 'Template'],
  [
    {
      condition: 'template',
      value_template:
        '{{ xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx }}',
    },
    'Check',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx…',
  ],
  [{condition: 'sun', after: 'sunset', before: 'sunrise'}, 'Sun', 'after sunset and before sunrise'],
  [
    {condition: 'or', conditions: [{condition: 'state', entity_id: 'light.kitchen_island', state: 'on'}, '{{ true }}']},
    'Any of',
    'Kitchen Island is on / true',
  ],
  [
    {
      condition: 'and',
      conditions: [
        {condition: 'state', entity_id: 'light.kitchen_island', state: 'on'},
        {condition: 'time', after: '10:00'},
      ],
    },
    'All of',
    'Kitchen Island is on + after 10:00 am',
  ],
  [
    {condition: 'not', conditions: {condition: 'state', entity_id: 'light.kitchen_island', state: 'on'}},
    'None of',
    'Kitchen Island is on',
  ],
  [{condition: 'or', conditions: []}, 'Any of', ''],
  [{condition: 'device'}, 'Check', 'Device'],
  [{}, 'Check', 'Condition'],
];
const ACTIONS: Row[] = [
  [{alias: 'Named'}, 'Step', 'Named'],
  [{action: 'script.bed'}, 'Script', 'Bed'],
  [{action: 'script.turn_on', target: {entity_id: 'script.bed'}}, 'Script', 'Turn on Bed'],
  [{action: 'notify.mobile', data: {title: 'Hi'}}, 'Notify', '“Hi” to the phone'],
  [{action: 'notify.mobile'}, 'Notify', 'Message to the phone'],
  [{action: 'persistent_notification.create', data: {title: 'T'}}, 'Notification', 'T'],
  [{action: 'persistent_notification.create'}, 'Notification', 'In Home Assistant'],
  [
    {action: 'scene.create', data: {snapshot_entities: ['light.kitchen_island', 'light.kitchen_sink']}},
    'Snapshot',
    'Remember Kitchen Island or Kitchen Sink',
  ],
  [{action: 'scene.turn_on', target: {entity_id: 'scene.x'}}, 'Scene', 'X'],
  [
    {action: 'climate.set_temperature', target: {entity_id: 'climate.living_room'}, data: {temperature: 21.5}},
    'Climate',
    'Living room → 21.5°',
  ],
  [
    {service: 'climate.set_temperature', data: {entity_id: 'climate.living_room', temperature: '{{ t }}'}},
    'Climate',
    'Living room → by the schedule',
  ],
  [
    {action: 'climate.set_hvac_mode', target: {entity_id: 'climate.living_room'}, data: {hvac_mode: 'fan_only'}},
    'Climate',
    'Living room mode fan only',
  ],
  [
    {action: 'climate.set_fan_mode', target: {entity_id: 'climate.living_room'}, data: {fan_mode: 'auto'}},
    'Climate',
    'Living room fan auto',
  ],
  [
    {action: 'climate.set_swing_mode', target: {entity_id: 'climate.living_room'}, data: {swing_mode: 'both_ways'}},
    'Climate',
    'Living room swing both ways',
  ],
  [
    {action: 'adaptive_lighting.set_manual_control', data: {manual_control: true, lights: ['light.kitchen_island']}},
    'Adaptive Lighting',
    'Manual · Kitchen Island',
  ],
  [
    {action: 'adaptive_lighting.set_manual_control', data: {manual_control: false, lights: '{{ x }}'}},
    'Adaptive Lighting',
    'Back to Auto · that light',
  ],
  [
    {action: 'light.turn_on', target: {entity_id: 'light.kitchen_island'}, data: {brightness_pct: 40}},
    'Light',
    'Kitchen Island brightness 40%',
  ],
  [
    {action: 'light.turn_on', target: {entity_id: 'light.kitchen_island'}, data: {brightness_pct: '{{ b }}'}},
    'Light',
    'Kitchen Island brightness ± 5% per notch',
  ],
  [
    {action: 'light.turn_on', target: {entity_id: ''}, data: {entity_id: 'light.kitchen_sink'}},
    'Light',
    'Turn on Kitchen Sink',
  ],
  [{action: 'input_boolean.turn_on', target: {entity_id: 'input_boolean.away'}}, 'Helper', 'Away → on'],
  [{action: 'input_boolean.turn_off', entity_id: 'input_boolean.away'}, 'Helper', 'Away → off'],
  [{action: 'input_boolean.toggle', target: {entity_id: 'input_boolean.away'}}, 'Helper', 'Away → toggle'],
  [{action: 'shell_command.do_it'}, 'Command', 'Do it'],
  [{action: 'homeassistant.reload_config_entry'}, 'System', 'Reload the integration'],
  [{action: 'media_player.media_pause', target: {entity_id: 'media_player.tv'}}, 'Media', 'Pause Tv'],
  [{action: 'wake_on_lan.send_magic_packet'}, 'Wake-on-LAN', 'Send magic packet'],
  [{action: 'foo_bar.do_thing', target: {entity_id: 'foo_bar.x'}}, 'Foo bar', 'Do thing X'],
  [{delay: {minutes: 5}}, 'Delay', 'Wait 5 min'],
  [{delay: '00:00:30'}, 'Delay', 'Wait 30 s'],
  [{delay: '{{ x }}'}, 'Delay', 'Wait a while'],
  [{delay: 7200}, 'Delay', 'Wait 2 h'],
  [{delay: '05:30'}, 'Delay', 'Wait 6 min'],
  [
    {wait_template: "{{ is_state('binary_sensor.front_door', 'off') }}", timeout: '00:10:00'},
    'Wait',
    'Until Front closed, up to 10 min',
  ],
  [{wait_template: '{{ x }}'}, 'Wait', 'Until x'],
  [
    {
      wait_for_trigger: [
        {trigger: 'state', entity_id: 'binary_sensor.front_door', to: 'off'},
        {trigger: 'sun', event: 'sunset'},
      ],
      timeout: 60,
    },
    'Wait for',
    'Front closed or Sunset, up to 1 min',
  ],
  [{stop: ''}, 'Stop', 'Stop here'],
  [{stop: 'Done'}, 'Stop', 'Done'],
  [{condition: 'state', entity_id: 'light.kitchen_island', state: 'on'}, 'Light', 'Kitchen Island is on'],
  [{variables: {a: 1, b: 2}}, 'Variables', 'a, b'],
  [{event: 'my_event'}, 'Event', 'my_event'],
  [
    {repeat: {until: [{condition: 'state', entity_id: 'light.kitchen_island', state: 'on'}, '{{ x }}'], sequence: []}},
    'Repeat',
    'until Kitchen Island is on and x',
  ],
  [
    {repeat: {while: {condition: 'state', entity_id: 'light.kitchen_island', state: 'on'}, sequence: []}},
    'Repeat',
    'while Kitchen Island is on',
  ],
  [{repeat: {count: 3, sequence: []}}, 'Repeat', '3 times'],
  [{repeat: {count: '{{ n }}', sequence: []}}, 'Repeat', '{{ n }} times'],
  [{repeat: {for_each: [1, 2], sequence: []}}, 'Repeat', 'for each'],
  [{parallel: [{}, {}]}, 'In parallel', '2 branches'],
  // the legacy panel wrote `1 branches`; the catalog's plural mends it
  [{parallel: {}}, 'In parallel', '1 branch'],
  [{repeat: {until: [], sequence: []}}, 'Repeat', 'until '],
  [{action: '', service: 'light.turn_on', target: {entity_id: 'light.kitchen_sink'}}, 'Light', 'Turn on Kitchen Sink'],
  [{sequence: []}, 'Step', 'sequence'],
  [{}, 'Step', 'step'],
];
const EN_FIXTURES = {
  'entrance_light_until_closed.json': [
    'Door · Front opened',
    'Sun · sun is below horizon',
    'Light · Turn on Living room lamp',
    'Wait for · Front closed, up to 10 min',
    'Light · Turn off Living room lamp',
  ],
  'heating_evening.json': ['Time · 6:00 pm', 'Helper · Heating away is off', 'Climate · Living room → 21°'],
  'heating_morning.json': ['Time · 6:00 am', 'Person · Alex Example → home', 'Step · choose'],
  'lights_off_at_sunrise.json': ['Sun · Sunrise', 'Light · Turn off every light'],
  'office_light_blink.json': ['Motion · Hall detects motion', 'Repeat · 3 times'],
  'purifier_night_speed.json': [
    'Time · 10:00 pm',
    'Fan · Set percentage Office purifier',
    'Helper · Kids bedtime → on',
  ],
};
const FR_FIXTURES = {
  'entrance_light_until_closed.json': [
    'Porte · Front s’ouvre',
    'Sun · sun est below horizon',
    'Lumière · Allumer Living room lamp',
    'Attendre · Front fermée, au plus 10 min',
    'Lumière · Éteindre Living room lamp',
  ],
  'heating_evening.json': ['Heure · 18 h', 'Assistant · Heating away est off', 'Climat · Living room → 21°'],
  'heating_morning.json': ['Heure · 6 h', 'Person · Alex Example → home', 'Étape · choose'],
  'lights_off_at_sunrise.json': ['Soleil · Lever du soleil', 'Lumière · Éteindre toutes les lumières'],
  'office_light_blink.json': ['Mouvement · Hall détecte un mouvement', 'Répéter · 3 fois'],
  'purifier_night_speed.json': [
    'Heure · 22 h',
    'Ventilateur · Set percentage Office purifier',
    'Assistant · Kids bedtime → activé',
  ],
};

describe('the English the legacy panel drew', () => {
  test.each(TRIGGERS)('trigger %j', (input, k, t) => {
    expect(triggerText(input as Record<string, unknown>, EN)).toMatchObject({k, t});
  });
  test.each(CONDITIONS)('condition %j', (input, k, t) => {
    expect(conditionText(input, EN)).toMatchObject({k, t});
  });
  test.each(ACTIONS)('action %j', (input, k, t) => {
    expect(actionText(input as Record<string, unknown>, EN)).toMatchObject({k, t});
  });

  test('a script is drawn as a subroutine, and a step names the key it was worded from', () => {
    expect(actionText({action: 'script.bed'}, EN)).toMatchObject({kind: 'automations.domain.script', shape: 'sub'});
    expect(actionText({action: 'foo_bar.do'}, EN).kind).toBeNull();
    expect(triggerText({trigger: 'time_pattern', minutes: '/5'}, EN).kind).toBe('automations.kind.every');
  });

  test("a service named like a member of Object's prototype is a service, not the member", () => {
    expect(actionText({action: 'lock.constructor'}, EN)).toMatchObject({k: 'Lock', t: 'Constructor'});
  });
});

describe('the trace fixtures, in English and in French', () => {
  const folder = new URL('../../fixtures/traces/', import.meta.url);
  const lines = (language: 'en' | 'fr') => {
    const deps = depsOf(language, STATES);
    const line = (s: {k: string; t: string}) => `${s.k} · ${s.t}`;
    return Object.fromEntries(
      readdirSync(folder)
        .filter(f => f.endsWith('.json'))
        .sort()
        .map(f => {
          const c = (
            JSON.parse(readFileSync(new URL(f, folder), 'utf8')) as {config: Record<string, Record<string, unknown>[]>}
          ).config;
          return [
            f,
            [
              ...c.triggers.map(x => line(triggerText(x, deps))),
              ...c.conditions.map(x => line(conditionText(x, deps))),
              ...c.actions.map(x => line(actionText(x, deps))),
            ],
          ];
        }),
    );
  };

  test('English', () => {
    expect(lines('en')).toEqual(EN_FIXTURES);
  });
  test('French: the catalog words the kinds and the phrases; names, states the panel has no word for and ids stay as Home Assistant gives them', () => {
    expect(lines('fr')).toEqual(FR_FIXTURES);
  });
});

describe('the helpers', () => {
  test('durationText: numbers, clock strings, objects, templates and nothing', () => {
    expect(durationText(7200, EN)).toBe('2 h');
    expect(durationText(5400, EN)).toBe('1.5 h');
    expect(durationText('00:01:30', EN)).toBe('2 min');
    expect(durationText('01:05', EN)).toBe('1 min');
    expect(durationText({days: 1}, EN)).toBe('24 h');
    expect(durationText({}, EN)).toBe('0 s');
    expect(durationText('{{ x }}', EN)).toBe('a while');
    expect(durationText('soon', EN)).toBe('');
    expect(durationText(null, EN)).toBe('');
    expect(durationText('', EN)).toBe('');
    expect(durationText(5400, depsOf('fr', STATES))).toBe('1,5 h');
  });

  test('nameOf: a template, a variable, every light, the home zone, a name without its device word, an unknown id', () => {
    expect(nameOf('{{ light }}', EN)).toBe('the light');
    expect(nameOf('{{ states.x }}', EN)).toBe('the chosen one');
    expect(nameOf('all', EN)).toBe('every light');
    expect(nameOf('zone.home', EN)).toBe('Home zone');
    expect(nameOf('binary_sensor.front_door', EN)).toBe('Front');
    expect(nameOf('sensor.outside_temp', EN)).toBe('Outside temp');
    expect(nameOf(undefined, EN)).toBe('');
  });

  test('the text helpers', () => {
    expect(cut('  a   b  ')).toBe('a b');
    expect(cut('abcdef', 4)).toBe('abc…');
    expect(shortAlias('Heating - evening')).toBe('evening');
    expect(shortAlias('A very long group name, longer - x')).toBe('A very long group name, longer - x');
    expect(shortAlias(undefined)).toBe('');
  });
});
