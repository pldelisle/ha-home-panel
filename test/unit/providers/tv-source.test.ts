// findTv and the two TV sources: which media_player is the television, what it is called and which button wakes it. The
// test house gives today's answer as literals; literal players give the rules it does not exercise; the recorded house is
// read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {entity, fakeHass} from '../fake-hass.ts';
import {fullHouse, houseOf, readingOf, recorded, type Player} from '../features/media/support.ts';
import {TV_SOURCES, findTv} from '../../../src/features/media/inputs.ts';
import {samsungTvSource} from '../../../src/providers/samsung-tv.ts';
import {tvEntitySource} from '../../../src/providers/tv-entity.ts';
import type {TvSource} from '../../../src/providers/tv-source.ts';

type House = ReturnType<typeof houseOf>;
const tvOf = (house: House, sources?: readonly TvSource[]) => {
  const {states, registries, names} = readingOf(house);
  return findTv(states, registries, names, sources);
};

const SET = {device_class: 'tv', friendly_name: 'Den TV'};
const samsung = (id: string, row = {}, device?: Player[4], attributes = {}): Player => [
  id,
  'on',
  {...SET, ...attributes},
  {platform: 'samsungtv', ...row},
  device,
];
const generic = (id: string, row = {}, device?: Player[4], attributes = {}): Player => [
  id,
  'on',
  {...SET, ...attributes},
  {platform: 'androidtv', ...row},
  device,
];

describe('the test house', () => {
  test('the television is the Samsung set in the living room, worded by the catalog message of its platform because its device has no name of its own', () => {
    expect(tvOf(fullHouse)).toEqual({
      id: 'media_player.living_room_tv',
      name: null,
      defaultName: 'media.samsungTv',
      areaId: 'living_room',
      wakeButton: null,
      state: 'on',
      source: 'Netflix',
      summarySource: 'Netflix',
      muted: false,
    });
  });

  test('the sources are Samsung first, then the generic entity', () => {
    expect(TV_SOURCES.map(source => source.name)).toEqual(['samsung-tv', 'tv-entity']);
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the rules are tested on the test house', () => {});
    return;
  }

  test('a house with a visible television gets one, and a Samsung one when it has any', () => {
    const hass = fakeHass.fromFixture('main');
    const visible = Object.keys(hass.states).filter(
      id =>
        id.startsWith('media_player.') &&
        hass.states[id].attributes.device_class === 'tv' &&
        !hass.entities?.[id]?.hidden,
    );
    const samsungSets = visible.filter(id => hass.entities?.[id]?.platform === 'samsungtv');
    const tv = tvOf(hass);
    if (visible.length === 0) expect(tv).toBeNull();
    else expect(visible).toContain(tv?.id);
    if (samsungSets.length > 0) expect(samsungSets).toContain(tv?.id);
  });
});

describe('which player is the television', () => {
  test('a Samsung set is preferred over a generic one when both exist, whatever their order', () => {
    expect(tvOf(houseOf([generic('media_player.a'), samsung('media_player.b')]))?.id).toBe('media_player.b');
    expect(tvOf(houseOf([samsung('media_player.b'), generic('media_player.a')]))?.id).toBe('media_player.b');
  });

  test('without a Samsung set the first generic television is the one', () => {
    expect(tvOf(houseOf([generic('media_player.a'), generic('media_player.b')]))?.id).toBe('media_player.a');
  });

  test('a house with no television gives null: a speaker, a player that is not a television, or nothing at all', () => {
    expect(tvOf(houseOf([]))).toBeNull();
    expect(
      tvOf(houseOf([['media_player.kitchen', 'playing', {friendly_name: 'Kitchen'}, {platform: 'cast'}]])),
    ).toBeNull();
    expect(tvOf(houseOf([], [entity('switch.tv', 'on', {device_class: 'tv'})]))).toBeNull();
  });

  test('a hidden player is not a candidate, and the next one is', () => {
    expect(tvOf(houseOf([samsung('media_player.a', {hidden: true}), generic('media_player.b')]))?.id).toBe(
      'media_player.b',
    );
    expect(tvOf(houseOf([samsung('media_player.a', {hidden: true})]))).toBeNull();
  });

  test('a Samsung player that does not say it is a television is not one (the rule filters on the device class first)', () => {
    expect(tvOf(houseOf([samsung('media_player.a', {}, undefined, {device_class: 'speaker'})]))).toBeNull();
  });

  test('the sources answer for themselves: candidates in order, and a source with none is passed over', () => {
    const house = houseOf([generic('media_player.a'), samsung('media_player.b'), generic('media_player.c')]);
    const {states, registries} = readingOf(house);
    expect(samsungTvSource.candidates(states, registries)).toEqual(['media_player.b']);
    expect(tvEntitySource.candidates(states, registries)).toEqual([
      'media_player.a',
      'media_player.b',
      'media_player.c',
    ]);
    expect(tvOf(house, [tvEntitySource])?.id).toBe('media_player.a');
    expect(tvOf(house, [])).toBeNull();
  });
});

describe('what the television is called', () => {
  const device = {id: 'd1', name: 'Samsung Q60', name_by_user: 'Basement screen'};

  test('a device the household named gives that name, through the resolver, for either source', () => {
    expect(tvOf(houseOf([samsung('media_player.a', {device_id: 'd1'}, device)]))).toMatchObject({
      name: 'Basement screen',
      defaultName: 'media.samsungTv',
    });
    expect(tvOf(houseOf([generic('media_player.a', {device_id: 'd1'}, device)]))).toMatchObject({
      name: 'Basement screen',
      defaultName: 'media.tv',
    });
  });

  test("the resolver's overrides apply: the config's names block wins over the device's", () => {
    const house = houseOf([generic('media_player.a', {device_id: 'd1'}, device)]);
    const {states, registries, store} = readingOf(house);
    store.setPanelConfig({names: {d1: {en: 'Movie screen'}}});
    expect(findTv(states, registries, store.names)?.name).toBe('Movie screen');
  });

  test("a set the household did not name leaves the name to the catalog's default for its source; a generic one keeps its entity name", () => {
    expect(tvOf(houseOf([samsung('media_player.a')]))).toMatchObject({name: null, defaultName: 'media.samsungTv'});
    expect(tvOf(houseOf([generic('media_player.a')]))).toMatchObject({name: 'Den TV', defaultName: 'media.tv'});
    const unnamed = generic('media_player.a', {}, undefined, {friendly_name: undefined});
    expect(tvOf(houseOf([unnamed]))).toMatchObject({name: null, defaultName: 'media.tv'});
  });

  test('the area comes from the entity, else from its device, else there is none', () => {
    expect(tvOf(houseOf([generic('media_player.a', {area_id: 'den'})]))?.areaId).toBe('den');
    expect(tvOf(houseOf([generic('media_player.a', {device_id: 'd1'}, {id: 'd1', area_id: 'attic'})]))?.areaId).toBe(
      'attic',
    );
    expect(tvOf(houseOf([generic('media_player.a')]))?.areaId).toBeNull();
  });
});

describe('the wake-on-LAN button', () => {
  const button = (id: string, name: string) => entity(id, 'unknown', {friendly_name: name});

  test('a set has the wake-on-LAN button whose name mentions a TV, whatever the case', () => {
    const house = houseOf(
      [samsung('media_player.a')],
      [button('button.wake_on_lan_laptop', 'Laptop'), button('button.wake_on_lan_set', 'Wake the tv')],
    );
    expect(tvOf(house)?.wakeButton).toBe('button.wake_on_lan_set');
  });

  test('a button that is not a wake-on-LAN one, or whose name has no TV in it, is not the button; there may be none', () => {
    const house = houseOf(
      [samsung('media_player.a')],
      [button('button.restart_tv', 'Restart TV'), button('button.wake_on_lan_laptop', 'Laptop')],
    );
    expect(tvOf(house)?.wakeButton).toBeNull();
    expect(
      tvOf(houseOf([samsung('media_player.a')], [entity('button.wake_on_lan_x', 'unknown')]))?.wakeButton,
    ).toBeNull();
  });

  test('a generic television has it too: the legacy rule looks for the button whichever set it chose', () => {
    const house = houseOf([generic('media_player.a')], [button('button.wake_on_lan_set', 'TV')]);
    expect(tvOf(house)?.wakeButton).toBe('button.wake_on_lan_set');
  });
});

describe('the state, the input and the volume', () => {
  test('on is any state but off, and an unavailable set is unavailable, whatever it says', () => {
    const state = (value: string) => tvOf(houseOf([['media_player.a', value, SET, {platform: 'samsungtv'}]]))?.state;
    expect(state('off')).toBe('off');
    expect(state('playing')).toBe('on');
    expect(state('standby')).toBe('on');
    expect(state('unavailable')).toBe('unavailable');
    expect(state('unknown')).toBe('unavailable');
  });

  test('the input is cleaned to what the card shows: nothing after a dash, the full-width ampersand an ampersand', () => {
    const source = (value: unknown) =>
      tvOf(houseOf([samsung('media_player.a', {}, undefined, {source: value})]))?.source;
    expect(source('HDMI 2 - Console')).toBe('HDMI 2');
    expect(source('HDMI 1 – Cable')).toBe('HDMI 1');
    expect(source('Prime＆Co')).toBe('Prime&Co');
    expect(source('Netflix')).toBe('Netflix');
    expect(source(undefined)).toBeNull();
    expect(source(3)).toBeNull();
  });

  test("the pane's sub-line takes the input with the dash cut and the full-width ampersand kept, as the legacy line did", () => {
    const source = (value: unknown) =>
      tvOf(houseOf([samsung('media_player.a', {}, undefined, {source: value})]))?.summarySource;
    expect(source('Prime＆Co - Home')).toBe('Prime＆Co');
    expect(source('HDMI 1 – Cable')).toBe('HDMI 1');
    expect(source('Netflix')).toBe('Netflix');
    expect(source(undefined)).toBeNull();
  });

  test('muted follows the volume flag', () => {
    const muted = (value: unknown) =>
      tvOf(houseOf([samsung('media_player.a', {}, undefined, {is_volume_muted: value})]))?.muted;
    expect(muted(true)).toBe(true);
    expect(muted(false)).toBe(false);
    expect(muted(undefined)).toBe(false);
  });
});
