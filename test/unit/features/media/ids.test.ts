// mediaIds: every entity id the Media pane and the Home cards read, so the store tells them about those and no others.
import {describe, expect, test} from 'vitest';
import {resolveConfig} from '../../../../src/core/config.ts';
import {mediaIds} from '../../../../src/features/media/ids.ts';
import {createStore} from '../../../../src/core/store.ts';
import {entity, fakeHass} from '../../fake-hass.ts';
import {fullHouse, houseOf, recorded, storeOf, type Player} from './support.ts';

const TV: Player = ['media_player.tv', 'on', {device_class: 'tv'}, {platform: 'samsungtv'}];
const POD: Player = ['media_player.pod', 'idle', {friendly_name: 'Pod'}, {platform: 'cast', area_id: 'den'}];

describe('the test house', () => {
  test('the television, the speaker, the two scenes and the mode the config names; a mode the house lacks is left out', () => {
    const store = storeOf(fullHouse, {modes: ['input_boolean.kids_bedtime', 'input_boolean.gone']});
    expect(mediaIds(store)).toEqual([
      'media_player.living_room_tv',
      'media_player.living_room_speaker',
      'scene.movie_night',
      'scene.dinner',
      'input_boolean.kids_bedtime',
    ]);
  });

  test('a light, a thermostat or a door is outside the list, so its change never reaches the pane', () => {
    const ids = mediaIds(storeOf(fullHouse));
    expect(ids.filter(id => /^(light|climate|binary_sensor|weather)\./.test(id))).toEqual([]);
    expect(ids.length).toBeLessThan(Object.keys(fullHouse.states).length / 4);
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the ids are tested on the test house', () => {});
    return;
  }

  test('lists only media players, scenes, buttons and the config’s modes, each once', () => {
    const ids = mediaIds(storeOf(fakeHass.fromFixture('main')));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter(id => !/^(media_player|scene|button|input_boolean)\./.test(id))).toEqual([]);
  });
});

describe('what is listed', () => {
  test('the television first, then its wake button, then the speakers, the scenes and the modes', () => {
    const house = houseOf(
      [POD, TV],
      [
        entity('input_boolean.movie', 'off'),
        entity('scene.evening', 'unknown'),
        entity('button.wake_on_lan_set', 'unknown', {friendly_name: 'TV'}),
      ],
      {den: 'Den'},
    );
    expect(mediaIds(storeOf(house, {modes: ['input_boolean.movie']}))).toEqual([
      'media_player.tv',
      'button.wake_on_lan_set',
      'media_player.pod',
      'scene.evening',
      'input_boolean.movie',
    ]);
  });

  test('a house with no television has no television id and no button; a hidden scene is not listed', () => {
    const house = houseOf([POD], [entity('scene.shown', 'unknown'), entity('scene.hidden', 'unknown')], {den: 'Den'});
    house.entities = {...house.entities, 'scene.hidden': {entity_id: 'scene.hidden', hidden: true}};
    expect(mediaIds(storeOf(house))).toEqual(['media_player.pod', 'scene.shown']);
  });

  test('a store that has not been given a hass lists nothing', () => {
    const store = createStore({defaultTimeZone: 'UTC', resolve: resolveConfig});
    expect(mediaIds(store)).toEqual([]);
  });
});
