// Adaptive Lighting: which of its switches runs an area's lights, what mode the area is in (Auto, Night, by hand), and today's colour curve.
// Pattern: a provider (ADR 0025) naming the integration's quirks where they live: the switch's entity naming, its `configured_lights` (hidden
// unless `include_config_in_attributes` is on), `manual_control` and the `_sleep_mode` twin; the rules are the legacy `alFor` and `lightMode`.
// Must not: word anything, read the clock, the DOM or `hass` itself, or send a command (the feature's commands do).
import type {SunTimes} from '../core/sun.ts';
import type {HassEntities, PanelHass, Registries} from '../core/hass.ts';
import {fold} from '../core/fold.ts';
import {areaOf} from '../core/registry.ts';
import {lightGroups, type LightArea} from './light-areas.ts';

/** Who is in charge of an area's lights. */
export interface AlMode {
  /** The area's Adaptive Lighting switch is on. */
  alOn: boolean;
  /** The switch's sleep-mode twin, when the house has it. */
  nightSwitch: string | null;
  nightOn: boolean;
  /** Adaptive Lighting is on but one of the area's lights was set by hand (`manual_control`). */
  manual: boolean;
  /** Adaptive Lighting is on and none of the lights was set by hand. */
  auto: boolean;
  /** Night when the sleep mode and the switch are on, Auto, Manual when the area has a switch, else `''`. */
  mode: 'Night' | 'Auto' | 'Manual' | '';
}

/** Today's curve of the colour temperature, as Adaptive Lighting draws it: the warmest and coolest kelvin, and the sun's times. */
export interface AlCurve {
  minK: number;
  maxK: number;
  sun: Pick<SunTimes, 'rise' | 'noon' | 'set'>;
}

const DEFAULT_MIN_K = 2000;
const DEFAULT_MAX_K = 5500;

/** The integration's main switches: `switch.adaptive_lighting_<name>`, without the sleep-mode, colour and brightness twins. */
export const alSwitches = (states: HassEntities): string[] =>
  Object.keys(states).filter(
    id => /^switch\.adaptive_lighting_/.test(id) && !/_(sleep_mode|adapt_color|adapt_brightness)$/.test(id),
  );

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const isOn = (states: HassEntities, id: string | null): boolean => !!id && states[id]?.state === 'on';

/** The lights a switch runs: `configured_lights`, else the `lights` of its `configuration`, each group with its members. */
const runs = (states: HassEntities, id: string): string[] => {
  const attributes = states[id].attributes;
  const lights = Array.isArray(attributes.configured_lights)
    ? list(attributes.configured_lights)
    : list(record(attributes.configuration).lights);
  return lights.flatMap(l => [l, ...list(states[l]?.attributes.entity_id)]);
};

/** The instance's name, folded: the switch's name without "Adaptive Lighting:". */
const instanceName = (states: HassEntities, id: string): string =>
  fold(String(states[id].attributes.friendly_name ?? '').replace(/^Adaptive Lighting:\s*/i, ''));

/**
 * The switch that runs an area's lights, by four rules, each winning over the next: a switch whose lights include one of the area's; the one the
 * config's `adaptive_lighting_areas` names for the area; a switch in the area; a switch whose instance name is in the name of a light group the
 * registry places in the area. Null when none matches.
 */
export function adaptiveSwitch(
  area: Pick<LightArea, 'areaId' | 'areaLights'>,
  states: HassEntities,
  registries: Registries,
  alAreas: Record<string, string>,
): string | null {
  const switches = alSwitches(states);
  const areaId = area.areaId ?? '';
  const named = alAreas[areaId];
  // the group's own area here, not its members': the legacy rule, kept
  const groups = () => lightGroups(states).filter(g => areaOf(g, registries) === areaId);
  return (
    switches.find(s => runs(states, s).some(l => area.areaLights.includes(l))) ??
    (named ? switches.find(s => s === named) : undefined) ??
    switches.find(s => areaId && areaOf(s, registries) === areaId) ??
    switches.find(s => {
      const name = instanceName(states, s);
      return !!name && groups().some(g => fold(String(states[g].attributes.friendly_name ?? '')).includes(name));
    }) ??
    null
  );
}

/** Who is in charge of the area's lights, given its switch (null when it has none). */
export function alMode(area: Pick<LightArea, 'ids' | 'units'>, switchId: string | null, states: HassEntities): AlMode {
  const alOn = isOn(states, switchId);
  const nightSwitch = switchId && states[`${switchId}_sleep_mode`] ? `${switchId}_sleep_mode` : null;
  const nightOn = isOn(states, nightSwitch);
  const manual =
    alOn && list(states[switchId!].attributes.manual_control).some(l => area.ids.includes(l) || area.units.includes(l));
  const auto = alOn && !manual;
  return {
    alOn,
    nightSwitch,
    nightOn,
    manual,
    auto,
    mode: nightOn && alOn ? 'Night' : auto ? 'Auto' : switchId ? 'Manual' : '',
  };
}

/** Today's curve from the `configuration` attributes of one switch or more: the lowest `min_color_temp` and the highest `max_color_temp` (2000 and 5500 K where unset). */
export function alCurve(configurations: unknown[], sun: AlCurve['sun']): AlCurve {
  const configs = configurations.map(record);
  return {
    minK: Math.min(...configs.map(c => Number(c.min_color_temp) || DEFAULT_MIN_K)),
    maxK: Math.max(...configs.map(c => Number(c.max_color_temp) || DEFAULT_MAX_K)),
    sun: {rise: sun.rise, noon: sun.noon, set: sun.set},
  };
}

/**
 * The colour temperature the curve gives at `t`: the coolest at solar noon, falling as a parabola to the warmest at sunrise and sunset, the warmest
 * all night (and all day where the sun does not rise).
 */
export function curveKelvin({minK, maxK, sun}: AlCurve, t: number): number {
  if (sun.rise === null || sun.set === null || t < sun.rise || t > sun.set) return minK;
  const k = t < sun.noon ? (t - sun.noon) / (sun.noon - sun.rise) : (t - sun.noon) / (sun.set - sun.noon);
  return minK + (maxK - minK) * Math.max(0, 1 - k * k);
}

/** Whether the house can take lights off Auto without switching Adaptive Lighting off: the integration's services are there. */
export const hasManualControlService = (services: PanelHass['services']): boolean => !!services?.adaptive_lighting;
