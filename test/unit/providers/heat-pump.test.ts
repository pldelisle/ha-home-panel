// heatPump and hpSeries: the unit's reading (the brand rule three ways, the defaults, null when unset, an unavailable or missing
// unit) and the state history as a line that a gap breaks. The houses are literal: the test house has no heat pump.
import {describe, expect, test} from 'vitest';
import {registriesOf} from '../../../src/core/registry.ts';
import {heatPump, hpSeries} from '../../../src/providers/heat-pump.ts';
import {houseOf, storeOf, type Player} from '../features/media/support.ts';

const ID = 'climate.pump';
const CONFIG = {entities: {heat_pump: ID}};

/** The unit read in a house of these players, with the config's `heat_pump` set unless the test says otherwise. */
const read = (players: Player[], config: object = CONFIG) => {
  const hass = houseOf(players);
  return heatPump(hass.states, registriesOf(hass), storeOf(hass, config).config);
};
const pump = (
  state = 'heat',
  attributes: Record<string, unknown> = {},
  row: Player[3] = {},
  device?: Player[4],
): Player => [ID, state, attributes, row, device];

describe('the brand', () => {
  test('Fujitsu when the platform is FGLair, whatever the device says', () => {
    expect(
      read([pump('heat', {}, {platform: 'fglair', device_id: 'd'}, {id: 'd', manufacturer: 'Other'})])?.brand,
    ).toBe('Fujitsu');
  });

  test('Fujitsu when the manufacturer matches, in any case', () => {
    expect(
      read([pump('heat', {}, {platform: 'climate', device_id: 'd'}, {id: 'd', manufacturer: 'FUJITSU General'})])
        ?.brand,
    ).toBe('Fujitsu');
  });

  test('else the manufacturer as the device gives it', () => {
    expect(
      read([pump('heat', {}, {platform: 'climate', device_id: 'd'}, {id: 'd', manufacturer: 'Daikin'})])?.brand,
    ).toBe('Daikin');
  });

  test('else null, for the model to word: no device, no manufacturer, or no registry row', () => {
    expect(read([pump('heat', {}, {platform: 'climate', device_id: 'd'}, {id: 'd'})])?.brand).toBeNull();
    expect(read([pump('heat', {}, {platform: 'climate'})])?.brand).toBeNull();
    expect(read([pump()])?.brand).toBeNull();
  });
});

describe('the reading', () => {
  test('a unit that says everything', () => {
    const attributes = {
      hvac_action: 'heating',
      current_temperature: 19.5,
      temperature: 22,
      min_temp: 18,
      max_temp: 28,
      hvac_modes: ['off', 'heat', 'cool'],
      fan_modes: ['auto', 'low'],
      preset_modes: ['none', 'boost'],
      swing_modes: ['off', 'vertical'],
      fan_mode: 'auto',
      preset_mode: 'none',
      swing_mode: 'off',
    };
    expect(read([pump('heat', attributes)])).toEqual({
      id: ID,
      present: true,
      brand: null,
      available: true,
      mode: 'heat',
      action: 'heating',
      temperature: 19.5,
      target: 22,
      minTemp: 18,
      maxTemp: 28,
      modes: ['off', 'heat', 'cool'],
      fanModes: ['auto', 'low'],
      presetModes: ['none', 'boost'],
      swingModes: ['off', 'vertical'],
      fan: 'auto',
      preset: 'none',
      swing: 'off',
      lastUpdated: Date.parse('2026-01-01T00:00:00+00:00'),
    });
  });

  test('the defaults: 16 to 30, the modes off and heat, no fan, preset or louvers, nothing read', () => {
    expect(read([pump('off')])).toMatchObject({
      mode: 'off',
      action: null,
      temperature: null,
      target: null,
      minTemp: 16,
      maxTemp: 30,
      modes: ['off', 'heat'],
      fanModes: null,
      presetModes: null,
      swingModes: null,
      fan: null,
      preset: null,
      swing: null,
    });
  });

  test('an attribute of the wrong kind is not read', () => {
    expect(read([pump('heat', {min_temp: 'cold', fan_modes: 'auto', hvac_modes: ['off', 3]})])).toMatchObject({
      minTemp: 16,
      fanModes: null,
      modes: ['off'],
    });
  });

  test('null when the config has no heat pump', () => {
    expect(read([pump()], {})).toBeNull();
  });

  test('an unavailable unit is there but not available, and reads the defaults, as the legacy panel did', () => {
    expect(read([pump('unavailable', {min_temp: 10, temperature: 22, fan_modes: ['auto']})])).toMatchObject({
      present: true,
      available: false,
      mode: 'unavailable',
      target: null,
      minTemp: 16,
      fanModes: null,
    });
  });

  test('a unit the config names and Home Assistant does not know is not present', () => {
    expect(read([])).toMatchObject({present: false, available: false, mode: 'unavailable', lastUpdated: null});
  });
});

describe('hpSeries', () => {
  const point = (lastUpdated: number, state: string, attributes?: Record<string, unknown>) => ({
    state,
    lastUpdated,
    lastChanged: lastUpdated,
    attributes,
  });
  const temperature = (attributes: Record<string, unknown>) => attributes.current_temperature as number | undefined;

  test('a value carries on to a millisecond before the next, so a step is a step', () => {
    expect(
      hpSeries(
        [point(100, 'heat', {current_temperature: 20}), point(200, 'heat', {current_temperature: 21})],
        temperature,
      ),
    ).toEqual([
      [100, 20],
      [199, 20],
      [200, 21],
    ]);
  });

  test('an unavailable point, or one with no value, breaks the line once, and the line starts again after it', () => {
    expect(
      hpSeries(
        [
          point(100, 'heat', {current_temperature: 20}),
          point(200, 'unavailable'),
          point(300, 'unavailable'),
          point(400, 'heat', {current_temperature: 22}),
          point(500, 'heat'),
        ],
        temperature,
      ),
    ).toEqual([
      [100, 20],
      [200, null],
      [300, null],
      [400, 22],
      [500, null],
    ]);
  });

  test('a gap before the first value starts nothing, pick reads the state too, and no points is no line', () => {
    const unlessOff = (attributes: Record<string, unknown>, state: string) =>
      state === 'off' ? null : (attributes.temperature as number);
    expect(hpSeries([point(50, 'unavailable'), point(100, 'heat', {temperature: 22})], unlessOff)).toEqual([[100, 22]]);
    expect(hpSeries([point(100, 'off', {temperature: 22}), point(200, 'heat', {temperature: 21})], unlessOff)).toEqual([
      [200, 21],
    ]);
    expect(hpSeries([], temperature)).toEqual([]);
  });
});
