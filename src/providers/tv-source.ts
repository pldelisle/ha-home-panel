// The television port: what a TV source must answer (`TvSource`), the generic inputs it fills (`TvInputs`) and what the sources share.
// Pattern: strategy (Gamma et al., Design Patterns), one interface and two adapters; each adapter is an anti-corruption layer
// (Evans). A set with no name of its own is worded by a catalog key (`defaultName`) that the model translates; the TV and
// wake-button rules copy the legacy panel's `tv()` and `tvBox` until the Media move that deletes them (#220).
// Must not: import an adapter, a feature or the DOM, call the catalog (the model does), or read the clock.
import type {HassEntities, Registries} from '../core/hass.ts';
import type {MessageKey} from '../core/i18n/en.ts';
import type {Names} from '../core/i18n/names.ts';
import {areaOf, isHidden} from '../core/registry.ts';
import {isAvailable, textAttributeOf} from '../core/states.ts';

export interface TvInputs {
  /** `media_player.*`. */
  id: string;
  /** The name the household gave the device, through the resolver; null when it gave none (the model words `defaultName`). */
  name: string | null;
  /** The catalog message that names a set with no name of its own: `tv.name ?? t(tv.defaultName)`. */
  defaultName: MessageKey;
  areaId: string | null;
  /** The `button.*` to press when turning the set on fails; null when the house has none. */
  wakeButton: string | null;
  /** `on` is any state but `off`. */
  state: 'off' | 'on' | 'unavailable';
  /** The input, as the card shows it: everything from a dash on dropped, a full-width ampersand made plain. */
  source: string | null;
  muted: boolean;
}

export interface TvSource {
  /** `samsung-tv`, `tv-entity`. */
  readonly name: string;
  /** The players this source would pick, in preference order; the first source with any wins. */
  candidates(states: HassEntities, registries: Registries): string[];
  read(id: string, states: HassEntities, registries: Registries, names: Names): TvInputs;
}

/** The visible media players that say they are a television, in the order the house lists them. */
export function visibleTvs(states: HassEntities, registries: Registries): string[] {
  return Object.keys(states).filter(
    id => id.startsWith('media_player.') && states[id].attributes.device_class === 'tv' && !isHidden(id, registries),
  );
}

/** The first `button.wake_on_lan_*` whose name mentions a TV: a rule-feeding read of `friendly_name`. */
const wakeButtonOf = (states: HassEntities): string | null =>
  Object.keys(states).find(
    id => id.startsWith('button.wake_on_lan_') && /tv/i.test(textAttributeOf(states, id, 'friendly_name') ?? ''),
  ) ?? null;

/** The input as the card shows it: what a dash opens is the app's detail, and Home Assistant writes `＆` full width. */
const cleanSource = (source: unknown): string | null =>
  typeof source === 'string' ? source.replace(/\s+[-–].*$/, '').replace(/＆/g, '&') : null;

/**
 * What every source reads the same way. `fallbackName` is the name a set whose device the household did not name goes by
 * in this source's integration, or null; it is a function so the resolver is asked only then.
 */
export function readSet(
  id: string,
  states: HassEntities,
  registries: Registries,
  names: Names,
  fallbackName: () => string | null,
): Omit<TvInputs, 'defaultName'> {
  const deviceId = registries.entities?.[id]?.device_id ?? '';
  const device = registries.devices?.[deviceId];
  const state = states[id];
  return {
    id,
    name: device?.name_by_user ? names.name(deviceId) : fallbackName(),
    areaId: areaOf(id, registries) || null,
    wakeButton: wakeButtonOf(states),
    state: !isAvailable(state) ? 'unavailable' : state.state === 'off' ? 'off' : 'on',
    source: cleanSource(state.attributes.source),
    muted: !!state.attributes.is_volume_muted,
  };
}
