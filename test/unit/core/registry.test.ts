// areaOf, isHidden, nameOwner and entitiesByDevice: the registry rules the store, the providers and the features share.
import {describe, expect, test} from 'vitest';
import {areaOf, entitiesByDevice, isHidden, nameOwner} from '../../../src/core/registry.ts';

const registries = {
  entities: {
    'light.own': {entity_id: 'light.own', area_id: 'den', device_id: 'd1'},
    'light.via_device': {entity_id: 'light.via_device', device_id: 'd1'},
    'light.no_area': {entity_id: 'light.no_area', device_id: 'd2'},
    'light.no_device': {entity_id: 'light.no_device'},
    'light.hidden': {entity_id: 'light.hidden', hidden: true},
    'light.shown': {entity_id: 'light.shown', hidden: false},
    'sensor.named_by_user': {entity_id: 'sensor.named_by_user', device_id: 'd3'},
    'sensor.named_by_integration': {entity_id: 'sensor.named_by_integration', device_id: 'd4'},
    'sensor.unnamed_device': {entity_id: 'sensor.unnamed_device', device_id: 'd5'},
    'sensor.unknown_device': {entity_id: 'sensor.unknown_device', device_id: 'd9'},
  },
  devices: {
    d1: {id: 'd1', area_id: 'attic'},
    d2: {id: 'd2', area_id: null},
    d3: {id: 'd3', name: 'Hub', name_by_user: 'Hall'},
    d4: {id: 'd4', name: 'Hub'},
    d5: {id: 'd5', name: '', name_by_user: null},
  },
};

describe('areaOf', () => {
  test("the entity's own area wins over its device's", () => {
    expect(areaOf('light.own', registries)).toBe('den');
    expect(areaOf('light.via_device', registries)).toBe('attic');
  });

  test('no area anywhere, no device, an unknown entity or no registries at all is the empty string', () => {
    expect(areaOf('light.no_area', registries)).toBe('');
    expect(areaOf('light.no_device', registries)).toBe('');
    expect(areaOf('light.gone', registries)).toBe('');
    expect(areaOf('light.own', {})).toBe('');
    expect(areaOf('light.via_device', {entities: registries.entities})).toBe('');
  });
});

describe('isHidden', () => {
  test('only an entity the registry marks hidden is hidden', () => {
    expect(isHidden('light.hidden', registries)).toBe(true);
    expect(isHidden('light.shown', registries)).toBe(false);
    expect(isHidden('light.gone', registries)).toBe(false);
    expect(isHidden('light.hidden', {})).toBe(false);
  });
});

describe('nameOwner', () => {
  test("the device's id when the household or the integration named the device", () => {
    expect(nameOwner('sensor.named_by_user', registries)).toBe('d3');
    expect(nameOwner('sensor.named_by_integration', registries)).toBe('d4');
  });

  test('the entity itself when its device has no name, is unknown, is absent or there are no registries', () => {
    expect(nameOwner('sensor.unnamed_device', registries)).toBe('sensor.unnamed_device');
    expect(nameOwner('sensor.unknown_device', registries)).toBe('sensor.unknown_device');
    expect(nameOwner('light.no_device', registries)).toBe('light.no_device');
    expect(nameOwner('light.gone', registries)).toBe('light.gone');
    expect(nameOwner('sensor.named_by_user', {})).toBe('sensor.named_by_user');
  });
});

describe('entitiesByDevice', () => {
  test("each device's entity ids in the registry's order; an entity with no device is in no list", () => {
    const byDevice = entitiesByDevice(registries);
    expect(byDevice.get('d1')).toEqual(['light.own', 'light.via_device']);
    expect(byDevice.get('d2')).toEqual(['light.no_area']);
    expect(byDevice.get('d9')).toEqual(['sensor.unknown_device']);
    expect([...byDevice.values()].flat()).not.toContain('light.no_device');
  });

  test('no registries is an empty map', () => {
    expect(entitiesByDevice({}).size).toBe(0);
  });
});
