// What a tile's lights are doing: which are on, whether any answers, the mean brightness, the colour-temperature range and mean, and the tint.
// Pattern: pure functions over plain data (Bernhardt, functional core); the rules are the legacy `lightState` and `lightTint`, whose copies go with
// the sheet (#262), the tile's last legacy reader.
// Must not: word anything (the sub-line is the model's), read the clock, the DOM or `hass` itself.
import {kelvinRGB} from '../../core/color.ts';
import type {HassEntities} from '../../core/hass.ts';
import {isAvailable} from '../../core/states.ts';

/** A tile's colour-temperature range in 50 K steps, and where its lights are on it. */
export interface KelvinRange {
  min: number;
  max: number;
  /** The lit tunable bulbs' mean, else the range's middle, in 50 K steps and clamped to the range. */
  k: number;
  /** True when `k` is the lit bulbs' mean and not the middle. */
  known: boolean;
}

export interface AreaState {
  /** The tile's lights that are on, in its order. */
  on: string[];
  any: boolean;
  /** At least one of its lights has a state that means something. */
  avail: boolean;
  /** The lit lights' mean brightness in percent, at least 1 while one is on; 0 when none is. */
  br: number;
  /** Null when no light is tunable, or when the tunable lights' ranges do not overlap by 50 K. */
  ct: KelvinRange | null;
  /** `ct.k` when it is known, else null. */
  k: number | null;
  /** The colour the lit lights show (`tintOf`), `''` when none is on. */
  tint: string;
  /** Its lights that take a colour temperature (`supported_color_modes` has `color_temp`): the ones a colour command is sent to. */
  tunable: string[];
}

const STEP_K = 50;
const DEFAULT_MIN_K = 2000;
const DEFAULT_MAX_K = 6500;
/** The colour modes whose `rgb_color` is a white Home Assistant computed, not a colour someone picked. */
const WHITE_MODES = ['color_temp', 'white', 'brightness', 'onoff'];

const mean = (values: number[]): number => values.reduce((s, v) => s + v, 0) / values.length;
const numbers = (values: unknown[]): number[] => values.map(Number).filter(v => Number.isFinite(v) && v !== 0);

/** The colour the lights show: the first lit light's `rgb_color` when it is in a colour mode, else its colour temperature as a white; `''` if neither. */
export function tintOf(on: string[], states: HassEntities): string {
  for (const id of on) {
    const {rgb_color: rgb, color_temp_kelvin: kelvin, color_mode: mode} = states[id]?.attributes ?? {};
    if (Array.isArray(rgb) && !WHITE_MODES.includes(String(mode))) return `rgb(${rgb.slice(0, 3).join(',')})`;
    if (kelvin) return kelvinRGB(Number(kelvin));
  }
  return '';
}

/** What the tile's lights are doing. */
export function areaState(area: {ids: string[]}, states: HassEntities): AreaState {
  const attr = (id: string, name: string): unknown => states[id]?.attributes[name];
  const on = area.ids.filter(id => states[id]?.state === 'on');
  const any = on.length > 0;
  const br = any ? Math.max(1, Math.round(mean(on.map(id => Number(attr(id, 'brightness')) || 0)) / 2.55)) : 0;
  const tunable = (id: string) => {
    const modes = attr(id, 'supported_color_modes');
    return Array.isArray(modes) && modes.includes('color_temp');
  };
  const tws = area.ids.filter(tunable);
  let ct: KelvinRange | null = null;
  if (tws.length) {
    const mins = numbers(tws.map(id => attr(id, 'min_color_temp_kelvin')));
    const maxs = numbers(tws.map(id => attr(id, 'max_color_temp_kelvin')));
    const min = Math.ceil((mins.length ? Math.max(...mins) : DEFAULT_MIN_K) / STEP_K) * STEP_K;
    const max = Math.floor((maxs.length ? Math.min(...maxs) : DEFAULT_MAX_K) / STEP_K) * STEP_K;
    const lit = on
      .filter(tunable)
      .map(id => attr(id, 'color_temp_kelvin'))
      .filter(v => v != null)
      .map(Number);
    const k = lit.length ? Math.round(mean(lit) / STEP_K) * STEP_K : Math.round((min + max) / (2 * STEP_K)) * STEP_K;
    if (max > min) ct = {min, max, k: Math.max(min, Math.min(max, k)), known: lit.length > 0};
  }
  return {
    on,
    any,
    avail: area.ids.some(id => isAvailable(states[id])),
    br,
    ct,
    k: ct?.known ? ct.k : null,
    tint: any ? tintOf(on, states) : '',
    tunable: tws,
  };
}
