// waterChartGeometry: the water heater's 24-hour chart as geometry: the temperature line, the power bars, the grid and the hour ticks.
// Pattern: pure geometry (a layout function returns numbers and texts, the element places them with `svg` templates), the legacy `whChart`'s
// scale rules copied number for number (deleted in #241). It was never ApexCharts: two scales on one 320 by 120 canvas, which a library would not draw.
// Must not: import Lit or the DOM, read the clock (`now` is passed in), or hold a word a person reads (a catalog key says it).
import {DAY_MS, HOUR_MS, MINUTE_MS} from '../../core/figures.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {Point} from '../../providers/power-history.ts';

/** The canvas and its margins, in the SVG's own units. */
const WIDTH = 320;
const HEIGHT = 120;
const LEFT = 28;
const RIGHT = 34;
const TOP = 8;
const BOTTOM = 18;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;
/** The temperature axis when no temperature reads, and the least span it shows. */
const NO_READING_RANGE: [number, number] = [45, 55];
const MIN_SPAN = 4;
/** A bar is a five-minute mean, so a day holds this many; a bar is never thinner than the floor. */
const MEANS_PER_DAY = 288;
const MIN_BAR_WIDTH = 1.4;
/** The power axis reaches at least this many kW, and a mean under `MIN_BAR_KW` draws no bar. */
const MIN_POWER_AXIS_KW = 5;
const MIN_BAR_KW = 0.05;
/** A mean covers five minutes: the temperature is drawn at the middle of its bucket, and the bucket that began just before the window still starts the line. */
const BUCKET_MS = 5 * MINUTE_MS;
const HALF_BUCKET_MS = BUCKET_MS / 2;
/** The hours that get a tick and a label. */
const TICK_EVERY_HOURS = 6;

export interface WaterChartText {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
}

export interface WaterChartGeometry {
  width: number;
  height: number;
  /** The screen reader's sentence: the temperature axis's span and what the bars are. */
  label: string;
  /** The three temperature lines (low, middle, high), each with its label at the left. */
  grid: {x1: number; x2: number; y: number; label: WaterChartText}[];
  /** The power axis's two labels, at the right. */
  powerLabels: WaterChartText[];
  /** The ticks under the plot, every six hours, with their labels. */
  ticks: {x: number; y1: number; y2: number; label: WaterChartText}[];
  /** One bar per five-minute mean over `MIN_BAR_KW`; `title` is its tooltip. */
  bars: {x: number; y: number; width: number; height: number; title: string}[];
  /** The path of the temperature line (`M` and `L` commands); null with fewer than two readings. */
  line: string | null;
  /** The last temperature reading, drawn as a dot at the line's end; null with none. */
  dot: {cx: number; cy: number} | null;
}

export interface WaterChartDeps {
  t: Translate;
  fmt: Formatters;
}

/** Rounded to one decimal, as the SVG strings wrote it. */
const tenth = (value: number): number => +value.toFixed(1);

/**
 * The last 24 hours of the tank's temperature and the heater's power, `series` as `waterDay` returns them (five-minute means); null
 * when there is neither a line (two readings) nor a bar to draw. The temperature axis spans the readings plus half a degree, never
 * under four degrees; the power axis spans the largest bar in whole kW, never under five.
 */
export function waterChartGeometry(
  series: {t: readonly Point[]; p: readonly Point[]},
  now: number,
  {t, fmt}: WaterChartDeps,
): WaterChartGeometry | null {
  const start = now - DAY_MS;
  const x = (instant: number): number => LEFT + Math.max(0, Math.min(1, (instant - start) / DAY_MS)) * PLOT_WIDTH;
  const temperatures = series.t.filter(([instant]) => instant >= start - BUCKET_MS);
  const powers = series.p.filter(([instant]) => instant >= start);
  if (temperatures.length < 2 && !powers.length) return null;

  const readings = temperatures.map(([, degrees]) => degrees);
  let [low, high] = readings.length
    ? [Math.floor(Math.min(...readings) - 0.5), Math.ceil(Math.max(...readings) + 0.5)]
    : NO_READING_RANGE;
  if (high - low < MIN_SPAN) {
    low = Math.floor((high + low) / 2 - MIN_SPAN / 2);
    high = low + MIN_SPAN;
  }
  const yTemperature = (degrees: number): number => TOP + ((high - degrees) / (high - low)) * PLOT_HEIGHT;
  const powerMax = Math.max(MIN_POWER_AXIS_KW, Math.ceil(Math.max(0, ...powers.map(([, kw]) => kw))));
  const yPower = (kw: number): number => TOP + PLOT_HEIGHT - (kw / powerMax) * PLOT_HEIGHT;
  const barWidth = Math.max(MIN_BAR_WIDTH, PLOT_WIDTH / MEANS_PER_DAY);

  const ticks: WaterChartGeometry['ticks'] = [];
  for (let hour = Math.ceil(start / HOUR_MS) * HOUR_MS; hour <= now; hour += HOUR_MS) {
    if (fmt.dayParts(hour).h % TICK_EVERY_HOURS === 0)
      ticks.push({
        x: tenth(x(hour)),
        y1: TOP + PLOT_HEIGHT,
        y2: TOP + PLOT_HEIGHT + 3,
        label: {x: x(hour), y: HEIGHT - 4, text: fmt.hour(hour), anchor: 'middle'},
      });
  }

  const points = temperatures.map(([instant, degrees]): [number, number] => [
    x(instant + HALF_BUCKET_MS),
    yTemperature(degrees),
  ]);
  const last = points[points.length - 1];
  return {
    width: WIDTH,
    height: HEIGHT,
    label: t('energy.water.chartLabel', {low: fmt.integer(low), high: fmt.integer(high)}),
    grid: [low, (low + high) / 2, high].map(degrees => ({
      x1: LEFT,
      x2: WIDTH - RIGHT,
      y: tenth(yTemperature(degrees)),
      label: {x: LEFT - 4, y: yTemperature(degrees) + 3, text: `${fmt.number(degrees, 1)}°`, anchor: 'end'},
    })),
    powerLabels: [
      {x: WIDTH - RIGHT + 4, y: TOP + 3, text: t('energy.kw', {n: fmt.integer(powerMax)}), anchor: 'start'},
      {x: WIDTH - RIGHT + 4, y: TOP + PLOT_HEIGHT + 3, text: t('energy.kw', {n: '0'}), anchor: 'start'},
    ],
    ticks,
    bars: powers
      .filter(([, kw]) => kw > MIN_BAR_KW)
      .map(([instant, kw]) => ({
        x: tenth(x(instant)),
        y: tenth(yPower(kw)),
        width: tenth(barWidth),
        height: tenth(TOP + PLOT_HEIGHT - yPower(kw)),
        title: t('energy.water.barTitle', {time: fmt.time(instant), kw: fmt.fixed(kw, 1)}),
      })),
    line: points.length > 1 ? points.map(([px, py], i) => `${i ? 'L' : 'M'}${tenth(px)},${tenth(py)}`).join('') : null,
    dot: last ? {cx: tenth(last[0]), cy: tenth(last[1])} : null,
  };
}
