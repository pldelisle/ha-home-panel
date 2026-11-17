// glance: the Air tile of the Home pane, the worst room's level and why (spec 24, #267).
// Pattern: a pure reader over the store (a view model, Meszaros' humble object's other half); the words are the model's `airGlance`,
// the legacy `renderHome`'s rule, which #268 deletes.
// Must not: read the clock, import the DOM, Lit, the shell or another feature, or hold text the household reads (a catalog key says it).
import {registriesOf} from '../../core/registry.ts';
import {milaRooms} from '../../providers/mila.ts';
import type {GlanceStore, GlanceView} from '../../ui/glance.ts';
import {airGlance} from './model.ts';
import {DETAIL_SHEET} from './sheets.ts';

/** The tile: null for a house with no purifier. */
export function glance({hass, names, t, fmt}: GlanceStore): GlanceView | null {
  const words = hass && airGlance(milaRooms(hass.states, registriesOf(hass), names), {t, fmt});
  if (!words) return null;
  return {
    key: 'air',
    icon: 'aq',
    color: 'var(--ok)',
    label: t('air.title'),
    ...words,
    go: {tab: 'air', sheet: DETAIL_SHEET},
  };
}
