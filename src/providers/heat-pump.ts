// The heat pump (or air conditioner) of the house, read into the inputs the Climate feature takes, and its state history into a line.
// Pattern: an adapter below the features (ADR 0025), the rules of the legacy `hpBrand()` (deleted in #244) and `hpSeries()` (deleted in #246) and of the heat pump's readings and controls (deleted in #248);
// the maker comes from the device registry (Fujitsu through FGLair, else the manufacturer), the entity from the config's `heat_pump`.
// Must not: word anything a person reads (a maker the registry does not give is `null`, for the model to word; a maker's name, `Fujitsu`, is data,
// as the registry's manufacturer is), or read the clock or the DOM.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities, Registries} from '../core/hass.ts';
import type {HistoryPoint} from '../core/ha.ts';
import {attributeOf, isAvailable, numberAttributeOf, textAttributeOf} from '../core/states.ts';

/** The defaults of a unit that does not say its own range. */
const DEFAULT_MIN = 16;
const DEFAULT_MAX = 30;
/** The modes offered when the unit lists none. */
const DEFAULT_MODES = ['off', 'heat'];
/** The modes that have no target to set or to draw: the target's stepper and dial are idle in them, and the history's target line breaks. */
export const NO_TARGET_MODES: ReadonlySet<string> = new Set(['off', 'fan_only', 'dry']);
/** A unit made by Fujitsu, or through FGLair, whose maker the device does not always say. */
const FUJITSU_PLATFORM = /fglair/;
const FUJITSU = /fujitsu/i;
/** The maker's name the provider gives such a unit: data, for the model to compare, not a word. */
export const FUJITSU_BRAND = 'Fujitsu';

export interface HeatPumpInputs {
  /** The config's `heat_pump` entity. */
  id: string;
  /** The entity has a state at all; false when the config names an entity Home Assistant does not know. */
  present: boolean;
  /** `Fujitsu` when the platform is FGLair or the manufacturer says so, else the manufacturer; null when the registry gives none. */
  brand: string | null;
  /** False when the unit is missing, `unavailable` or `unknown`; then every field below reads as the unit's defaults. */
  available: boolean;
  /** The unit's state: `off`, `heat`, `cool`, `auto`, `fan_only`, `dry`; `unavailable` when it is not. */
  mode: string;
  /** `hvac_action`: what the unit is doing now; null when it says nothing. */
  action: string | null;
  /** `current_temperature`. */
  temperature: number | null;
  /** The unit's own setpoint (`temperature`). */
  target: number | null;
  minTemp: number;
  maxTemp: number;
  modes: string[];
  /** Null when the unit has no such setting. */
  fanModes: string[] | null;
  presetModes: string[] | null;
  swingModes: string[] | null;
  /** `swing_horizontal_modes` (Home Assistant 2024.12): the side-to-side louvers set on their own; null when the unit sets them only through `swing_modes`, or not at all. */
  swingHorizontalModes: string[] | null;
  fan: string | null;
  preset: string | null;
  swing: string | null;
  swingHorizontal: string | null;
  /** When Home Assistant last saw the unit change, in milliseconds; null without a state. */
  lastUpdated: number | null;
}

/** A list attribute of text, or null when it is missing or not a list. */
function listAttributeOf(states: HassEntities, id: string, name: string): string[] | null {
  const value = attributeOf(states, id, name);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : null;
}

/** The unit's maker, from its device: FGLair's units are Fujitsu's. */
function brandOf(id: string, {entities, devices}: Registries): string | null {
  const entry = entities?.[id];
  const device = entry?.device_id ? devices?.[entry.device_id] : undefined;
  const manufacturer = device?.manufacturer || '';
  return FUJITSU_PLATFORM.test(entry?.platform || '') || FUJITSU.test(manufacturer)
    ? FUJITSU_BRAND
    : manufacturer || null;
}

/** The heat pump at these states; null when the config has none. */
export function heatPump(
  states: HassEntities,
  registries: Registries,
  config: Pick<ResolvedConfig, 'entities'>,
): HeatPumpInputs | null {
  const id = config.entities.hp;
  if (!id) return null;
  const unit = states[id];
  const available = isAvailable(unit);
  // an unavailable unit keeps no attributes the panel trusts: its range and settings are the defaults
  const read: HassEntities = available ? states : {};
  const stamp = unit ? Date.parse(unit.last_updated) : NaN;
  return {
    id,
    present: unit !== undefined,
    brand: brandOf(id, registries),
    available,
    mode: unit?.state ?? 'unavailable',
    action: textAttributeOf(read, id, 'hvac_action'),
    temperature: numberAttributeOf(read, id, 'current_temperature'),
    target: numberAttributeOf(read, id, 'temperature'),
    minTemp: numberAttributeOf(read, id, 'min_temp') ?? DEFAULT_MIN,
    maxTemp: numberAttributeOf(read, id, 'max_temp') ?? DEFAULT_MAX,
    modes: listAttributeOf(read, id, 'hvac_modes') ?? DEFAULT_MODES,
    fanModes: listAttributeOf(read, id, 'fan_modes'),
    presetModes: listAttributeOf(read, id, 'preset_modes'),
    swingModes: listAttributeOf(read, id, 'swing_modes'),
    swingHorizontalModes: listAttributeOf(read, id, 'swing_horizontal_modes'),
    fan: textAttributeOf(read, id, 'fan_mode'),
    preset: textAttributeOf(read, id, 'preset_mode'),
    swing: textAttributeOf(read, id, 'swing_mode'),
    swingHorizontal: textAttributeOf(read, id, 'swing_horizontal_mode'),
    lastUpdated: Number.isNaN(stamp) ? null : stamp,
  };
}

/**
 * The unit's state history as a line of `[time, value]`: `pick` reads a value from a point's attributes and state. A point
 * the unit was unavailable at, or that has no value, is a `null` that breaks the line, and the value before it carries on
 * to one millisecond before the next, so a gap shows as a gap and a step as a step. Read by the Climate history's derivation for the
 * heat pump's temperature and setpoint lines.
 */
export function hpSeries(
  points: readonly HistoryPoint[],
  pick: (attributes: Record<string, unknown>, state: string) => number | null | undefined,
): [number, number | null][] {
  const line: [number, number | null][] = [];
  let previous: number | null = null;
  for (const point of points) {
    const time = point.lastUpdated;
    const value = point.state === 'unavailable' ? null : pick(point.attributes ?? {}, point.state);
    if (value == null) {
      if (line.length) line.push([time, null]);
      previous = null;
    } else {
      if (previous !== null) line.push([time - 1, previous]);
      line.push([time, value]);
      previous = value;
    }
  }
  return line;
}
