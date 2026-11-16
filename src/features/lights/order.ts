// The Lights tab's arrangement: which rooms are linked, a linked pair drawn side by side, and the order an admin saved for every screen.
// Pattern: pure functions over plain data (Bernhardt, functional core); the rules are the second half of the legacy `lightAreas` and its
// `lightLinkList`, whose copies go with the sheet (#262). The saved order and links arrive as Home Assistant's frontend system data, read by the pane.
// Must not: read the clock, the DOM or `hass` itself, write the system data, or drop a tile (a key nobody knows sorts last).
import type {LightLink} from '../../core/config.ts';
import type {HassEntities} from '../../core/hass.ts';
import type {LightArea} from '../../providers/light-areas.ts';

/** A tile's partner when its room is linked: the other tile's key, and whether this one is drawn first. */
export interface TileLink {
  other: string;
  first: boolean;
}

/** What linking and ordering read of a tile. */
export type Arrangeable = Pick<LightArea, 'key' | 'units' | 'ids'>;

/**
 * The pairs of linked rooms: the system data's `light_links` once someone has picked in a sheet (every pair of two, as strings), else the
 * config's `light_links`, a pair with a switch counting while its switch is on.
 */
export function linkPairs(systemData: unknown, configLinks: LightLink[], states: HassEntities): string[][] {
  const saved = (systemData as {light_links?: unknown} | null | undefined)?.light_links;
  if (Array.isArray(saved))
    return saved.filter((p): p is unknown[] => Array.isArray(p) && p.length === 2).map(p => p.map(String));
  return configLinks
    .filter(l => l.keys.length === 2 && (!l.sw || states[l.sw]?.state === 'on'))
    .map(l => l.keys.map(String));
}

/**
 * The tiles with each pair's second tile moved beside its first and both marked with `link`. A pair's key is a tile's key, else one of its units
 * or lights; a pair naming a missing tile, one tile twice, or a tile already linked is skipped, so a room in two pairs keeps the first.
 */
export function applyLinks<T extends Arrangeable>(tiles: T[], pairs: string[][]): (T & {link: TileLink | null})[] {
  const out = tiles.map(t => ({...t, link: null as TileLink | null}));
  const find = (k: string) => out.find(t => t.key === k) ?? out.find(t => t.units.includes(k) || t.ids.includes(k));
  for (const [first, second] of pairs) {
    const a = find(first);
    const b = find(second);
    if (!a || !b || a === b || a.link || b.link) continue;
    out.splice(out.indexOf(b), 1);
    out.splice(out.indexOf(a) + 1, 0, b);
    a.link = {other: b.key, first: true};
    b.link = {other: a.key, first: false};
  }
  return out;
}

/**
 * The tiles in the saved order (a list of keys): a linked pair moves as one unit under its first tile's key, a tile the order does not name goes
 * after the named ones in its own order, and no order (null, or empty) leaves the tiles as they are.
 */
export function applyOrder<T extends {key: string; link: TileLink | null}>(tiles: T[], order: unknown): T[] {
  if (!Array.isArray(order) || !order.length) return tiles;
  const units: T[][] = [];
  for (const t of tiles) {
    if (!t.link) units.push([t]);
    else if (t.link.first) units.push([t, ...tiles.filter(o => o.key === t.link!.other)]);
  }
  const at = (unit: T[]) => {
    const i = order.indexOf(unit[0].key);
    return i < 0 ? Infinity : i;
  };
  return units
    .map((unit, i) => ({unit, i}))
    .sort((x, y) => at(x.unit) - at(y.unit) || x.i - y.i)
    .flatMap(x => x.unit);
}
