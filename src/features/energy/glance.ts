// glance and waterGlance: the Energy and Water heater tiles of the Home pane, the grid's power with today's kWh and Hilo's rate,
// and the tank's temperature with its last 24 hours' kWh (spec 24, #267).
// Pattern: pure readers over the store (view models, Meszaros' humble object's other half); the legacy `renderHome`'s rules, deleted in #268. The
// history is the Energy card's loaded slices, given by the caller: a reader never loads.
// Must not: read the clock, load, import the DOM, Lit, the shell or another feature, or hold text the household reads.
import {powerParts, temperature} from '../../core/i18n/format.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {GlanceStore, GlanceView} from '../../ui/glance.ts';
import {LIVE_KW} from './flow-layout.ts';
import {waterCycles, type EnergyHistoryData} from './history.ts';
import {readEnergy} from './inputs.ts';
import {DETAIL_SHEET, WATER_SHEET} from './sheets.ts';

/** What the tiles read of the Energy history, when it is loaded; `now` cuts the water heater's last 24 hours. */
export interface GlanceDeps {
  history: Pick<EnergyHistoryData, 'totals' | 'wh24'> | null;
  now: number;
}

/** A grid power in kW as the tile writes it: watts under a kilowatt, kW above, two significant figures (`powerParts`). */
function wording(kw: number, t: GlanceStore['t'], fmt: GlanceStore['fmt']): string {
  const {n, unit} = powerParts(fmt, kw * 1000);
  return t(unit === 'W' ? 'energy.watts' : 'energy.kw', {n});
}

/** The Energy tile: always there, "No reading" in the line's style while the grid reads nothing. Null only before the first states. */
export function glance({hass, config, names, t, fmt}: GlanceStore, {history}: GlanceDeps): GlanceView | null {
  if (!hass) return null;
  const {power, hilo} = readEnergy(hass.states, config, names);
  const kw = power.grid;
  const rate = t(`energy.rate.${hilo.tier}` as MessageKey);
  return {
    key: 'energy',
    icon: 'bolt',
    color: 'var(--c-grid)',
    label: t('energy.title'),
    value: kw === null ? t('energy.noReading') : wording(kw, t, fmt),
    ...(kw === null ? {missing: true} : {}),
    line: history
      ? t('energy.glance.line', {kwh: fmt.fixed(history.totals.today, 1), rate})
      : t('energy.glance.lineNow', {rate}),
    go: {tab: 'energy', sheet: DETAIL_SHEET},
  };
}

/**
 * The Water heater tile: null for a house with neither of its sensors, unless `evenAbsent` (the tablet's grid, which the legacy panel
 * never hid: "No reading" and "Idle").
 */
export function waterGlance(
  {hass, config, names, t, fmt}: GlanceStore,
  {history, now}: GlanceDeps,
  {evenAbsent = false}: {evenAbsent?: boolean} = {},
): GlanceView | null {
  if (!hass) return null;
  const {water} = readEnergy(hass.states, config, names);
  if (!water.present && !evenAbsent) return null;
  const state = t((water.power ?? 0) > LIVE_KW ? 'energy.heating' : 'energy.idle');
  return {
    key: 'water',
    icon: 'drop',
    color: 'var(--c-wh)',
    label: t('energy.water.title'),
    value: water.temperature === null ? t('energy.noReading') : temperature(fmt, water.temperature),
    ...(water.temperature === null ? {missing: true} : {}),
    line: history
      ? t('energy.glance.water', {state, kwh: fmt.fixed(waterCycles(history.wh24.p, now).kwh24, 1)})
      : state,
    go: {tab: 'energy', sheet: WATER_SHEET},
  };
}

/**
 * The More sheet's word under Energy: the grid's power now, in watts under a kilowatt ("850 W now", "3.24 kW now"), the legacy
 * `moreLines`'s rule (#277). Null while the grid reads nothing.
 */
export function moreWord({hass, config, names, t, fmt}: GlanceStore): string | null {
  if (!hass) return null;
  const kw = readEnergy(hass.states, config, names).power.grid;
  if (kw == null) return null;
  const {n, unit} = powerParts(fmt, kw * 1000);
  return t(unit === 'W' ? 'energy.more.watts' : 'energy.more.kilowatts', {n});
}
