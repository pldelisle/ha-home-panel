// The Adaptive Lighting strip's geometry: today's colour temperature as a gradient over the local day, the now mark, the sun's marks and the
// hours, every position a percentage of the strip.
// Pattern: layout as pure geometry (the flow layout's and the bars geometry's recipe): numbers and colours in, positions out; the element draws them.
// The rules are the legacy `renderAlBar`'s, whose copy goes with the strip's element (#260).
// Must not: word anything but through `fmt` (the marks' names are the model's), read the clock (`now` is given), the DOM or `hass`.
import {kelvinRGB} from '../../core/color.ts';
import {DAY_MS, HOUR_MS} from '../../core/figures.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import {curveKelvin, type AlCurve} from '../../providers/adaptive-lighting.ts';

/** One of the sun's marks under the strip. */
export interface SunMark {
  kind: 'sunrise' | 'noon' | 'sunset';
  /** `left` in percent, two decimals, clamped to the strip. */
  at: string;
  /** The mark's time, as `fmt.time` writes it. */
  time: string;
}

export interface AlStripLayout {
  /** The gradient's stops, every half-hour of the day: a colour and its place; a night stop mixed 35 percent into the card's colour. */
  stops: string[];
  /** Where now is, in percent. */
  now: string;
  /** Sunrise, noon and sunset, those the day has. */
  marks: SunMark[];
  /** Midnight, 6, noon and 18 as `fmt.hour` writes them, at a quarter of the strip each. */
  hours: {at: string; label: string}[];
}

const HALF_HOURS = 48;
const HALF_HOUR_MS = HOUR_MS / 2;
const NIGHT_MIX = 35;

/** The strip of the local day that holds `now`, drawn from the curve. */
export function alStripLayout(
  curve: AlCurve,
  now: number,
  fmt: Pick<Formatters, 'hourNow' | 'time' | 'hour'>,
): AlStripLayout {
  const {rise, noon, set} = curve.sun;
  const midnight = now - fmt.hourNow(now) * HOUR_MS;
  const isNight = (t: number) => rise === null || set === null || t < rise || t > set;
  const stops = Array.from({length: HALF_HOURS + 1}, (_, i) => {
    const t = midnight + i * HALF_HOUR_MS;
    const colour = kelvinRGB(curveKelvin(curve, t));
    const at = `${((i / HALF_HOURS) * 100).toFixed(1)}%`;
    return `${isNight(t) ? `color-mix(in srgb,${colour} ${NIGHT_MIX}%,var(--card2))` : colour} ${at}`;
  });
  const x = (t: number) => `${Math.max(0, Math.min(100, ((t - midnight) / DAY_MS) * 100)).toFixed(2)}%`;
  const sunMarks: [number | null, SunMark['kind']][] = [
    [rise, 'sunrise'],
    [noon, 'noon'],
    [set, 'sunset'],
  ];
  return {
    stops,
    now: x(now),
    marks: sunMarks
      .filter((m): m is [number, SunMark['kind']] => !!m[0])
      .map(([t, kind]) => ({kind, at: x(t), time: fmt.time(new Date(t))})),
    hours: [0, 6, 12, 18].map(h => ({at: `${(h / 24) * 100}%`, label: fmt.hour(midnight + h * HOUR_MS)})),
  };
}
