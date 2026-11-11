// areaOf and isHidden: the registry rules the store, the providers and the features share.
import {describe, expect, test} from 'vitest';
import {areaOf, isHidden} from '../../../src/core/registry.ts';

const registries = {
  entities: {
    'light.own': {entity_id: 'light.own', area_id: 'den', device_id: 'd1'},
    'light.via_device': {entity_id: 'light.via_device', device_id: 'd1'},
    'light.no_area': {entity_id: 'light.no_area', device_id: 'd2'},
    'light.no_device': {entity_id: 'light.no_device'},
    'light.hidden': {entity_id: 'light.hidden', hidden: true},
    'light.shown': {entity_id: 'light.shown', hidden: false},
  },
  devices: {d1: {id: 'd1', area_id: 'attic'}, d2: {id: 'd2', area_id: null}},
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
