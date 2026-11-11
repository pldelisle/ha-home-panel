// The Media commands: what a tap asks Home Assistant for, as `Command` data, and the typed names of the values it holds meanwhile.
// Pattern: Command (Gamma et al.) built by pure functions; the kit's `CommandRunner` sends them, an element holds the value
// each `holds` key names in the panel's overlay store (ADR 0023). The legacy `tvCmd`, `phoneCmd`, `runScene` and `mpVol`
// are the rules copied here, until the Media move of #220 deletes them.
// Must not: send anything, read the store or the clock, or word a string (`done` is a catalog key, the runner words it).
import type {Speaker} from './speakers.ts';
import type {Command} from '../../ui/commands.ts';
import type {TvInputs} from '../../providers/tv-source.ts';

/** The overlay keys, one function per held value: a typo is a compile error, and two kinds of value never share a key. */
export const K = {
  /** The television's, a routine's: on or off. */
  on: (id: string) => `${id}:on`,
  mute: (id: string) => `${id}:mute`,
  /** A speaker's state: `playing` or `paused`. */
  state: (id: string) => `${id}:st`,
  /** A speaker's volume, from 0 to 1. */
  volume: (id: string) => `${id}:vol`,
  /** A scene that was just run. */
  ran: (id: string) => `${id}:ran`,
} as const;

/** The panel's held values as an element reads them (`OptimisticController.read`, `OverlayStore.read`): `key`'s held value, else `current`. */
export type Overlay = <T>(key: string, current: T) => T;

/** How long a scene shows as run: the legacy panel's "Done" for four seconds. */
export const SCENE_RAN_MS = 4000;

const player = (service: string, id: string, data: Record<string, unknown> = {}): Command => ({
  domain: 'media_player',
  service,
  data: {entity_id: id, ...data},
});

/** Turns the television on, with a second try by its wake-on-LAN button when the house has one, or off. */
export function tvPower(tv: Pick<TvInputs, 'id' | 'wakeButton'>, on: boolean): Command {
  const held = [K.on(tv.id)];
  if (!on) return {...player('turn_off', tv.id), holds: held, done: {key: 'media.tvTurnedOff'}};
  const turnOn: Command = {...player('turn_on', tv.id), holds: held, done: {key: 'media.tvTurningOn'}};
  return tv.wakeButton
    ? {...turnOn, fallback: {domain: 'button', service: 'press', data: {entity_id: tv.wakeButton}}}
    : turnOn;
}

export const tvVolume = (tv: Pick<TvInputs, 'id'>, direction: 'up' | 'down'): Command =>
  player(direction === 'up' ? 'volume_up' : 'volume_down', tv.id);

export const tvMute = (tv: Pick<TvInputs, 'id'>, muted: boolean): Command => ({
  ...player('volume_mute', tv.id, {is_volume_muted: muted}),
  holds: [K.mute(tv.id)],
});

export const tvPlayPause = (tv: Pick<TvInputs, 'id'>): Command => player('media_play_pause', tv.id);

/** Plays or pauses a speaker, and says which one. */
export const speakerPlayPause = (speaker: Pick<Speaker, 'id' | 'name'>, play: boolean): Command => ({
  ...player(play ? 'media_play' : 'media_pause', speaker.id),
  holds: [K.state(speaker.id)],
  done: {key: play ? 'media.speakerPlaying' : 'media.speakerPaused', values: {name: speaker.name}},
});

export const speakerSkip = (speaker: Pick<Speaker, 'id'>, direction: 'next' | 'previous'): Command =>
  player(direction === 'next' ? 'media_next_track' : 'media_previous_track', speaker.id);

/** A volume as a player takes it: kept in 0 to 1 and to two decimals, as the legacy `mpVol`; Math.max(0, …) turns a -0 into 0. */
export const volumeLevel = (level: number): number => Math.min(1, Math.max(0, Math.round(level * 100) / 100));

/** Sets a speaker's volume at `volumeLevel(level)`; silent, the element debounces it. */
export const speakerVolume = (speaker: Pick<Speaker, 'id'>, level: number): Command => ({
  ...player('volume_set', speaker.id, {volume_level: volumeLevel(level)}),
  holds: [K.volume(speaker.id)],
});

export const runScene = (id: string, name: string): Command => ({
  domain: 'scene',
  service: 'turn_on',
  data: {entity_id: id},
  holds: [K.ran(id)],
  done: {key: 'media.sceneOn', values: {name}},
});

/** Turns a routine (a mode of the config) on or off. */
export const setMode = (id: string, on: boolean, name: string): Command => ({
  domain: 'input_boolean',
  service: on ? 'turn_on' : 'turn_off',
  data: {entity_id: id},
  holds: [K.on(id)],
  done: {key: on ? 'media.modeOn' : 'media.modeOff', values: {name}},
});
