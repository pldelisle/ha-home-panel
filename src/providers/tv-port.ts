// The TV port's types (`TvSource`, `TvInputs`, `TvNaming`) and what its two adapters read the same way: the visible
// televisions and a set's area, name, state, input and volume flag.
// Pattern: strategy (Gamma et al.), the interface the adapters implement and the helper they share, kept apart from the list
// (`tv-source.ts`) so the list can import the adapters without a cycle; an anti-corruption layer (Evans) for the generic reads.
// Must not: pick a television (`findTv` does), read the wake button (Samsung's rule) or hold a string the household reads.
import type {HassEntities, Registries} from '../core/hass.ts';
import {isAvailable} from '../core/states.ts';
import type {Names} from '../core/i18n/names.ts';
import type {Messages} from '../core/i18n/messages.ts';

export interface TvInputs {
  /** `media_player.*`. */
  id: string;
  /** The device's own name through the resolver, else the source's default. */
  name: string;
  areaId: string | null;
  /** The `button.*` to press when turning the set on fails; null when the set has none. */
  wakeButton: string | null;
  /** `on` is any state but `off`. */
  state: 'off' | 'on' | 'unavailable';
  /** The input, as the card shows it: everything from a dash on dropped, a full-width ampersand made plain. */
  source: string | null;
  muted: boolean;
}

/** What a source needs to word a set: the name resolver and the catalog (the legacy panel's `name()` and its Samsung literal). */
export interface TvNaming {
  names: Names;
  t: Messages['t'];
}

export interface TvSource {
  /** `samsung-tv`, `tv-entity`. */
  readonly name: string;
  /** The players this source would pick, in preference order; the first source with any wins. */
  candidates(states: HassEntities, registries: Registries): string[];
  read(id: string, states: HassEntities, registries: Registries, naming: TvNaming): TvInputs;
}

/** The visible media players that say they are a television, in the order the house lists them. */
export function visibleTvs(states: HassEntities, registries: Registries): string[] {
  return Object.keys(states).filter(
    id =>
      id.startsWith('media_player.') &&
      states[id].attributes.device_class === 'tv' &&
      !registries.entities?.[id]?.hidden,
  );
}

/** The input as the card shows it: what a dash opens is the app's detail, and Home Assistant writes `＆` full width. */
const cleanSource = (source: unknown): string | null =>
  typeof source === 'string' ? source.replace(/\s+[-–].*$/, '').replace(/＆/g, '&') : null;

/**
 * A set read without its wake button. `fallbackName` is the name the source gives a set whose device the household did not
 * name; it is a function so the catalog or the resolver is asked only then.
 */
export function readSet(
  id: string,
  states: HassEntities,
  registries: Registries,
  {names}: TvNaming,
  fallbackName: () => string,
): Omit<TvInputs, 'wakeButton'> {
  const entry = registries.entities?.[id];
  const deviceId = entry?.device_id ?? '';
  const device = registries.devices?.[deviceId];
  const state = states[id];
  return {
    id,
    name: device?.name_by_user ? names.name(deviceId) : fallbackName(),
    areaId: entry?.area_id || device?.area_id || null,
    state: !isAvailable(state) ? 'unavailable' : state.state === 'off' ? 'off' : 'on',
    source: cleanSource(state.attributes.source),
    muted: !!state.attributes.is_volume_muted,
  };
}
