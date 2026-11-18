// glance: the Car tile of the Home pane, the charge with the range, the plug and the locks (spec 24, #267).
// Pattern: a pure reader over the store (a view model, Meszaros' humble object's other half); the legacy `renderHome`'s rule, deleted in #268.
// Must not: read the clock, import the DOM, Lit, the shell or another feature, or hold text the household reads (a catalog key says it).
import {percent} from '../../core/i18n/format.ts';
import {findCar, readCar} from '../../providers/fordpass.ts';
import type {GlanceStore, GlanceView} from '../../ui/glance.ts';
import {DETAIL_SHEET} from './sheets.ts';

/** The tile: null for a house with no FordPass car, as the Car tab. */
export function glance({hass, config, names, t, fmt}: GlanceStore): GlanceView | null {
  const ref = hass && findCar(hass.states);
  if (!hass || !ref) return null;
  const car = readCar(hass.states, config, names, ref);
  return {
    key: 'car',
    icon: 'car',
    color: 'var(--c-ev)',
    label: t('car.title'),
    // the catalog's percent (a narrow no-break space in French) round the whole figure every tab shows
    value: t('car.percent', {n: percent(fmt, car.soc)}),
    line: [
      car.range === null ? '' : t('car.glance.range', {n: Math.round(car.range)}),
      t(car.charging ? 'car.state.charging' : car.plugged ? 'car.state.pluggedIn' : 'car.state.unplugged'),
      car.locked === null ? '' : t(car.locked ? 'car.state.locked' : 'car.state.unlocked'),
    ]
      .filter(Boolean)
      .join(' · '),
    charging: car.charging,
    go: {tab: 'car', sheet: DETAIL_SHEET},
  };
}
