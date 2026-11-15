// gaugeGeometry: the tablet's temperature bar as positions on its 14 to 30 degree scale, and which caption sits under it.
// Pattern: pure geometry (numbers out, the element places them), as the dial's; the legacy `gauge()` copied rule for rule, scale
// included (deleted in #248).
// Must not: import Lit or the DOM, read state or the clock, or hold a word (the model words the caption from its kind).
/** The scale's ends in degrees (legacy, #248). */
export const GAUGE = {lo: 14, hi: 30} as const;

export interface GaugeGeometry {
  /** The room's temperature, as a percentage from the scale's left end, kept in 0 to 100. */
  now: number;
  /** The setpoint's mark in the same units; null when the thermostat is off or has none. */
  setpoint: number | null;
  /** Under the bar: `setpoint` ("Bar marks the setpoint"), `off` (the 5 degree frost guard) or nothing, when the room has no setpoint. */
  caption: 'setpoint' | 'off' | null;
}

const position = (v: number): number => Math.max(0, Math.min(100, ((v - GAUGE.lo) / (GAUGE.hi - GAUGE.lo)) * 100));

/**
 * The bar at a temperature `t` and a setpoint `sp`; null without a reading, as the legacy gauge drew nothing. A setpoint under the
 * scale's low end is the thermostat off, even where it is not at the frost guard, as the legacy caption said.
 */
export function gaugeGeometry(t: number | null, sp: number | null | undefined): GaugeGeometry | null {
  if (t === null) return null;
  const marked = sp != null && sp >= GAUGE.lo;
  return {
    now: position(t),
    setpoint: marked ? position(sp) : null,
    caption: marked ? 'setpoint' : sp != null ? 'off' : null,
  };
}
