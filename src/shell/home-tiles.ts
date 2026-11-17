// The Home pane's six at-a-glance tiles as data: for each, the ids its tile subscribes to and the feature's reader that words it.
// Pattern: a table of plug-ins (Fowler, PoEAA, Plugin) over each feature's exported `glance` reader (spec 24): the shell imports the
// features, a feature never imports the shell or another feature (ADR 0017); one `<hp-glance-tile>` per row, each on its own ids (ADR 0012).
// Must not: word anything (the readers do), read the clock or load (the pane hands the history), or draw.
import type {PanelStore} from '../core/store.ts';
import {findCar} from '../providers/fordpass.ts';
import {airIds, glance as airGlance} from '../features/air/index.ts';
import {carIds, glance as carGlance} from '../features/car/index.ts';
import {climateIds, glance as climateGlance} from '../features/climate/index.ts';
import {energyIds, glance as energyGlance, waterGlance, type GlanceDeps} from '../features/energy/index.ts';
import {lightIds, glance as lightsGlance} from '../features/lights/index.ts';
import type {GlanceView} from '../ui/glance.ts';

export type {GlanceDeps};

/** What a tile's store must answer: the readers' part, and the registries the Air ids walk. */
export type TileStore = Pick<PanelStore, 'hass' | 'config' | 'names' | 't' | 'fmt'>;

export interface GlanceSource {
  /** The tile's identity, its view's `key`: `repeat` keys the tiles on it. */
  key: string;
  ids(store: TileStore): string[];
  /** The tile's words, or null where the house has nothing for it (the tile is not drawn). */
  read(store: TileStore, deps: GlanceDeps): GlanceView | null;
}

/** The six tiles in the legacy order: Lights, Climate, Car, Energy, Air, Water heater. */
export const GLANCE_SOURCES: readonly GlanceSource[] = [
  {key: 'lights', ids: lightIds, read: lightsGlance},
  {key: 'climate', ids: climateIds, read: climateGlance},
  {key: 'car', ids: store => carIds(store, store.hass ? findCar(store.hass.states) : null), read: carGlance},
  {key: 'energy', ids: energyIds, read: energyGlance},
  {key: 'air', ids: airIds, read: airGlance},
  {key: 'water', ids: energyIds, read: waterGlance},
];

/** The tiles a house shows, in order: what the six tiles draw together. */
export function glanceTiles(store: TileStore, deps: GlanceDeps): GlanceView[] {
  return GLANCE_SOURCES.map(source => source.read(store, deps)).filter((view): view is GlanceView => view !== null);
}
