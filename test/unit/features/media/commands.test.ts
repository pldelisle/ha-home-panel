// The Media commands as data: each is a pure function that returns what the runner will send, toast and release.
// The expected objects are literals, so a rename of a service or a key is a failing test.
import {describe, expect, test} from 'vitest';
import {
  K,
  SCENE_RAN_MS,
  runScene,
  setMode,
  speakerPlayPause,
  speakerSkip,
  speakerVolume,
  tvMute,
  tvPlayPause,
  tvPower,
  tvVolume,
} from '../../../../src/features/media/commands.ts';

const TV = {id: 'media_player.living_room_tv', wakeButton: null};
const SPEAKER = {id: 'media_player.kitchen_speaker', name: 'HomePod mini'};

describe('the typed overlay keys', () => {
  test('are the id and a suffix, so the television, a speaker and a mode never share a key', () => {
    expect(K.on('media_player.tv')).toBe('media_player.tv:on');
    expect(K.mute('media_player.tv')).toBe('media_player.tv:mute');
    expect(K.state('media_player.kitchen')).toBe('media_player.kitchen:st');
    expect(K.volume('media_player.kitchen')).toBe('media_player.kitchen:vol');
    expect(K.ran('scene.movie')).toBe('scene.movie:ran');
  });

  test('a scene is held as run for four seconds', () => {
    expect(SCENE_RAN_MS).toBe(4000);
  });
});

describe('tvPower', () => {
  test('turning on without a wake button is one call, with no second try', () => {
    expect(tvPower(TV, true)).toEqual({
      domain: 'media_player',
      service: 'turn_on',
      data: {entity_id: 'media_player.living_room_tv'},
      holds: ['media_player.living_room_tv:on'],
      done: {key: 'media.tvTurningOn'},
    });
  });

  test('turning on with a wake button falls back to pressing it, whichever set it is', () => {
    expect(tvPower({id: 'media_player.living_room_tv', wakeButton: 'button.wake_on_lan_tv'}, true)).toEqual({
      domain: 'media_player',
      service: 'turn_on',
      data: {entity_id: 'media_player.living_room_tv'},
      holds: ['media_player.living_room_tv:on'],
      done: {key: 'media.tvTurningOn'},
      fallback: {domain: 'button', service: 'press', data: {entity_id: 'button.wake_on_lan_tv'}},
    });
  });

  test('turning off never presses the wake button', () => {
    expect(tvPower({id: 'media_player.living_room_tv', wakeButton: 'button.wake_on_lan_tv'}, false)).toEqual({
      domain: 'media_player',
      service: 'turn_off',
      data: {entity_id: 'media_player.living_room_tv'},
      holds: ['media_player.living_room_tv:on'],
      done: {key: 'media.tvTurnedOff'},
    });
  });
});

describe('the television', () => {
  test('a volume step is silent and holds nothing', () => {
    expect(tvVolume(TV, 'up')).toEqual({
      domain: 'media_player',
      service: 'volume_up',
      data: {entity_id: 'media_player.living_room_tv'},
    });
    expect(tvVolume(TV, 'down')).toEqual({
      domain: 'media_player',
      service: 'volume_down',
      data: {entity_id: 'media_player.living_room_tv'},
    });
  });

  test.each([true, false])('mute to %s holds the mute', muted => {
    expect(tvMute(TV, muted)).toEqual({
      domain: 'media_player',
      service: 'volume_mute',
      data: {entity_id: 'media_player.living_room_tv', is_volume_muted: muted},
      holds: ['media_player.living_room_tv:mute'],
    });
  });

  test('play or pause is silent and holds nothing', () => {
    expect(tvPlayPause(TV)).toEqual({
      domain: 'media_player',
      service: 'media_play_pause',
      data: {entity_id: 'media_player.living_room_tv'},
    });
  });
});

describe('a speaker', () => {
  test('play holds the state as playing and says the speaker by name', () => {
    expect(speakerPlayPause(SPEAKER, true)).toEqual({
      domain: 'media_player',
      service: 'media_play',
      data: {entity_id: 'media_player.kitchen_speaker'},
      holds: ['media_player.kitchen_speaker:st'],
      done: {key: 'media.speakerPlaying', values: {name: 'HomePod mini'}},
    });
  });

  test('pause says it paused', () => {
    expect(speakerPlayPause(SPEAKER, false)).toEqual({
      domain: 'media_player',
      service: 'media_pause',
      data: {entity_id: 'media_player.kitchen_speaker'},
      holds: ['media_player.kitchen_speaker:st'],
      done: {key: 'media.speakerPaused', values: {name: 'HomePod mini'}},
    });
  });

  test.each([
    ['next', 'media_next_track'],
    ['previous', 'media_previous_track'],
  ] as const)('skip %s is silent', (direction, service) => {
    expect(speakerSkip(SPEAKER, direction)).toEqual({
      domain: 'media_player',
      service,
      data: {entity_id: 'media_player.kitchen_speaker'},
    });
  });

  test.each([
    [0.35, 0.35],
    [0.3 + 0.05, 0.35],
    [0.123, 0.12],
    [1.4, 1],
    [-0.2, 0],
    [-0.001, 0],
  ])('a volume of %s is sent as %s, clamped to two decimals', (level, sent) => {
    const command = speakerVolume(SPEAKER, level);
    expect(command).toEqual({
      domain: 'media_player',
      service: 'volume_set',
      data: {entity_id: 'media_player.kitchen_speaker', volume_level: sent},
      holds: ['media_player.kitchen_speaker:vol'],
    });
    // a negative zero would print as "-0" in a log line and compare unequal to 0 under Object.is
    expect(Object.is((command.data as {volume_level: number}).volume_level, -0)).toBe(false);
  });
});

describe('scenes and modes', () => {
  test('a scene holds that it ran and says it by name', () => {
    expect(runScene('scene.movie_night', 'Movie night')).toEqual({
      domain: 'scene',
      service: 'turn_on',
      data: {entity_id: 'scene.movie_night'},
      holds: ['scene.movie_night:ran'],
      done: {key: 'media.sceneOn', values: {name: 'Movie night'}},
    });
  });

  test.each([
    [true, 'turn_on', 'media.modeOn'],
    [false, 'turn_off', 'media.modeOff'],
  ] as const)('a mode set to %s', (on, service, key) => {
    expect(setMode('input_boolean.kids_bedtime', on, 'Kids bedtime')).toEqual({
      domain: 'input_boolean',
      service,
      data: {entity_id: 'input_boolean.kids_bedtime'},
      holds: ['input_boolean.kids_bedtime:on'],
      done: {key, values: {name: 'Kids bedtime'}},
    });
  });
});
