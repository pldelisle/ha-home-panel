// The house's lights grouped into areas, the tiles of the Lights tab: light groups own their members, an area listed in `split_light_areas` gives
// one tile per group (or loose light), and the lights with no area share an "Other" tile, last.
// Pattern: a provider over the registries (ADR 0025): it names no integration but turns the entity, device and area registries into generic
// inputs, so the Lights pane, the Home tile and the stack's card (spec 24) read one rule. The rules are
// the legacy `lightAreas`'s first half and its `shortNames`, whose copies go with the sheet (#262), their last legacy reader.
// Must not: word anything (the "Other lights" name is the model's), read the clock, the DOM or `hass` itself, or read a light's state.
import type {HassEntities, Registries} from '../core/hass.ts';
import type {Names} from '../core/i18n/names.ts';
import {fold} from '../core/fold.ts';
import {areaOf} from '../core/registry.ts';
import {attributeOf} from '../core/states.ts';

/** One tile of the Lights tab before its state is read. */
export interface LightArea {
  /** The area's id; a split tile's own group (or light) id; `''` for the Other tile. */
  key: string;
  /** The area the lights sit in; null for the Other tile. */
  areaId: string | null;
  /** The area's display name; `''` for the Other tile, which the model names. */
  area: string;
  /** True for the lights with no area. */
  other: boolean;
  /** The tile's name: the area's, or a split tile's short name; `''` for the whole Other tile. */
  name: string;
  /** The lights this tile switches and dims: the members of its groups and its loose lights. */
  ids: string[];
  /** Every light of the tile's area, a split tile's siblings included: what the Adaptive Lighting match reads (`adaptiveSwitch`). */
  areaLights: string[];
  /** The buttons under it, by name: its light groups and its loose lights. */
  units: string[];
  /** `units`' names without the words they all share (`shortNames`). */
  labels: string[];
}

/** What the grouping reads of the panel config. */
export interface LightAreasConfig {
  /** Areas whose light groups (and loose lights) get a tile each. */
  splitLightAreas: string[];
}

/** A light group carries its members in its `entity_id` attribute. */
const membersOf = (states: HassEntities, id: string): string[] | null => {
  const members = attributeOf(states, id, 'entity_id');
  return Array.isArray(members) ? members.map(String) : null;
};

/** Every light group of the house, in the states' order. */
export const lightGroups = (states: HassEntities): string[] =>
  Object.keys(states).filter(id => id.startsWith('light.') && membersOf(states, id) !== null);

/** A group's area: its own, else the first member's that has one. */
const groupArea = (states: HassEntities, registries: Registries, group: string): string =>
  areaOf(group, registries) || (membersOf(states, group) ?? []).map(m => areaOf(m, registries)).find(Boolean) || '';

/**
 * Drops the leading words every name shares, folded (`Kitchen Island`, `Kitchen Sink` are `Island`, `Sink`); a name is never left empty, and
 * fewer than two names are kept as they are.
 */
export function shortNames(names: string[]): string[] {
  if (names.length < 2) return names;
  const words = names.map(n => n.split(/\s+/));
  let shared = 0;
  while (words.every(w => w.length > shared + 1 && fold(w[shared]) === fold(words[0][shared]))) shared++;
  return words.map(w => w.slice(shared).join(' '));
}

/** The lights of the house as the Lights tab's tiles: areas by name, a split area's tiles together where it sorts, the Other tile last. */
export function lightAreas(
  states: HassEntities,
  registries: Registries,
  names: Names,
  config: LightAreasConfig,
): LightArea[] {
  const all = Object.keys(states).filter(id => id.startsWith('light.'));
  const groups = lightGroups(states);
  // a light in two groups belongs to the first: the group gives the area, its bulbs get the controls
  const owner = new Map<string, string>();
  for (const g of groups) for (const m of membersOf(states, g) ?? []) if (!owner.has(m)) owner.set(m, g);
  const byArea = new Map<string, {ids: string[]; units: string[]}>();
  const slot = (areaId: string) => {
    let entry = byArea.get(areaId);
    if (!entry) byArea.set(areaId, (entry = {ids: [], units: []}));
    return entry;
  };
  for (const g of groups) slot(groupArea(states, registries, g)).units.push(g);
  for (const id of all) {
    const row = registries.entities?.[id];
    // a diagnostic or config light, and a hidden one no group owns, is not the household's to switch
    if (groups.includes(id) || row?.entity_category || (row?.hidden && !owner.has(id))) continue;
    const group = owner.get(id);
    const tile = slot(group ? groupArea(states, registries, group) || areaOf(id, registries) : areaOf(id, registries));
    tile.ids.push(id);
    if (!group) tile.units.push(id);
  }
  const out: LightArea[] = [];
  for (const [areaId, {ids, units}] of byArea) {
    if (!ids.length) continue;
    units.sort((x, y) => names.name(x).localeCompare(names.name(y)));
    const area = areaId ? names.name(areaId) : '';
    const labels = shortNames(units.map(u => names.name(u)));
    const common = {areaId: areaId || null, area, other: !areaId, areaLights: ids};
    if (config.splitLightAreas.includes(areaId) && units.length > 1) {
      units.forEach((unit, k) => {
        const mine = ids.filter(i => (owner.get(i) ?? i) === unit);
        if (mine.length)
          out.push({...common, key: unit, name: labels[k], ids: mine, units: [unit], labels: [labels[k]]});
      });
    } else out.push({...common, key: areaId, name: area, ids, units, labels});
  }
  return out.sort(
    (a, b) => Number(a.other) - Number(b.other) || a.area.localeCompare(b.area) || a.name.localeCompare(b.name),
  );
}
