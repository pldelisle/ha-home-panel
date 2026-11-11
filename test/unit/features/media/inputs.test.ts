// readMedia: the television and the speakers of a house, read into the inputs the model will take. The test house gives
// today's answer as literals; literal players give the readings it does not have; the recorded house is read when it exists.
import {describe, expect, test} from 'vitest';
import {readMedia} from '../../../../src/features/media/inputs.ts';
import {TV_SOURCES, type TvSource} from '../../../../src/providers/tv-source.ts';
import {fakeHass} from '../../fake-hass.ts';
import {fullHouse, houseOf, readingOf, recorded, type Player} from './support.ts';

type House = ReturnType<typeof houseOf>;
const mediaOf = (house: House, sources?: readonly TvSource[]) => {
  const {states, registries, deps} = readingOf(house);
  return readMedia(states, registries, deps, sources);
};

describe('the test house', () => {
  test('a television that is on over Netflix, and one speaker that is playing a track at 35 percent', () => {
    expect(mediaOf(fullHouse)).toEqual({
      tv: {
        id: 'media_player.living_room_tv',
        name: 'Samsung TV',
        areaId: 'living_room',
        wakeButton: null,
        state: 'on',
        source: 'Netflix',
        muted: false,
      },
      speakers: [
        {
          id: 'media_player.living_room_speaker',
          areaId: 'living_room',
          name: 'speaker',
          state: 'playing',
          available: true,
          features: 16 | 32 | 4 | 1 | 16384,
          title: 'Test tone',
          artist: 'Nobody',
          album: null,
          picture: null,
          volume: 0.35,
        },
      ],
    });
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the inputs are tested on the test house', () => {});
    return;
  }

  test('reads without a hole: every speaker has a state, a feature number and a volume that is a fraction or null', () => {
    const {speakers} = mediaOf(fakeHass.fromFixture('main'));
    for (const speaker of speakers) {
      expect(typeof speaker.state).toBe('string');
      expect(Number.isInteger(speaker.features)).toBe(true);
      expect(speaker.volume === null || (speaker.volume >= 0 && speaker.volume <= 1)).toBe(true);
    }
  });
});

describe('what a speaker reads', () => {
  const pod = (state: string, attributes: Record<string, unknown> = {}): Player => [
    'media_player.pod',
    state,
    attributes,
    {platform: 'cast', area_id: 'den'},
  ];
  const speakerOf = (state: string, attributes?: Record<string, unknown>) =>
    mediaOf(houseOf([pod(state, attributes)], [], {den: 'Den'})).speakers[0];

  test('the track, the artist, the album, the cover and the volume come from the attributes, else null', () => {
    expect(
      speakerOf('paused', {
        media_title: 'Song',
        media_artist: 'Band',
        media_album_name: 'Record',
        entity_picture: '/cover.png',
        volume_level: 0,
        supported_features: 4,
      }),
    ).toMatchObject({title: 'Song', artist: 'Band', album: 'Record', picture: '/cover.png', volume: 0, features: 4});
    expect(speakerOf('idle')).toMatchObject({
      title: null,
      artist: null,
      album: null,
      picture: null,
      volume: null,
      features: 0,
    });
  });

  test('a speaker that is unavailable or unknown is not available; any other state is', () => {
    expect(speakerOf('unavailable')).toMatchObject({state: 'unavailable', available: false});
    expect(speakerOf('unknown')).toMatchObject({available: false});
    expect(speakerOf('off')).toMatchObject({state: 'off', available: true});
  });
});

describe('the television and the speakers do not overlap', () => {
  test('the player chosen as the television is not also a speaker, and with no television every player is a speaker', () => {
    const house = houseOf(
      [
        ['media_player.set', 'on', {device_class: 'tv'}, {platform: 'androidtv', area_id: 'den'}],
        ['media_player.pod', 'idle', {}, {platform: 'cast', area_id: 'den'}],
      ],
      [],
      {den: 'Den'},
    );
    expect(mediaOf(house).speakers.map(s => s.id)).toEqual(['media_player.pod']);
    const without = mediaOf(house, []);
    expect(without.tv).toBeNull();
    expect(without.speakers.map(s => s.id)).toEqual(['media_player.set', 'media_player.pod']);
  });

  test('the default sources are the shipped list', () => {
    const {states, registries, deps} = readingOf(fullHouse);
    expect(readMedia(states, registries, deps)).toEqual(readMedia(states, registries, deps, TV_SOURCES));
  });
});
