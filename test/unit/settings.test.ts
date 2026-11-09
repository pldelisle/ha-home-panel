// The settings reader, given a Map-backed Storage in place of the browser's localStorage.
import {describe, expect, test} from 'vitest';
import {createSettings, type KeyValueStorage} from '../../src/core/settings.ts';

const mapStorage = (init: Record<string, string> = {}) => {
  const map = new Map(Object.entries(init));
  const storage: KeyValueStorage = {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  return {map, storage};
};

const throwing: KeyValueStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

const DEFAULTS = {theme: 'auto', text: 'auto', glass: 'dawn', glassLevel: 50, tab: 'home'};

describe('reading', () => {
  test('a missing key gives the default', () => {
    expect(createSettings(mapStorage().storage).get()).toEqual(DEFAULTS);
  });

  test('stored values are read from the five keys', () => {
    const {storage} = mapStorage({
      'home-panel-theme': 'dark',
      'home-panel-text': 'large',
      'home-panel-glass': 'night',
      'home-panel-glass-t': '20',
      'home-panel-tab': 'climate',
    });
    expect(createSettings(storage).get()).toEqual({
      theme: 'dark',
      text: 'large',
      glass: 'night',
      glassLevel: 20,
      tab: 'climate',
    });
  });

  test('an empty string gives the default, as the old reads did', () => {
    const {storage} = mapStorage({'home-panel-theme': '', 'home-panel-tab': ''});
    expect(createSettings(storage).get()).toMatchObject({theme: 'auto', tab: 'home'});
  });

  test('a glass level that is not a number gives 50', () => {
    expect(createSettings(mapStorage({'home-panel-glass-t': 'abc'}).storage).get().glassLevel).toBe(50);
  });

  test('a glass level of 250 is clamped to 100 and one below zero to 0', () => {
    expect(createSettings(mapStorage({'home-panel-glass-t': '250'}).storage).get().glassLevel).toBe(100);
    expect(createSettings(mapStorage({'home-panel-glass-t': '-7'}).storage).get().glassLevel).toBe(0);
  });

  test('a storage whose getItem throws gives the defaults', () => {
    expect(createSettings(throwing).get()).toEqual(DEFAULTS);
  });
});

describe('writing', () => {
  test('set writes the key as before and the schema version once, on the first write', () => {
    const {map, storage} = mapStorage();
    const settings = createSettings(storage);
    settings.set('glassLevel', 30);
    settings.set('theme', 'dark');
    settings.set('text', 'small');
    settings.set('glass', 'noon');
    settings.set('tab', 'energy');
    expect(Object.fromEntries(map)).toEqual({
      'home-panel-settings': '1',
      'home-panel-glass-t': '30',
      'home-panel-theme': 'dark',
      'home-panel-text': 'small',
      'home-panel-glass': 'noon',
      'home-panel-tab': 'energy',
    });
    expect(settings.get()).toEqual({theme: 'dark', text: 'small', glass: 'noon', glassLevel: 30, tab: 'energy'});
  });

  test('reading writes nothing', () => {
    const {map, storage} = mapStorage();
    createSettings(storage).get();
    expect(map.size).toBe(0);
  });

  test('a storage whose setItem throws never throws and the version is tried again on the next write', () => {
    const writes: string[] = [];
    let full = true;
    const storage: KeyValueStorage = {
      getItem: () => null,
      setItem: k => {
        if (full) throw new Error('quota');
        writes.push(k);
      },
    };
    const settings = createSettings(storage);
    expect(() => settings.set('tab', 'climate')).not.toThrow();
    full = false;
    settings.set('tab', 'climate');
    expect(writes).toEqual(['home-panel-settings', 'home-panel-tab']);
  });

  test('a fully blocked storage lets both get and set return quietly', () => {
    const settings = createSettings(throwing);
    expect(() => settings.set('theme', 'dark')).not.toThrow();
    expect(settings.get().theme).toBe('auto');
  });
});
