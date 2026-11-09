// The store at the hass seam (ADR 0005): hand it hass objects as Home Assistant does, assert what a subscriber is told
// and what the accessors return. The shared fake hass builds the objects; nothing here reads a private field.
import {describe, expect, test, vi} from 'vitest';
import {createStore} from '../../src/core/store.ts';
import type {HassEntities} from '../../src/core/hass.ts';
import type {NamesConfig} from '../../src/core/i18n/names.ts';
import {entity, fakeHass} from './fake-hass.ts';

// the resolver is the legacy resolveConfig in the element; here it records what it was handed
const resolve = (raw: unknown, states: HassEntities) => ({raw, count: Object.keys(states).length});
const make = () => createStore({defaultTimeZone: 'UTC', resolve});

const house = () =>
  fakeHass({
    states: {
      'sensor.a': entity('sensor.a', '1'),
      'sensor.b': entity('sensor.b', '2'),
      'sensor.c': entity('sensor.c', '3'),
    },
  });

describe('change detection', () => {
  test('a changed state object notifies a subscriber of that id and not another', () => {
    const store = make();
    const a = vi.fn();
    const b = vi.fn();
    const h = house();
    store.setHass(h);
    store.subscribe(['sensor.a'], a);
    store.subscribe(['sensor.b'], b);
    const change = store.setHass(h.next({'sensor.a': {state: '9'}}));
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(change);
    expect(b).not.toHaveBeenCalled();
    expect([...change.ids]).toEqual(['sensor.a']);
  });

  test('the same hass object twice notifies nobody but the wildcard', () => {
    const store = make();
    const a = vi.fn();
    const all = vi.fn();
    const h = house();
    store.setHass(h);
    store.subscribe(['sensor.a'], a);
    store.subscribe('*', all);
    const change = store.setHass(h);
    expect(a).not.toHaveBeenCalled();
    expect(all).toHaveBeenCalledTimes(1);
    expect(change).toEqual({ids: new Set(), registries: false, locale: false, user: false});
  });

  test('a new state object with an equal value still counts as changed (reference, not value)', () => {
    const store = make();
    const a = vi.fn();
    const h = house();
    store.setHass(h);
    store.subscribe(['sensor.a'], a);
    store.setHass({...h, states: {...h.states, 'sensor.a': {...h.states['sensor.a']}}});
    expect(a).toHaveBeenCalledTimes(1);
  });

  test('a removed id is in ids and notifies its subscriber; an added id is in ids too', () => {
    const store = make();
    const a = vi.fn();
    const d = vi.fn();
    const h = house();
    store.setHass(h);
    store.subscribe(['sensor.a'], a);
    store.subscribe(['sensor.d'], d);
    const states = {...h.states, 'sensor.d': entity('sensor.d', '4')};
    delete states['sensor.a'];
    const change = store.setHass({...h, states});
    expect([...change.ids].sort()).toEqual(['sensor.a', 'sensor.d']);
    expect(a).toHaveBeenCalledTimes(1);
    expect(d).toHaveBeenCalledTimes(1);
  });

  test('the first hass reports every state as changed', () => {
    const store = make();
    const change = store.setHass(house());
    expect([...change.ids].sort()).toEqual(['sensor.a', 'sensor.b', 'sensor.c']);
    expect(change.user).toBe(true);
  });

  test('a subscriber of several changed ids is called once', () => {
    const store = make();
    const cb = vi.fn();
    const h = house();
    store.setHass(h);
    store.subscribe(['sensor.a', 'sensor.b'], cb);
    store.setHass(h.next({'sensor.a': {state: '9'}, 'sensor.b': {state: '9'}}));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('a replaced areas object sets registries and notifies every subscriber', () => {
    const store = make();
    const a = vi.fn();
    const all = vi.fn();
    const h = fakeHass({states: house().states, areas: {kitchen: {area_id: 'kitchen', name: 'Kitchen'}}});
    store.setHass(h);
    store.subscribe(['sensor.a'], a);
    store.subscribe('*', all);
    const change = store.setHass({...h, areas: {...h.areas!}});
    expect(change.registries).toBe(true);
    expect(change.ids.size).toBe(0);
    expect(a).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(1);
  });

  test('replaced entities or devices set registries; unchanged ones do not', () => {
    const store = make();
    const h = fakeHass({entities: {}, devices: {}, areas: {}});
    store.setHass(h);
    expect(store.setHass({...h}).registries).toBe(false);
    expect(store.setHass({...h, entities: {}}).registries).toBe(true);
    expect(store.setHass({...h, entities: {}, devices: {}}).registries).toBe(true);
  });

  test('a language change sets locale and notifies every subscriber', () => {
    const store = make();
    const a = vi.fn();
    const h = house();
    store.setHass(h);
    store.subscribe(['sensor.a'], a);
    expect(store.setHass({...h}).locale).toBe(false);
    const change = store.setHass({...h, locale: {language: 'fr'}});
    expect(change.locale).toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(store.language).toBe('fr');
  });

  test('a time zone change sets locale', () => {
    const store = make();
    const h = house();
    store.setHass(h);
    const change = store.setHass({...h, config: {...h.config, time_zone: 'Europe/Paris'}});
    expect(change.locale).toBe(true);
    expect(store.timeZone).toBe('Europe/Paris');
  });

  test('a new user object sets user and notifies every subscriber', () => {
    const store = make();
    const a = vi.fn();
    const h = house();
    store.setHass(h);
    store.subscribe(['sensor.a'], a);
    const change = store.setHass({...h, user: {name: 'Sam Example', is_admin: false}});
    expect(change.user).toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
  });
});

describe('subscriptions', () => {
  test('a subscriber removed during notification is not called on the next setHass', () => {
    const store = make();
    const h = house();
    store.setHass(h);
    const late = vi.fn();
    const stopLate = store.subscribe(['sensor.a'], late);
    store.subscribe(['sensor.a'], () => stopLate());
    // the unsubscribing callback runs after `late` was registered, in the same pass: removal takes effect next time
    store.setHass(h.next({'sensor.a': {state: '5'}}));
    expect(late).toHaveBeenCalledTimes(1);
    store.setHass(h.next({'sensor.a': {state: '6'}}));
    expect(late).toHaveBeenCalledTimes(1);
  });

  test('a subscriber added during notification is first called on the next setHass', () => {
    const store = make();
    const h = house();
    store.setHass(h);
    const added = vi.fn();
    let once = true;
    store.subscribe('*', () => {
      if (!once) return;
      once = false;
      store.subscribe('*', added);
    });
    store.setHass(h);
    expect(added).not.toHaveBeenCalled();
    store.setHass(h);
    expect(added).toHaveBeenCalledTimes(1);
  });

  test('unsubscribing twice is harmless and stops both kinds of subscriber', () => {
    const store = make();
    const h = house();
    store.setHass(h);
    const byId = vi.fn();
    const all = vi.fn();
    const stopById = store.subscribe(['sensor.a'], byId);
    const stopAll = store.subscribe('*', all);
    stopById();
    stopById();
    stopAll();
    store.setHass(h.next({'sensor.a': {state: '5'}}));
    expect(byId).not.toHaveBeenCalled();
    expect(all).not.toHaveBeenCalled();
  });

  test('the same callback subscribed to an id and to the wildcard is called for each subscription', () => {
    const store = make();
    const cb = vi.fn();
    const h = house();
    store.setHass(h);
    store.subscribe(['sensor.a'], cb);
    store.subscribe('*', cb);
    store.setHass(h.next({'sensor.a': {state: '5'}}));
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe('accessors', () => {
  test('before the first hass the store answers with empty values and the factory defaults', () => {
    const store = make();
    expect(store.hass).toBeNull();
    expect(store.state('sensor.a')).toBeUndefined();
    expect(store.num('sensor.a')).toBeNull();
    expect(store.attr('sensor.a', 'x')).toBeUndefined();
    expect(store.entity('sensor.a')).toBeUndefined();
    expect(store.device('d')).toBeUndefined();
    expect(store.area('a')).toBeUndefined();
    expect(store.areaOf('sensor.a')).toBe('');
    expect(store.timeZone).toBe('UTC');
    expect(store.language).toBe('en');
    expect(store.isFrench).toBe(false);
    expect(store.isAdmin).toBe(false);
    expect(store.userName).toBe('');
  });

  test('state, num, attr and kw read the current hass', () => {
    const store = make();
    store.setHass(
      fakeHass({
        states: {
          'sensor.t': entity('sensor.t', '21.5', {unit_of_measurement: 'C'}),
          'sensor.w': entity('sensor.w', '1500', {unit_of_measurement: 'W'}),
          'sensor.k': entity('sensor.k', '2.5', {unit_of_measurement: 'kW'}),
          'sensor.gone': entity('sensor.gone', 'unavailable'),
          'sensor.unk': entity('sensor.unk', 'unknown'),
          'sensor.text': entity('sensor.text', 'on'),
        },
      }),
    );
    expect(store.state('sensor.t')?.state).toBe('21.5');
    expect(store.state(null)).toBeUndefined();
    expect(store.state(undefined)).toBeUndefined();
    expect(store.num('sensor.t')).toBe(21.5);
    expect(store.num('sensor.gone')).toBeNull();
    expect(store.num('sensor.unk')).toBeNull();
    expect(store.num('sensor.text')).toBeNull();
    expect(store.num('sensor.missing')).toBeNull();
    expect(store.attr('sensor.t', 'unit_of_measurement')).toBe('C');
    expect(store.attr('sensor.missing', 'unit_of_measurement')).toBeUndefined();
    expect(store.kw('sensor.w')).toBe(1.5);
    expect(store.kw('sensor.k')).toBe(2.5);
    expect(store.kw('sensor.gone')).toBeNull();
  });

  test('num of unavailable is null', () => {
    const store = make();
    store.setHass(fakeHass({states: {'sensor.a': entity('sensor.a', 'unavailable')}}));
    expect(store.num('sensor.a')).toBeNull();
  });

  test('areaOf resolves an entity area, else its device area, else an empty string', () => {
    const store = make();
    store.setHass(
      fakeHass({
        entities: {
          'light.own': {entity_id: 'light.own', area_id: 'kitchen', device_id: 'dev1'},
          'light.viadevice': {entity_id: 'light.viadevice', area_id: null, device_id: 'dev1'},
          'light.nodevice': {entity_id: 'light.nodevice', device_id: null},
          'light.baddevice': {entity_id: 'light.baddevice', device_id: 'nope'},
        },
        devices: {dev1: {id: 'dev1', area_id: 'hall'}},
        areas: {kitchen: {area_id: 'kitchen', name: 'Kitchen'}},
      }),
    );
    expect(store.areaOf('light.own')).toBe('kitchen');
    expect(store.areaOf('light.viadevice')).toBe('hall');
    expect(store.areaOf('light.nodevice')).toBe('');
    expect(store.areaOf('light.baddevice')).toBe('');
    expect(store.areaOf('light.unknown')).toBe('');
    expect(store.entity('light.own')?.area_id).toBe('kitchen');
    expect(store.device('dev1')?.area_id).toBe('hall');
    expect(store.area('kitchen')?.name).toBe('Kitchen');
  });

  test('areaOf is empty when the hass has no registries', () => {
    const store = make();
    store.setHass(fakeHass());
    expect(store.areaOf('light.own')).toBe('');
  });

  test('language reads locale, then hass.language, then en; French is detected on the language tag', () => {
    const store = make();
    store.setHass(fakeHass({locale: undefined, language: 'fr-CA'}));
    expect(store.language).toBe('fr-CA');
    expect(store.isFrench).toBe(true);
    store.setHass(fakeHass({locale: undefined}));
    expect(store.language).toBe('en');
    store.setHass(fakeHass({locale: {language: 'fr'}, language: 'en'}));
    expect(store.language).toBe('fr');
    store.setHass(fakeHass({locale: {language: 'frisian'}}));
    expect(store.isFrench).toBe(false);
  });

  test('the user, the admin flag and the time zone come from the hass', () => {
    const store = make();
    store.setHass(fakeHass({user: {name: 'Sam Example', is_admin: false}}));
    expect(store.userName).toBe('Sam Example');
    expect(store.isAdmin).toBe(false);
    expect(store.timeZone).toBe('America/Toronto');
    store.setHass(fakeHass());
    expect(store.isAdmin).toBe(true);
    store.setHass(fakeHass({user: undefined, config: {time_zone: '', latitude: 0, longitude: 0}}));
    expect(store.userName).toBe('');
    expect(store.timeZone).toBe('UTC');
  });
});

describe('t', () => {
  test('speaks English before the first hass, then the language of the hass, rebuilt when it changes', () => {
    const store = make();
    expect(store.t('charts.failed')).toBe('Charts library failed to load');
    store.setHass(fakeHass({locale: {language: 'fr'}}));
    expect(store.t('charts.failed')).toBe("La bibliothèque de graphiques n'a pas chargé");
    store.setHass(fakeHass({locale: {language: 'en'}}));
    expect(store.t('charts.failed')).toBe('Charts library failed to load');
  });

  test('a language with no catalog reads English, and a taken-apart t keeps working across a language change', () => {
    const store = make();
    const {t} = store;
    store.setHass(fakeHass({locale: {language: 'de'}}));
    expect(t('charts.failed')).toBe('Charts library failed to load');
    store.setHass(fakeHass({locale: {language: 'fr'}}));
    expect(t('charts.failed')).toBe("La bibliothèque de graphiques n'a pas chargé");
  });
});

describe('names', () => {
  const areas = {living: {area_id: 'living', name: 'Living room'}, salon: {area_id: 'salon', name: 'Salon'}};
  const makeNamed = () =>
    createStore({defaultTimeZone: 'UTC', resolve: (raw: unknown) => raw as {names?: NamesConfig}});

  test('speak English before the first hass, then follow the language of the hass', () => {
    const store = makeNamed();
    expect(store.names.name('Salon')).toBe('Living room');
    expect(store.names.name('Gym')).toBe('Gym');
    store.setHass(fakeHass({areas, locale: {language: 'en'}}));
    expect(store.names.name('salon')).toBe('Living room');
    store.setHass(fakeHass({areas, locale: {language: 'fr'}}));
    expect(store.names.name('living')).toBe('Salon');
    store.setHass(fakeHass({areas, locale: {language: 'en'}}));
    expect(store.names.name('living')).toBe('Living room');
  });

  test('follow a language set on the hass object the store already holds, and say so once', () => {
    const store = makeNamed();
    const all = vi.fn();
    const h = fakeHass({areas, locale: {language: 'en'}});
    store.setHass(h);
    store.subscribe('*', all);
    h.locale = {language: 'fr'};
    expect(store.setHass(h).locale).toBe(true);
    expect(store.names.name('living')).toBe('Salon');
    expect(store.t('charts.failed')).toBe("La bibliothèque de graphiques n'a pas chargé");
    expect(store.setHass(h).locale).toBe(false);
    expect(all).toHaveBeenCalledTimes(2);
  });

  test('follow the names: block of the config, before and after the first hass', () => {
    const store = makeNamed();
    store.setPanelConfig({names: {Salon: {en: 'Lounge'}}});
    store.setHass(fakeHass({areas, locale: {language: 'en'}}));
    expect(store.names.name('salon')).toBe('Lounge');
    store.setPanelConfig({names: {Salon: {en: 'Parlour'}}});
    expect(store.names.name('salon')).toBe('Parlour');
    store.setPanelConfig({});
    expect(store.names.name('salon')).toBe('Living room');
  });

  test('read a name Home Assistant changed in a state or a registry without waiting for a locale or config change', () => {
    const store = makeNamed();
    const h = fakeHass({areas, states: {'light.a': entity('light.a', 'on', {friendly_name: 'Cuisine'})}});
    store.setHass(h);
    expect(store.names.name('light.a')).toBe('Kitchen');
    store.setHass({...h, states: {'light.a': entity('light.a', 'on', {friendly_name: 'Chambre'})}});
    expect(store.names.name('light.a')).toBe('Bedroom');
    store.setHass({...h, areas: {salon: {area_id: 'salon', name: 'Bureau'}}});
    expect(store.names.name('salon')).toBe('Office');
  });
});

describe('panel config', () => {
  test('the config resolves against empty states before the first hass', () => {
    const store = make();
    expect(store.setPanelConfig({rooms: ['a']})).toBe(true);
    expect(store.config).toEqual({raw: {rooms: ['a']}, count: 0});
    expect(store.generation).toBe(1);
  });

  test('the first hass resolves the config again against its states without a new generation', () => {
    const store = make();
    store.setPanelConfig({rooms: ['a']});
    store.setHass(house());
    expect(store.config).toEqual({raw: {rooms: ['a']}, count: 3});
    expect(store.generation).toBe(1);
  });

  test('later hass objects do not resolve the config again', () => {
    const resolver = vi.fn(resolve);
    const store = createStore({defaultTimeZone: 'UTC', resolve: resolver});
    const h = house();
    store.setHass(h);
    const calls = resolver.mock.calls.length;
    store.setHass(h.next({'sensor.a': {state: '9'}}));
    expect(resolver).toHaveBeenCalledTimes(calls);
  });

  test('setPanelConfig with JSON-equal input returns false and keeps the generation', () => {
    const store = make();
    expect(store.setPanelConfig({rooms: ['a'], people: ['x']})).toBe(true);
    const config = store.config;
    expect(store.setPanelConfig({rooms: ['a'], people: ['x']})).toBe(false);
    expect(store.generation).toBe(1);
    expect(store.config).toBe(config);
    expect(store.setPanelConfig({rooms: ['b']})).toBe(true);
    expect(store.generation).toBe(2);
  });

  test('a missing config counts as an empty one', () => {
    const store = make();
    expect(store.setPanelConfig(undefined)).toBe(true); // the first config always applies
    expect(store.setPanelConfig({})).toBe(false);
    expect(store.setPanelConfig(null)).toBe(false);
  });

  test('a config set after a hass resolves against its states', () => {
    const store = make();
    store.setHass(house());
    store.setPanelConfig({rooms: ['a']});
    expect(store.config.count).toBe(3);
  });
});
