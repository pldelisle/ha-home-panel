// readMedia: the television and the speakers of the house, read into the inputs the model takes; `TV_SOURCES` and `findTv`.
// Pattern: a composition of strategies (Gamma et al.): the television from the TV sources in list order, the speakers from
// the generic rule, each speaker's state read beside it; the README of this folder names the order. The adapter lists sit
// here and not in the providers so a provider never imports its siblings (the weather precedent).
// Must not: know an integration (that is a source), format a string for the household, read the clock, or touch the DOM or `hass`.
import type {HassEntities, Registries} from '../../core/hass.ts';
import type {Names} from '../../core/i18n/names.ts';
import {isAvailable, numberAttributeOf, textAttributeOf} from '../../core/states.ts';
import {samsungTvSource} from '../../providers/samsung-tv.ts';
import {tvEntitySource} from '../../providers/tv-entity.ts';
import type {TvInputs, TvSource} from '../../providers/tv-source.ts';
import {speakers, type Speaker} from './speakers.ts';

/** The sources in the order they are tried: Samsung's platform first, as the legacy panel did, then any television. */
export const TV_SOURCES: readonly TvSource[] = [samsungTvSource, tvEntitySource];

/** The television of the house: what the first source that has a candidate reads of its first candidate, or null. */
export function findTv(
  states: HassEntities,
  registries: Registries,
  names: Names,
  sources: readonly TvSource[] = TV_SOURCES,
): TvInputs | null {
  for (const source of sources) {
    const [id] = source.candidates(states, registries);
    if (id !== undefined) return source.read(id, states, registries, names);
  }
  return null;
}

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
  names: Names,
  sources: readonly TvSource[] = TV_SOURCES,
): MediaInputs {
  const tv = findTv(states, registries, names, sources);
  return {
    tv,
    speakers: speakers(states, registries, names, tv?.id ?? null).map(speaker => ({
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
