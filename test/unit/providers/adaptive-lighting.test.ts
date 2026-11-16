// The Adaptive Lighting provider: which switch runs an area (four rules, each winning over the next), the area's mode, and today's curve.
import {describe, expect, test} from 'vitest';
import {
  adaptiveSwitch,
  alCurve,
  alMode,
  alSwitches,
  curveKelvin,
  hasManualControlService,
} from '../../../src/providers/adaptive-lighting.ts';
import {lightAreas} from '../../../src/providers/light-areas.ts';
import {entity} from '../fake-hass.ts';
import {fullHouse, houseOf, readingOf, type Player} from '../features/media/support.ts';

type House = ReturnType<typeof houseOf>;
const switchOf = (house: House, areaId: string, alAreas: Record<string, string> = {}) => {
  const {states, registries, names} = readingOf(house);
  const area = lightAreas(states, registries, names, {splitLightAreas: []}).find(a => a.key === areaId)!;
  return adaptiveSwitch(area, states, registries, alAreas);
};
const al = (name: string, attributes: object = {}, row: Player[3] = {}): Player => [
  `switch.adaptive_lighting_${name}`,
  'on',
  {friendly_name: `Adaptive Lighting: ${name}`, ...attributes},
  {platform: 'adaptive_lighting', ...row},
];
const denLights: Player[] = [
  ['light.den_1', 'on', {}, {area_id: 'den'}],
  ['light.den_group', 'on', {entity_id: ['light.den_1'], friendly_name: 'Den Reading'}, {area_id: 'den'}],
];
const areas = {den: 'Den'};

describe('adaptiveSwitch', () => {
  test('the test house’s office is run by the switch that lists its light; the kitchen has none', () => {
    expect(switchOf(fullHouse, 'office')).toBe('switch.adaptive_lighting_office');
    expect(switchOf(fullHouse, 'kitchen')).toBeNull();
  });

  test('a switch whose lights include the area’s wins over the config’s map, a group’s members count, and `configuration.lights` stands in for `configured_lights`', () => {
    const house = houseOf(
      [...denLights, al('listed', {configuration: {lights: ['light.den_group']}}), al('mapped')],
      [],
      areas,
    );
    expect(switchOf(house, 'den', {den: 'switch.adaptive_lighting_mapped'})).toBe('switch.adaptive_lighting_listed');
  });

  test('the config’s map wins over a switch in the area, when the switch it names exists', () => {
    const house = houseOf([...denLights, al('mapped'), al('in_area', {}, {area_id: 'den'})], [], areas);
    expect(switchOf(house, 'den', {den: 'switch.adaptive_lighting_mapped'})).toBe('switch.adaptive_lighting_mapped');
    expect(switchOf(house, 'den', {den: 'switch.adaptive_lighting_gone'})).toBe('switch.adaptive_lighting_in_area');
  });

  test('a switch in the area wins over a shared name', () => {
    const house = houseOf([...denLights, al('reading'), al('in_area', {}, {area_id: 'den'})], [], areas);
    expect(switchOf(house, 'den')).toBe('switch.adaptive_lighting_in_area');
  });

  test('last, an instance whose name is in a group’s name, folded; the sleep-mode and adapt twins are never matched', () => {
    const house = houseOf(
      [
        ...denLights,
        al('réading'),
        al('reading_sleep_mode', {}, {area_id: 'den'}),
        ['switch.adaptive_lighting_x', 'on', {}, {}],
      ],
      [],
      areas,
    );
    expect(switchOf(house, 'den')).toBe('switch.adaptive_lighting_réading');
    expect(alSwitches(house.states)).toEqual(['switch.adaptive_lighting_réading', 'switch.adaptive_lighting_x']);
  });

  test('no switch matches: none listed, none mapped, none in the area, no group of the area shares a name', () => {
    expect(switchOf(houseOf([...denLights, al('garage')], [], areas), 'den')).toBeNull();
  });
});

describe('alMode', () => {
  const area = {ids: ['light.a'], units: ['light.g']};
  const house = (main: string, sleep: string | null, manual: string[] = []) => {
    const states = {
      'switch.adaptive_lighting_den': entity('switch.adaptive_lighting_den', main, {manual_control: manual}),
      ...(sleep
        ? {'switch.adaptive_lighting_den_sleep_mode': entity('switch.adaptive_lighting_den_sleep_mode', sleep)}
        : {}),
    };
    return alMode(area, 'switch.adaptive_lighting_den', states);
  };

  test('Auto: the switch on and none of the lights set by hand', () => {
    expect(house('on', 'off')).toEqual({
      alOn: true,
      nightSwitch: 'switch.adaptive_lighting_den_sleep_mode',
      nightOn: false,
      manual: false,
      auto: true,
      mode: 'Auto',
    });
  });

  test('Night: the sleep mode on while the switch is', () => {
    expect(house('on', 'on')).toMatchObject({nightOn: true, auto: true, mode: 'Night'});
    expect(house('off', 'on')).toMatchObject({nightOn: true, alOn: false, mode: 'Manual'});
  });

  test('Manual: a light or a unit of the area under manual control, or the switch off', () => {
    expect(house('on', null, ['light.g'])).toMatchObject({
      manual: true,
      auto: false,
      nightSwitch: null,
      mode: 'Manual',
    });
    expect(house('on', null, ['light.other'])).toMatchObject({mode: 'Auto'});
    expect(house('off', null, ['light.a'])).toMatchObject({manual: false, mode: 'Manual'});
  });

  test('none: an area with no switch', () => {
    expect(alMode(area, null, {})).toEqual({
      alOn: false,
      nightSwitch: null,
      nightOn: false,
      manual: false,
      auto: false,
      mode: '',
    });
  });
});

describe('the curve', () => {
  const sun = {rise: 6_000, noon: 12_000, set: 20_000};

  test('the lowest minimum and the highest maximum of the switches, 2000 and 5500 K where unset', () => {
    expect(
      alCurve(
        [
          {min_color_temp: 2200, max_color_temp: 5000},
          {min_color_temp: 2500, max_color_temp: 6000},
        ],
        sun,
      ),
    ).toEqual({
      minK: 2200,
      maxK: 6000,
      sun,
    });
    expect(alCurve([null, 'x'], {...sun, dawn: 1, dusk: 2} as typeof sun)).toEqual({minK: 2000, maxK: 5500, sun});
  });

  test('the coolest at noon, a parabola to the warmest at sunrise and sunset, the warmest all night', () => {
    const curve = {minK: 2000, maxK: 6000, sun};
    expect(curveKelvin(curve, 12_000)).toBe(6000);
    expect(curveKelvin(curve, 6_000)).toBe(2000);
    expect(curveKelvin(curve, 20_000)).toBe(2000);
    expect(curveKelvin(curve, 9_000)).toBe(5000); // halfway to noon: 1 - 0.5² of the span
    expect(curveKelvin(curve, 16_000)).toBe(5000);
    expect(curveKelvin(curve, 5_000)).toBe(2000);
    expect(curveKelvin(curve, 21_000)).toBe(2000);
    expect(curveKelvin({...curve, sun: {rise: null, noon: 12_000, set: null}}, 12_000)).toBe(2000);
  });
});

test('hasManualControlService: the integration’s services are there', () => {
  expect(hasManualControlService({adaptive_lighting: {set_manual_control: {}}})).toBe(true);
  expect(hasManualControlService({light: {}})).toBe(false);
  expect(hasManualControlService(undefined)).toBe(false);
});
