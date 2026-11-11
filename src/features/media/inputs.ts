// readMedia: the television and the speakers of the house, read into the inputs the model takes.
// Pattern: a composition of two rules (Gamma et al.): the television from the TV sources in list order (`findTv`), the
// speakers from the generic rule, each speaker's state read beside it; the README of this folder names the order.
// Must not: know an integration (that is a source), format a string for the household, read the clock, or touch the DOM or `hass`.
import type {HassEntities, Registries} from '../../core/hass.ts';
import {isAvailable, numberAttributeOf, textAttributeOf} from '../../core/states.ts';
import {TV_SOURCES, findTv, type TvInputs, type TvNaming, type TvSource} from '../../providers/tv-source.ts';
import {speakers, type Speaker} from './speakers.ts';

/** A speaker and what its player says now. */
export interface SpeakerInputs extends Speaker {
  /** Home Assistant's state: `playing`, `paused`, `idle`, `off`, `unavailable`. */
  state: string;
  /** False when the player is `unavailable` or `unknown`. */
  available: boolean;
  /** `supported_features`, a bit field; 0 when the player gives none. */
  features: number;
  title: string | null;
  artist: string | null;
  album: string | null;
  /** The cover, as the player gives its address. */
  picture: string | null;
  /** The volume, from 0 to 1, or null when the player has no volume. */
  volume: number | null;
}

export interface MediaInputs {
  tv: TvInputs | null;
  speakers: SpeakerInputs[];
}

/** The inputs of the house at these states; the television is the first source's candidate and is never a speaker. */
export function readMedia(
  states: HassEntities,
  registries: Registries,
  naming: TvNaming,
  sources: readonly TvSource[] = TV_SOURCES,
): MediaInputs {
  const tv = findTv(states, registries, naming, sources);
  return {
    tv,
    speakers: speakers(states, registries, naming.names, tv?.id ?? null).map(speaker => ({
      ...speaker,
      state: states[speaker.id].state,
      available: isAvailable(states[speaker.id]),
      features: numberAttributeOf(states, speaker.id, 'supported_features') ?? 0,
      title: textAttributeOf(states, speaker.id, 'media_title'),
      artist: textAttributeOf(states, speaker.id, 'media_artist'),
      album: textAttributeOf(states, speaker.id, 'media_album_name'),
      picture: textAttributeOf(states, speaker.id, 'entity_picture'),
      volume: numberAttributeOf(states, speaker.id, 'volume_level'),
    })),
  };
}
