// glance: the Lights tile of the Home pane, how many lights are on and each lit room's mean brightness (spec 24, #267).
// Pattern: a pure reader over the store (a view model, Meszaros' humble object's other half); the legacy `renderHome`'s rule, deleted in #268.
// Must not: read the clock, import the DOM, Lit, the shell or another feature, or hold text the household reads (a catalog key says it).
import {sum} from '../../providers/power-history.ts';
import {registriesOf} from '../../core/registry.ts';
import {numberAttributeOf} from '../../core/states.ts';
import {lightAreas} from '../../providers/light-areas.ts';
import type {GlanceStore, GlanceView} from '../../ui/glance.ts';

/** Home Assistant's brightness runs to 255: a percent is a 2.55th of it. */
const PER_PERCENT = 2.55;

/** The tile: always there, since a house with no lights says "All off". Null only before the first states. */
export function glance({hass, config, names, t}: GlanceStore): GlanceView | null {
  if (!hass) return null;
  const lit = lightAreas(hass.states, registriesOf(hass), names, config)
    .map(area => ({area, on: area.ids.filter(id => hass.states[id]?.state === 'on')}))
    .filter(({on}) => on.length > 0);
  const count = sum(lit.map(({on}) => on.length));
  return {
    key: 'lights',
    icon: 'bulb',
    color: 'var(--warn)',
    label: t('lights.title'),
    value: count ? t('lights.glance.on', {n: count}) : t('lights.glance.allOff'),
    line: count
      ? lit
          .map(({area, on}) =>
            t('lights.glance.room', {
              name: area.name || t('lights.otherLights'),
              percent: Math.round(
                sum(on.map(id => numberAttributeOf(hass.states, id, 'brightness') ?? 0)) / on.length / PER_PERCENT,
              ),
            }),
          )
          .join(' · ')
      : t('lights.glance.nothingOn'),
    go: {tab: 'lights'},
  };
}
