// speakers: which players are speakers, in which area, and what each is called there. The test house gives today's answer
// as a literal; literal players give the rules it does not exercise; the recorded house is read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {speakers} from '../../../../src/features/media/speakers.ts';
import {fakeHass} from '../../fake-hass.ts';
import {fullHouse, houseOf, readingOf, recorded, type Player} from './support.ts';

type House = ReturnType<typeof houseOf>;
const speakersOf = (house: House, tvId: string | null = null) => {
  const {states, registries, names} = readingOf(house);
  return speakers(states, registries, names, tvId);
};
const namesOf = (house: House, tvId: string | null = null) => speakersOf(house, tvId).map(s => s.name);

const player = (id: string, name: string, row: Player[3] = {area_id: 'kitchen'}): Player => [
  id,
  'idle',
  {friendly_name: name},
  {platform: 'cast', ...row},
];
const AREAS = {kitchen: 'Kitchen', office: 'Office'};

describe('the test house', () => {
  test('its one speaker is in the living room, and the Samsung television is no speaker whether or not it is named', () => {
    const one = [{id: 'media_player.living_room_speaker', areaId: 'living_room', name: 'speaker'}];
    expect(speakersOf(fullHouse, 'media_player.living_room_tv')).toEqual(one);
    expect(speakersOf(fullHouse)).toEqual(one);
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the rules are tested on the test house', () => {});
    return;
  }

  test('every speaker sits in an area, has a name and is not on a camera or television platform', () => {
    const {states, registries, names} = readingOf(fakeHass.fromFixture('main'));
    for (const speaker of speakers(states, registries, names, null)) {
      expect(speaker.areaId).not.toBe('');
      expect(speaker.name).not.toBe('');
      expect(['unifiprotect', 'samsungtv']).not.toContain(registries.entities?.[speaker.id]?.platform);
    }
  });
});

describe('which players are speakers', () => {
  test('every visible media player but the television, in the order the house lists them', () => {
    const house = houseOf(
      [player('media_player.b', 'B'), player('media_player.tv', 'TV'), player('media_player.a', 'A')],
      [],
      AREAS,
    );
    expect(speakersOf(house, 'media_player.tv').map(s => s.id)).toEqual(['media_player.b', 'media_player.a']);
    expect(speakersOf(house).map(s => s.id)).toEqual(['media_player.b', 'media_player.tv', 'media_player.a']);
  });

  test('the UniFi Protect and Samsung platforms are excluded: a camera speaker and a television have their own controls', () => {
    const house = houseOf(
      [
        player('media_player.camera', 'Doorbell', {area_id: 'kitchen', platform: 'unifiprotect'}),
        player('media_player.set', 'Set', {area_id: 'kitchen', platform: 'samsungtv'}),
        player('media_player.pod', 'Pod'),
      ],
      [],
      AREAS,
    );
    expect(speakersOf(house).map(s => s.id)).toEqual(['media_player.pod']);
  });

  test('a hidden player is excluded', () => {
    const house = houseOf(
      [player('media_player.hidden', 'Hidden', {area_id: 'kitchen', hidden: true}), player('media_player.pod', 'Pod')],
      [],
      AREAS,
    );
    expect(speakersOf(house).map(s => s.id)).toEqual(['media_player.pod']);
  });

  test('a player that is not a media player is not a speaker', () => {
    const house = houseOf([player('media_player.pod', 'Pod')], [], AREAS);
    house.states['switch.pod'] = house.states['media_player.pod'];
    expect(speakersOf(house).map(s => s.id)).toEqual(['media_player.pod']);
  });

  test('a player with no area is excluded; the device gives the area the entity lacks', () => {
    const house = houseOf(
      [
        player('media_player.nowhere', 'Nowhere', {}),
        player('media_player.by_entity', 'By entity', {area_id: 'office'}),
        player('media_player.by_device', 'By device', {device_id: 'd1'}),
        player('media_player.lost', 'Lost', {device_id: 'd2'}),
      ],
      [],
      AREAS,
    );
    house.devices = {d1: {id: 'd1', area_id: 'kitchen'}, d2: {id: 'd2', area_id: null}};
    expect(speakersOf(house).map(({id, areaId}) => [id, areaId])).toEqual([
      ['media_player.by_entity', 'office'],
      ['media_player.by_device', 'kitchen'],
    ]);
  });
});

describe('what a speaker is called', () => {
  test("the words of its area's name are dropped: HomePod mini Kitchen in the Kitchen is HomePod mini", () => {
    expect(namesOf(houseOf([player('media_player.a', 'HomePod mini Kitchen')], [], AREAS))).toEqual(['HomePod mini']);
  });

  test("case, accents and a possessive do not matter to a match, and a word that is not the area's stays", () => {
    const areas = {salon: "Mom's Kitchen café"};
    const house = houseOf([player('media_player.a', "KITCHEN Cafe Mom's HomePod", {area_id: 'salon'})], [], areas);
    expect(namesOf(house)).toEqual(['HomePod']);
  });

  test('a name made only of the area is kept whole, not emptied', () => {
    expect(namesOf(houseOf([player('media_player.a', 'Kitchen')], [], AREAS))).toEqual(['Kitchen']);
  });

  test('the name the panel shows the area by counts too: in French the room dictionary says Cuisine for the Kitchen', () => {
    const house = {...houseOf([player('media_player.a', 'HomePod Cuisine')], [], AREAS), locale: {language: 'fr'}};
    expect(namesOf(house)).toEqual(['HomePod']);
    expect(namesOf({...house, locale: {language: 'en'}})).toEqual(['HomePod Cuisine']);
  });

  test('a speaker the household renamed shows the name it was given, through the resolver', () => {
    const house = houseOf([player('media_player.a', 'HomePod Kitchen')], [], AREAS);
    const {states, registries, store} = readingOf(house);
    store.setPanelConfig({names: {'media_player.a': {en: 'Kitchen radio box'}}});
    expect(speakers(states, registries, store.names, null).map(s => s.name)).toEqual(['radio box']);
  });

  test('a word with no letters or digits is no word of the area, and an area with no name of its own drops nothing', () => {
    expect(namesOf(houseOf([player('media_player.a', 'Pod - Kitchen')], [], AREAS))).toEqual(['Pod -']);
    const nameless = houseOf([player('media_player.a', 'Pod Kitchen')], [], {kitchen: ''});
    expect(namesOf(nameless)).toEqual(['Pod Kitchen']);
  });
});
