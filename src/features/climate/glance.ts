// glance: the Climate tile of the Home pane, the rooms' mean temperature, how many heat and what the heat pump does (spec 24, #267).
// Pattern: a pure reader over the store (a view model, Meszaros' humble object's other half); the legacy `renderHome`'s rule, deleted in #268.
// Must not: read the clock, import the DOM, Lit, the shell or another feature, or hold text the household reads (a catalog key says it).
import {DASH} from '../../core/figures.ts';
import {temperature} from '../../core/i18n/format.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {registriesOf} from '../../core/registry.ts';
import {heatPump} from '../../providers/heat-pump.ts';
import {powerNow} from '../../providers/power.ts';
import {sum} from '../../providers/power-history.ts';
import type {GlanceStore, GlanceView} from '../../ui/glance.ts';
import {hasClimate} from './inputs.ts';
import {DETAIL_SHEET} from './sheets.ts';

/** The heat pump's actions the catalog words; another is shown as Home Assistant sends it. */
const ACTIONS = new Set(['heating', 'cooling', 'idle', 'heat', 'cool', 'auto', 'dry', 'fan']);

/** The tile: null for a house with no thermostat and no heat pump, as the Climate tab. */
export function glance({hass, config, t, fmt}: GlanceStore): GlanceView | null {
  if (!hass || !hasClimate(hass.states, config)) return null;
  const {rooms} = powerNow(hass.states, config);
  const temps = rooms.flatMap(room => (room.temperature === null ? [] : [room.temperature]));
  const heating = t('climate.glance.heating', {n: rooms.filter(room => room.heating).length});
  const hp = heatPump(hass.states, registriesOf(hass), config);
  const action = hp?.action || hp?.mode;
  const kind = !hp?.available ? 'offline' : hp.mode === 'off' ? 'off' : 'other';
  return {
    key: 'climate',
    icon: 'therm',
    color: 'var(--c-heat)',
    label: t('climate.title'),
    value: temps.length ? temperature(fmt, sum(temps) / temps.length) : DASH,
    line: hp
      ? t('climate.glance.lineHp', {
          heating,
          hp: t('climate.glance.hp', {
            kind,
            action: action && ACTIONS.has(action) ? t(`climate.action.${action}` as MessageKey) : (action ?? ''),
          }),
        })
      : t('climate.glance.line', {heating}),
    go: {tab: 'climate', sheet: DETAIL_SHEET},
  };
}
