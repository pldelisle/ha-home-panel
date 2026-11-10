// The registry of the ten subjects (src/shell/features.ts): the order of the rail, the phone's bar, the catalog labels and
// the tab that gives way to Home. Pure data and one pure function, tested with literal inputs.
import {describe, expect, test} from 'vitest';
import {en} from '../../src/core/i18n/en.ts';
import {fr} from '../../src/core/i18n/fr.ts';
import {resolveConfig} from '../../src/core/config.ts';
import {createStore} from '../../src/core/store.ts';
import {weatherFeature} from '../../src/features/weather/index.ts';
import * as full from '../houses/full.mjs';
import {fakeHass} from './fake-hass.ts';
import {FEATURES, UNDER_MORE, isFeatureKey, visibleTab} from '../../src/shell/features.ts';
import {FR_MAP} from '../../src/i18n/fr.js';

describe('the registry', () => {
  test('lists the ten subjects in rail order', () => {
    expect(FEATURES.map(f => f.key)).toEqual([
      'home',
      'lights',
      'climate',
      'weather',
      'car',
      'energy',
      'air',
      'media',
      'cams',
      'auto',
    ]);
  });

  test('puts Home, Lights, Climate and Car on the phone bar and the rest under More', () => {
    expect(FEATURES.filter(f => f.phoneBar).map(f => f.key)).toEqual(['home', 'lights', 'climate', 'car']);
  });

  test('names each subject by its colour token and a catalog title, and only Automations has a short one', () => {
    expect(FEATURES.map(f => f.color)).toEqual([
      'var(--c-grid)',
      'var(--warn)',
      'var(--c-wh)',
      'var(--m-blue)',
      'var(--c-ev)',
      'var(--c-grid)',
      'var(--ok)',
      'var(--c-home)',
      'var(--m-purple)',
      'var(--c-heat)',
    ]);
    for (const f of FEATURES) expect(f.title).toBe(`${f.key}.title`);
    expect(FEATURES.filter(f => f.shortTitle).map(f => [f.key, f.shortTitle])).toEqual([['auto', 'auto.short']]);
  });

  // the rail's labels were English words the French layer rewrote with its map; they are catalog messages now and must
  // read the same
  test('reads the rail in French as the rewrite map did', () => {
    const labels: [keyof typeof en, string][] = [
      ...FEATURES.map(f => [f.title, en[f.title]] as [keyof typeof en, string]),
    ];
    labels.push(['auto.short', en['auto.short']]);
    // the More sheet's Close button, which the sheet draws from the catalog (its title, line and the bar's More left the map
    // after a byte comparison; the French baseline of the sheet holds them)
    labels.push(['more.close', en['more.close']]);
    for (const [key, english] of labels) expect(fr[key], key).toBe(FR_MAP[english]);
  });

  test('says More as the rewrite map did, on the bar and in the sheet', () => {
    expect(fr['more.title']).toBe('Plus');
    expect(fr['nav.more']).toBe(fr['more.title']);
  });

  test('lists under More the six subjects the phone bar does not hold', () => {
    expect(UNDER_MORE.map(f => f.key)).toEqual(['weather', 'energy', 'air', 'media', 'cams', 'auto']);
  });
});

describe('isFeatureKey', () => {
  test('knows the ten keys and nothing else', () => {
    expect(FEATURES.every(f => isFeatureKey(f.key))).toBe(true);
    expect(isFeatureKey('phone')).toBe(false);
    expect(isFeatureKey('')).toBe(false);
  });
});

describe('visibleTab', () => {
  test('shows the tab asked for when the house shows it', () => {
    expect(visibleTab('car', {car: true})).toBe('car');
  });

  test('counts a subject nobody answered for as shown', () => {
    expect(visibleTab('weather', {})).toBe('weather');
  });

  test('falls back to Home when the house hides the tab', () => {
    expect(visibleTab('car', {car: false, climate: true})).toBe('home');
  });

  test('falls back to Home for a tab the panel does not have', () => {
    expect(visibleTab('phone', {})).toBe('home');
    expect(visibleTab('', {})).toBe('home');
  });
});

describe('the Weather descriptor', () => {
  const store = (house?: ReturnType<typeof fakeHass.fromHouse>) => {
    const s = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    if (house) s.setHass(house);
    return s;
  };
  const weather = FEATURES.find(f => f.key === 'weather')!;
  const guest = {availability: () => ({}), moreLine: () => null};

  test("is the registry's own, always shown, and binds its pane to the sheet host's answers: the detail's `open`, the tile whose history is open", () => {
    expect(weather).toBe(weatherFeature);
    expect(weather.available).toBeUndefined();
    expect(weather.detailSheet).toBe('weather.detail');
    expect(weather.overSheets).toEqual(['weather.history']);
    const pane = (open: string | null, detail?: unknown) =>
      weather.pane({
        store: store(),
        guest,
        sheetOpen: id => id === open,
        sheetDetail: id => (id === open ? detail : undefined),
      });
    expect(pane(null).values).toEqual([false, undefined]);
    expect(pane('weather.detail').values).toEqual([true, undefined]);
    expect(pane('weather.history', {key: 'wind'}).values).toEqual([false, 'wind']);
    // a request that names no tile of the table opens nothing the pane could draw
    expect(pane('weather.history', {key: 'rain'}).values).toEqual([false, undefined]);
  });

  test('says the temperature and the condition under More, and nothing before the house has been heard', () => {
    expect(
      weather.summary?.({
        store: store(fakeHass.fromHouse(full)),
        guest,
        sheetOpen: () => false,
        sheetDetail: () => undefined,
      }),
    ).toBe('4° · Mainly sunny');
    expect(weather.summary?.({store: store(), guest, sheetOpen: () => false, sheetDetail: () => undefined})).toBeNull();
  });
});
