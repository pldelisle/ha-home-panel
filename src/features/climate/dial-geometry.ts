// dialGeometry and dialValueFromPointer: the phone's thermostat dial as geometry, and the pointer's way back to a setpoint.
// Pattern: pure geometry (a layout returns numbers and path data, the element places them with `svg` templates), as `flowLayout`
// and `waterChart` do for Energy; the legacy `dial()` and `dialValue()` copied number for number, constants included (deleted in #248).
// Must not: import Lit or the DOM, read state or the clock, or hold a word or a formatted number (the model words "Off" and the figures from `off` and `shown`).
import {OFF_AT_OR_BELOW} from '../../providers/power.ts';

/** The dial's drawing, in the legacy constants: a 270 degree track opening downwards, 55 ticks and every sixth one long (legacy, #248). */
const DIAL = {radius: 106, start: 135, sweep: 270, ticks: 55, majorEvery: 6} as const;
/** The drawing's side, the legacy `viewBox`. */
export const DIAL_SIZE = 260;
/** A tick starts this far in from the track, and ends this far in when short or long (legacy, #248). */
const TICK_FROM = 17;
const TICK_TO_SHORT = 12;
const TICK_TO_LONG = 9;
/** A setpoint arc shorter than this many degrees is not drawn. */
const MIN_ARC = 0.5;
const HALF_TURN = 180;
const FULL_TURN = 360;
/** Measured round from the start, the angles past the end of the track: the pointer there is below the dial. */
const DEAD_ZONE_START = 270;
/** In the dead zone, past this angle the pointer is nearer the start than the end. */
const DEAD_ZONE_MIDDLE = 315;

export interface DialGeometry {
  /** SVG path data of the whole 270 degree track. */
  track: string;
  /** The coloured arc from the start to the setpoint; null while the setpoint is off, unknown, or at the start. */
  active: string | null;
  ticks: {x1: number; y1: number; x2: number; y2: number; major: boolean}[];
  /** The dot at the room's temperature; null without a reading. */
  now: {cx: number; cy: number} | null;
  /** The setpoint's knob (at the start when off); null while the setpoint is unknown (`undefined`, still loading). */
  knob: {cx: number; cy: number} | null;
  /** The setpoint the knob stands for, `lo` while the thermostat is off; null while the setpoint is unknown, when the centre shows the temperature. The model words it. */
  shown: number | null;
  /** The thermostat is off: a setpoint of `null`, or at or below the frost guard. */
  off: boolean;
}

/** A coordinate as the legacy string wrote it: one decimal. */
const tenth = (n: number): number => +n.toFixed(1);

/**
 * The dial at a temperature `t` and a setpoint `sp`, on a scale from `lo` to `hi`. Three setpoints are distinct: a number is on
 * (or off, at the frost guard or below), `null` is off, `undefined` is not loaded yet, so the dial has no knob.
 */
export function dialGeometry(
  t: number | null,
  sp: number | null | undefined,
  lo: number,
  hi: number,
  size = DIAL_SIZE,
): DialGeometry {
  const {radius, start, sweep} = DIAL;
  const centre = size / 2;
  const clamp = (v: number) => Math.max(lo, Math.min(hi, v));
  const degrees = (v: number) => start + ((clamp(v) - lo) / (hi - lo)) * sweep;
  const point = (angle: number, r: number = radius): [number, number] => [
    centre + r * Math.cos((angle * Math.PI) / HALF_TURN),
    centre + r * Math.sin((angle * Math.PI) / HALF_TURN),
  ];
  const arc = (from: number, to: number): string | null => {
    if (to - from < MIN_ARC) return null;
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${radius} ${radius} 0 ${to - from > HALF_TURN ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const spot = (v: number) => {
    const [x, y] = point(degrees(v));
    return {cx: tenth(x), cy: tenth(y)};
  };
  // not loaded is not off: the legacy `off` was true there too, but only the house reads it, and its dial is not editable
  const off = sp === null || (sp !== undefined && sp <= OFF_AT_OR_BELOW);
  const shown = sp === undefined ? null : off ? lo : clamp(sp);
  return {
    track: arc(start, start + sweep) as string,
    active: shown === null || off ? null : arc(start, degrees(shown)),
    ticks: Array.from({length: DIAL.ticks}, (_, i) => {
      const angle = start + (i * sweep) / (DIAL.ticks - 1);
      const major = i % DIAL.majorEvery === 0;
      const [x1, y1] = point(angle, radius - TICK_FROM);
      const [x2, y2] = point(angle, radius - (major ? TICK_TO_LONG : TICK_TO_SHORT));
      return {x1: tenth(x1), y1: tenth(y1), x2: tenth(x2), y2: tenth(y2), major};
    }),
    now: t === null ? null : spot(t),
    knob: shown === null ? null : spot(shown),
    shown,
    off,
  };
}

/**
 * The setpoint under a pointer: the angle from the centre of `rect` (the dial's drawing), measured round from the start and
 * snapped to half degrees. A value at or below the frost guard is `'off'`. The quarter turn below the dial has no value of its
 * own: the pointer there reads as the end it is nearer to, as the legacy dial did.
 */
export function dialValueFromPointer(
  rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>,
  x: number,
  y: number,
  lo: number,
  hi: number,
): number | 'off' {
  const {start, sweep} = DIAL;
  const pointer = Math.atan2(y - (rect.top + rect.height / 2), x - (rect.left + rect.width / 2));
  let angle = ((pointer * HALF_TURN) / Math.PI - start + 2 * FULL_TURN) % FULL_TURN;
  if (angle > DEAD_ZONE_START) angle = angle > DEAD_ZONE_MIDDLE ? 0 : sweep;
  const value = Math.round((lo + (angle / sweep) * (hi - lo)) * 2) / 2;
  return value <= OFF_AT_OR_BELOW ? 'off' : value;
}
