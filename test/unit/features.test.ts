// The registry of the ten subjects (src/shell/features.ts): the order of the rail, the phone's bar, the catalog labels and
// the tab that gives way to Home. Pure data and one pure function, tested with literal inputs.
import {describe, expect, test} from 'vitest';
import {en} from '../../src/core/i18n/en.ts';
import {fr} from '../../src/core/i18n/fr.ts';
import {resolveConfig} from '../../src/core/config.ts';
import {createStore} from '../../src/core/store.ts';
import {airFeature} from '../../src/features/air/index.ts';
import {automationsFeature} from '../../src/features/automations/index.ts';
import {lightsFeature} from '../../src/features/lights/index.ts';
import {energyFeature} from '../../src/features/energy/index.ts';
import {mediaFeature} from '../../src/features/media/index.ts';
import {securityFeature} from '../../src/features/security/index.ts';
import {weatherFeature} from '../../src/features/weather/index.ts';
import * as full from '../houses/full.mjs';
import {FULL_CFG} from '../e2e/houses.ts';
import {fakeHass} from './fake-hass.ts';
import {CATEGORIES, FEATURES, UNDER_MORE, isFeatureKey, sidebarRows, visibleTab} from '../../src/shell/features.ts';
import {roomList} from '../../src/shell/rooms.ts';
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

  test('names each subject by its colour token and a catalog title', () => {
    expect(FEATURES.map(f => f.color)).toEqual([
      'var(--c-grid)',
      'var(--warn)',
      'var(--c-heat)',
      'var(--m-blue)',
      'var(--c-ev)',
      'var(--c-grid)',
      'var(--ok)',
      'var(--c-home)',
      'var(--m-purple)',
      'var(--c-heat)',
    ]);
    for (const f of FEATURES) expect(f.title).toBe(f.key === 'cams' ? 'security.title' : `${f.key}.title`);
  });

  // the rail's labels were English words the French layer rewrote with its map; they are catalog messages now and must
  // read the same
  test('reads the rail in French as the rewrite map did', () => {
    const labels: [keyof typeof en, string][] = [
      ...FEATURES.map(f => [f.title, en[f.title]] as [keyof typeof en, string]),
    ];
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

  test("is the registry's own, always shown, has no detail sheet, and binds its pane to the sheet host's answer: the tile whose history is open", () => {
    expect(weather).toBe(weatherFeature);
    expect(weather.available).toBeUndefined();
    expect(weather.detailSheet).toBeUndefined();
    expect(weather.overSheets).toBeUndefined();
    const pane = (open: string | null, detail?: unknown) =>
      weather.pane({
        store: store(),
        sheetOpen: id => id === open,
        sheetDetail: id => (id === open ? detail : undefined),
        attention: 0,
      });
    expect(pane(null).values).toEqual([undefined]);
    expect(pane('weather.history', {key: 'wind'}).values).toEqual(['wind']);
    // a request that names no tile of the table opens nothing the pane could draw
    expect(pane('weather.history', {key: 'rain'}).values).toEqual([undefined]);
  });

  test('says the temperature and the condition under More, and nothing before the house has been heard', () => {
    expect(
      weather.summary?.({
        store: store(fakeHass.fromHouse(full)),
        sheetOpen: () => false,
        sheetDetail: () => undefined,
        attention: 0,
      }),
    ).toBe('4.2° · Mainly sunny');
    expect(
      weather.summary?.({store: store(), sheetOpen: () => false, sheetDetail: () => undefined, attention: 0}),
    ).toBeNull();
  });
});

describe('the Media descriptor', () => {
  const env = (hass?: ReturnType<typeof fakeHass.fromHouse>) => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    if (hass) store.setHass(hass);
    return {
      store,
      sheetOpen: () => false,
      sheetDetail: () => undefined,
      attention: 0,
    };
  };

  test("is the registry's own and always shown", () => {
    expect(FEATURES.find(f => f.key === 'media')).toBe(mediaFeature);
    expect(mediaFeature.available).toBeUndefined();
  });

  // the More sheet's baselines read the legacy line, which leaves the input out: the brief, not the pane's sub-line
  test('says the television and the speakers that play under More, and nothing before the house has been heard', () => {
    expect(mediaFeature.summary?.(env(fakeHass.fromHouse(full)))).toBe('TV on · 1 playing');
    expect(mediaFeature.summary?.(env())).toBeNull();
  });
});

describe('the Air descriptor', () => {
  const env = (hass?: ReturnType<typeof fakeHass.fromHouse>) => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    if (hass) store.setHass(hass);
    return {
      store,
      sheetOpen: () => false,
      sheetDetail: () => undefined,
      attention: 0,
    };
  };

  test("is the registry's own and always shown, and binds its pane to the sheet host's answers: the detail's `open`, the reading whose history is open", () => {
    expect(FEATURES.find(f => f.key === 'air')).toBe(airFeature);
    expect(airFeature.available).toBeUndefined();
    expect(airFeature.detailSheet).toBe('air.detail');
    expect(airFeature.overSheets).toEqual(['air.history']);
    const pane = (open: string | null, detail?: unknown) =>
      airFeature.pane({...env(), sheetOpen: id => id === open, sheetDetail: id => (id === open ? detail : undefined)});
    const request = {metric: 'co2', room: 'fan.office_purifier'};
    expect(pane(null).values).toEqual([false, undefined]);
    expect(pane('air.detail').values).toEqual([true, undefined]);
    // the request the tile sent is handed on as it is, the same object, so the pane is not asked to draw it again
    expect(pane('air.history', request).values[1]).toBe(request);
    // a request that names no reading of the table, or no room, opens nothing the pane could draw
    expect(pane('air.history', {metric: 'temperature', room: 'fan.office_purifier'}).values).toEqual([
      false,
      undefined,
    ]);
    expect(pane('air.history', {metric: 'co2'}).values).toEqual([false, undefined]);
  });

  // the More sheet's baselines read the legacy word ("Moderate"), not the pane's sub-line ("1 purifier · Moderate"): `airBrief` words the first, the pane the second
  test("says the worst room's level under More, and nothing before the house has been heard", () => {
    expect(airFeature.summary?.(env(fakeHass.fromHouse(full)))).toBe('Moderate');
    expect(airFeature.summary?.(env())).toBeNull();
  });
});

describe('the Energy descriptor', () => {
  const env = (open: string | null = null, hass?: ReturnType<typeof fakeHass.fromHouse>) => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    store.setPanelConfig(FULL_CFG);
    if (hass) store.setHass(hass);
    return {store, sheetOpen: (id: string) => id === open, sheetDetail: () => undefined, attention: 0};
  };

  test("is the registry's own and always shown, and binds its pane to the sheet host's answers: the detail's `open`, then the water heater's and Hilo's", () => {
    expect(FEATURES.find(f => f.key === 'energy')).toBe(energyFeature);
    expect(energyFeature.available).toBeUndefined();
    expect(energyFeature.detailSheet).toBe('energy.detail');
    expect(energyFeature.overSheets).toEqual(['energy.water', 'energy.hilo']);
    expect(energyFeature.pane(env()).values).toEqual([false, false, false]);
    expect(energyFeature.pane(env('energy.detail')).values).toEqual([true, false, false]);
    expect(energyFeature.pane(env('energy.water')).values).toEqual([false, true, false]);
    expect(energyFeature.pane(env('energy.hilo')).values).toEqual([false, false, true]);
  });

  // the More sheet's baselines read the legacy word ("3.24 kW now"), not the pane's sub-line; watts under a kilowatt
  test("says the grid's power now under More, and nothing before the house has been heard", () => {
    const house = fakeHass.fromHouse(full);
    expect(energyFeature.summary?.(env(null, house))).toBe('3.2\u00a0kW now');
    house.states['sensor.house_power'] = {...house.states['sensor.house_power'], state: '850'};
    expect(energyFeature.summary?.(env(null, fakeHass.fromHouse(full, {states: house.states})))).toBe('850\u00a0W now');
    delete house.states['sensor.house_power'];
    expect(energyFeature.summary?.(env(null, fakeHass.fromHouse(full, {states: house.states})))).toBeNull();
    expect(energyFeature.summary?.(env())).toBeNull();
  });
});

describe('the Security descriptor', () => {
  const env = (hass?: ReturnType<typeof fakeHass.fromHouse>) => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    if (hass) store.setHass(hass);
    return {store, sheetOpen: () => false, sheetDetail: () => undefined, attention: 0};
  };

  // the short word ("Closed · motion"), not the pane's line
  test('says the doors and the motion under More, and nothing before the house has been heard', () => {
    const house = fakeHass.fromHouse(full);
    expect(securityFeature.summary?.(env(house))).toBe('Closed · motion');
    house.states['binary_sensor.front_door'] = {...house.states['binary_sensor.front_door'], state: 'on'};
    house.states['binary_sensor.hall_motion'] = {...house.states['binary_sensor.hall_motion'], state: 'off'};
    expect(securityFeature.summary?.(env(fakeHass.fromHouse(full, {states: house.states})))).toBe('1 open');
    expect(securityFeature.summary?.(env())).toBeNull();
  });
});

describe('the Automations descriptor', () => {
  const env = (open: string | null) => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    store.setPanelConfig(FULL_CFG);
    return {store, sheetOpen: (id: string) => id === open, sheetDetail: () => undefined, attention: 0};
  };

  // a phone's row opens that automation's flow in a sheet the pane draws; the pane stays the tab, so there is no `overSheets`
  test("binds its pane to the sheet host's answer for the flow's sheet", () => {
    expect(FEATURES.find(f => f.key === 'auto')).toBe(automationsFeature);
    expect(automationsFeature.pane(env(null)).values).toEqual([false]);
    expect(automationsFeature.pane(env('automations.flow')).values).toEqual([true]);
  });
});

describe('the Liquid Glass sidebar rows', () => {
  test('put Home and Automations first, then the Categories heading and the rest in rail order', () => {
    const rows = sidebarRows(FEATURES);
    expect(rows.map(r => (r === CATEGORIES ? 'categories' : r.key))).toEqual([
      'home',
      'auto',
      'categories',
      'lights',
      'climate',
      'weather',
      'car',
      'energy',
      'air',
      'media',
      'cams',
    ]);
  });

  test('keep every subject once, and leave the registry as it was', () => {
    const before = FEATURES.map(f => f.key);
    const rows = sidebarRows(FEATURES).filter(r => r !== CATEGORIES);
    expect(rows).toHaveLength(FEATURES.length);
    expect(FEATURES.map(f => f.key)).toEqual(before);
  });
});

describe('the rooms of the registry', () => {
  const env = (house?: ReturnType<typeof fakeHass.fromHouse>) => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    if (house) store.setHass(house);
    return {store, sheetOpen: () => false, sheetDetail: () => undefined, room: null};
  };

  test('Lights, Media and Security have a room part, Lights and Media with no reading for the header', () => {
    expect(FEATURES.filter(f => f.room).map(f => f.key)).toEqual(['lights', 'media', 'cams']);
    expect(lightsFeature.room).not.toHaveProperty('chip');
    expect(mediaFeature.room).not.toHaveProperty('chip');
  });

  test('Media lists the areas of its speakers and of its television, and draws its sheet over a room view', () => {
    expect(mediaFeature.room?.areas(env())).toEqual([]);
    expect(mediaFeature.room?.areas(env(fakeHass.fromHouse(full)))).toEqual(['living_room']);
    expect(mediaFeature.overSheets).toEqual(['media.controls']);
  });

  test('Lights lists the areas of its lights, and none before the house has been heard', () => {
    expect(lightsFeature.room?.areas(env())).toEqual([]);
    expect(lightsFeature.room?.areas(env(fakeHass.fromHouse(full)))).toEqual(['kitchen', 'living_room', 'office']);
  });

  test("the test house's rooms are those areas, by display name", () => {
    const e = env(fakeHass.fromHouse(full));
    expect(roomList(FEATURES, e, e.store.names, 'en-CA')).toEqual([
      {areaId: 'kitchen', name: 'Kitchen'},
      {areaId: 'living_room', name: 'Living room'},
      {areaId: 'office', name: 'Office'},
    ]);
  });
});

describe('the Security part of a room view', () => {
  const env = (house?: ReturnType<typeof fakeHass.fromHouse>) => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    if (house) store.setHass(house);
    return {store, sheetOpen: () => false, sheetDetail: () => undefined, room: null};
  };

  test('lists the areas of the door and motion sensors, and none before the house has been heard', () => {
    expect(securityFeature.room?.areas(env())).toEqual([]);
    expect(securityFeature.room?.areas(env(fakeHass.fromHouse(full)))).toEqual(['living_room', 'office']);
  });
});
