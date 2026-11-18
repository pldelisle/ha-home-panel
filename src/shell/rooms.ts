// The room rules: which rooms the house has, in what order, and how the `tab` setting names a room (ADR 0039).
// Pattern: a pure function over the registry's descriptors (Fowler, PoEAA, Plugin): the shell asks each subject only for the areas it has tiles
// in (`room.areas`), never what the tiles are (ADR 0017); the route is a string with a prefix, as the `tab` setting already is a string.
// Its one memo, the collator of each locale tag, is pure: it only saves building one on every change of the house.
// Must not: read an entity or the DOM, draw, or know which subject fills a room: the descriptors answer.
import type {FeatureDescriptor, FeatureEnv, FeatureKey} from '../ui/feature.ts';
import type {Names} from '../core/i18n/names.ts';
import {roomIcon, type Room} from './room.ts';
import {visibleTab} from './features.ts';

export {roomIcon, type Room}; // defined in room.ts, which the Home pane imports: this module imports the registry, which imports the pane

/** What the `tab` setting names: a section of the panel (not yet checked against the registry), or a room by its area id. */
export type View = {kind: 'feature'; key: string} | {kind: 'room'; areaId: string};

/** What is shown once the house has answered: a section the house shows, or a room that has tiles. */
export type ShownView = {kind: 'feature'; key: FeatureKey} | {kind: 'room'; areaId: string};

const PREFIX = 'room:';

// roomList runs on every change of the house, so each locale's collator is built once
const collators = new Map<string, Intl.Collator>();
const collatorOf = (locale: string): Intl.Collator => {
  let collator = collators.get(locale);
  if (!collator) collators.set(locale, (collator = new Intl.Collator(locale)));
  return collator;
};

/** The colour of a room's icon and header: Home's, which is the house's own and no subject's. */
export const roomColor = (features: readonly FeatureDescriptor[]): string =>
  features.find(f => f.key === 'home')?.color ?? 'var(--c-grid)';

/** The `tab` setting's value for a room. */
export const roomTab = (areaId: string): string => `${PREFIX}${areaId}`;

/** Reads a `tab` setting: `room:<area_id>` is a room, anything else a section. */
export function parseView(tab: string): View {
  return tab.startsWith(PREFIX) && tab.length > PREFIX.length
    ? {kind: 'room', areaId: tab.slice(PREFIX.length)}
    : {kind: 'feature', key: tab};
}

/** The subjects with tiles in the room, in registry order: those with a room part that the house shows and that list the area. */
export const subjectsOf = (
  features: readonly FeatureDescriptor[],
  env: FeatureEnv,
  areaId: string,
): FeatureDescriptor[] =>
  features.filter(f => f.room && f.available?.(env) !== false && f.room.areas(env).includes(areaId));

/**
 * The rooms of the house: every area some shown subject lists in `room.areas`, once, named by the resolver and sorted by that name with the
 * locale's collation (accents and case do not decide, as a person reads a list). An area no subject lists is not a room.
 */
export function roomList(
  features: readonly FeatureDescriptor[],
  env: FeatureEnv,
  names: Pick<Names, 'name'>,
  locale: string,
): Room[] {
  const areas = new Set<string>();
  for (const f of features) {
    if (!f.room || f.available?.(env) === false) continue;
    for (const id of f.room.areas(env)) if (id) areas.add(id);
  }
  const collator = collatorOf(locale);
  return [...areas]
    .map(areaId => ({areaId, name: names.name(areaId)}))
    .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.areaId, b.areaId));
}

/**
 * The view to show: the room asked for when it still has tiles, the section asked for when the house shows it; Home otherwise (a hidden
 * section, an unknown one, a room that went away), as `visibleTab` does for a section alone.
 */
export function visibleView(
  tab: string,
  shown: Readonly<Partial<Record<FeatureKey, boolean>>>,
  rooms: readonly Room[],
): ShownView {
  const view = parseView(tab);
  if (view.kind === 'room') return rooms.some(r => r.areaId === view.areaId) ? view : {kind: 'feature', key: 'home'};
  return {kind: 'feature', key: visibleTab(view.key, shown)};
}
