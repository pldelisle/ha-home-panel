// GlanceView: one at-a-glance tile of the Home pane as data, the shape every feature's `glance` reader returns (spec 24).
// Pattern: a view model shared through the kit (ADR 0017), so a feature types its reader without importing the shell, and
// the shell's one tile element (#268) draws them all alike: six readers, one tile.
// Must not: hold behaviour, import a feature or the shell, or carry markup: every string is already worded.
import type {PanelStore} from '../core/store.ts';
import type {FeatureKey} from './feature.ts';
import type {IconName} from './icons.ts';

/** Where a tile goes: its tab on a tablet, and on a phone the sheet it opens straight away (none: the tab). */
export interface GlanceGo {
  tab: FeatureKey;
  sheet?: string;
}

export interface GlanceView {
  /** The tile's identity, unique among the tiles: the feature's key, `water` for the water heater's. */
  key: string;
  icon: IconName;
  /** The icon's colour, a CSS colour. */
  color: string;
  label: string;
  /** The big figure. */
  value: string;
  /** The line under it. */
  line: string;
  /** The car charges: the tile glows. */
  charging?: boolean;
  go: GlanceGo;
}

/** What a reader reads of the store: the states, the config, the names, and the catalog and formats of the user's language. */
export type GlanceStore = Pick<PanelStore, 'hass' | 'config' | 'names' | 't' | 'fmt'>;
