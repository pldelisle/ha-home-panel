// speakers: the media players that are speakers, each with its area and the name it goes by in that room.
// Pattern: a pure rule over states and registries (Bernhardt, functional core); generic, so it sits in the feature and not in a
// provider: the two platforms it leaves out have their own controls (a camera's speaker, the television).
// `NOT_SPEAKERS` and the name rule copy the legacy `speakers()`, which the Media move of #220 deletes.
// Must not: read the DOM, the clock or `hass` itself, reorder the players (the baselines depend on the house's order) or hold text for the household.
import type {HassEntities, Registries} from '../../core/hass.ts';
import type {Names} from '../../core/i18n/names.ts';
import {areaOf, isHidden} from '../../core/registry.ts';

/** A speaker as the pane lists it, before its state is read. */
export interface Speaker {
  /** `media_player.*`. */
  id: string;
  /** The area it sits in; never empty, a player with no area is not listed. */
  areaId: string;
  /** Its name without the words of its area. */
  name: string;
}

/** Platforms whose players are not speakers for this list: a camera's speaker and a television have controls of their own. */
const NOT_SPEAKERS = ['unifiprotect', 'samsungtv'];

/** Case and accents do not matter to a match. */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The words of a name, folded; a possessive's `'s` is not part of a word (`Mom's` is `Mom`). */
const words = (text: string): string[] =>
  fold(text)
    .replace(/'s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Every visible player that is not the television (`tvId`, null when there is none) and sits in an area, in the house's order. */
export function speakers(states: HassEntities, registries: Registries, names: Names, tvId: string | null): Speaker[] {
  return Object.keys(states)
    .filter(
      id =>
        id.startsWith('media_player.') &&
        id !== tvId &&
        !isHidden(id, registries) &&
        !NOT_SPEAKERS.includes(registries.entities?.[id]?.platform ?? ''),
    )
    .map(id => ({id, areaId: areaOf(id, registries)}))
    .filter(({areaId}) => areaId)
    .map(({id, areaId}) => {
      // the area's name as Home Assistant gives it and as the panel shows it: the words of both are the ones to drop
      const area = registries.areas?.[areaId]?.name ?? '';
      const drop = new Set([...words(area), ...words(area ? names.name(areaId) : '')]);
      const full = names.name(id);
      // "HomePod mini Kitchen" in the Kitchen is just "HomePod mini"
      const short = full
        .split(/\s+/)
        .filter(word => !drop.has(words(word)[0]))
        .join(' ');
      return {id, areaId, name: short || full};
    });
}
