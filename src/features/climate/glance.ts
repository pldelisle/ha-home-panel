// glance: the Climate tile of the Home pane, the rooms' mean temperature, how many heat and what the heat pump does (spec 24, #267).
// Pattern: a pure reader over the store (a view model, Meszaros' humble object's other half); the legacy `renderHome`'s rule.
// Must not: read the clock, import the DOM, Lit, the shell or another feature, or hold text the household reads (a catalog key says it).
import {DASH} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {isAvailable, textAttributeOf} from '../../core/states.ts';
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
  const id = config.entities.hp;
  const hp = id ? hass.states[id] : undefined;
  const action = hp && (textAttributeOf(hass.states, id, 'hvac_action') || hp.state);
  const kind = !isAvailable(hp) ? 'offline' : hp.state === 'off' ? 'off' : 'other';
  return {
    key: 'climate',
    icon: 'therm',
    color: 'var(--c-heat)',
    label: t('climate.title'),
    value: temps.length ? `${fmt.fixed(sum(temps) / temps.length, 1)}°` : DASH,
    line: id
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
