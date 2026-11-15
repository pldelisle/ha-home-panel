// flowLayout: the live power flow as geometry: the nodes' centres and radii, the connectors' widths and dash durations, and every text.
// Pattern: pure geometry (a layout function returns numbers and texts, the element places them with `svg` templates; Climate's dial and Car's battery
// follow), the legacy `flowSvg` copied number for number (deleted in #241); the powers come from `powerNow`, and each word and figure through `t` and `fmt`.
// Must not: import Lit or the DOM, read the clock, state or the registry, or hold a word a person reads (a catalog key says it).
import {DASH} from '../../core/figures.ts';
import {whole, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {PowerNow} from '../../providers/power.ts';

/** A load over this many kW is flowing: the node is lit, the connector's dashes run (the legacy flow's own threshold). */
export const LIVE_KW = 0.02;
/** A tank at or over this many degrees reads "hot". */
const HOT_C = 48;
/** Under this many kW a power is written in watts. */
const WATTS_BELOW_KW = 1;
/** The drawing's own coordinates, which the element's `viewBox` repeats. */
const WIDTH = 440;
const HEIGHT = 340;

/** A text of the drawing: `big` is a figure, `cap` a caption, `st` a small line; `size` overrides the class's font size. */
export interface FlowText {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
  kind: 'big' | 'cap' | 'st';
  size?: number;
}

/** A ring and the figures inside it; `color` is a token, drawn only while `on` (the ring is `var(--ring)` otherwise). */
export interface FlowNode {
  key: 'grid' | 'home' | 'water' | 'heat' | 'ev';
  cx: number;
  cy: number;
  r: number;
  strokeWidth: number;
  color: string;
  on: boolean;
  texts: FlowText[];
}

/** A line between two nodes; `duration` is the dash animation's, a stable string so a redraw with the same power keeps the attribute and the animation does not restart. */
export interface FlowConnector {
  key: 'grid' | 'heat' | 'water' | 'ev';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  on: boolean;
  width: number;
  duration: string | null;
}

export interface FlowGeometry {
  width: number;
  height: number;
  /** The screen reader's sentence for the whole drawing. */
  label: string;
  connectors: FlowConnector[];
  /** The ring that pulses round the charger while it charges; null when it does not. */
  pulse: {cx: number; cy: number; r: number; color: string} | null;
  nodes: FlowNode[];
  /** The captions and the rest-of-home figure, outside the rings. */
  labels: FlowText[];
}

export interface FlowDeps {
  t: Translate;
  fmt: Formatters;
  /** The tank's temperature, written under the water heater's figure when it is idle and in its "hot" word; null when it reads nothing. */
  waterTemperature: number | null;
  /** The charger's own status text; null when it is unavailable or unset. */
  chargerStatus: string | null;
}

/** The dash's speed and thickness grow with the power on the line. */
const widthOf = (kw: number): number => +(3 + Math.min(2, kw / 2)).toFixed(1);
const durationOf = (kw: number): string => `${Math.max(0.45, 2.4 - kw * 0.4).toFixed(2)}s`;

export function flowLayout(power: PowerNow, {t, fmt, waterTemperature, chargerStatus}: FlowDeps): FlowGeometry {
  const {grid, heat, rest} = power;
  // the legacy flow read an absent water heater or charger as zero, and an absent grid as nothing
  const water = power.waterHeater ?? 0;
  const ev = power.ev ?? 0;
  const roomsOn = power.rooms.filter(room => room.heating).length;

  const watts = (kw: number | null): string =>
    kw === null ? DASH : kw < WATTS_BELOW_KW ? t('energy.watts', {n: whole(fmt, kw * 1000)}) : fmt.fixed(kw, 2);
  const text = (
    x: number,
    y: number,
    words: string,
    kind: FlowText['kind'],
    anchor: FlowText['anchor'] = 'start',
    size?: number,
  ): FlowText => ({x, y, text: words, anchor, kind, ...(size === undefined ? {} : {size})});
  const lit = (kw: number | null): boolean => (kw ?? 0) > LIVE_KW;

  const connector = (
    key: FlowConnector['key'],
    color: string,
    [x1, y1, x2, y2]: [number, number, number, number],
    reading: number | null,
  ): FlowConnector => {
    const kw = reading ?? 0;
    const on = kw > LIVE_KW;
    return {key, x1, y1, x2, y2, color, on, width: on ? widthOf(kw) : 3, duration: on ? durationOf(kw) : null};
  };

  /** A ring with its figure: the unit `kW` under a power of a kilowatt or more, else the `sub` line when there is one. */
  const node = (
    key: FlowNode['key'],
    [cx, cy, r]: [number, number, number],
    kw: number | null,
    color: string,
    on: boolean,
    sub = '',
  ): FlowNode => {
    const unit = kw !== null && kw >= WATTS_BELOW_KW;
    const texts = [text(cx, cy + (unit ? -2 : 6), watts(kw), 'big', 'middle', r > 41 ? 20 : 18)];
    if (unit) texts.push(text(cx, cy + 16, 'kW', 'st', 'middle'));
    else if (sub) texts.push(text(cx, cy + 21, sub, 'st', 'middle'));
    return {key, cx, cy, r, strokeWidth: 3, color, on, texts};
  };

  const tank = waterTemperature === null ? '' : `${fmt.fixed(waterTemperature, 1)}°`;
  const waterWord = lit(water) ? t('energy.heating') : t('energy.idle');
  const home: FlowNode = {
    key: 'home',
    cx: 220,
    cy: 160,
    r: 56,
    strokeWidth: 4,
    color: 'var(--c-home)',
    on: true,
    texts: [
      text(220, 158, grid === null ? DASH : fmt.fixed(grid, 2), 'big', 'middle', 28),
      text(220, 178, t('energy.flow.home'), 'st', 'middle'),
    ],
  };

  return {
    width: WIDTH,
    height: HEIGHT,
    label: t('energy.flow.label', {grid: watts(grid), heat: watts(heat), water: watts(water), ev: watts(ev)}),
    connectors: [
      connector('grid', 'var(--c-grid)', [112, 160, 164, 160], grid),
      connector('heat', 'var(--c-heat)', [276, 160, 328, 160], heat),
      connector('water', 'var(--c-wh)', [220, 104, 220, 92], water),
      connector('ev', 'var(--c-ev)', [220, 216, 220, 236], ev),
    ],
    pulse: lit(ev) ? {cx: 220, cy: 276, r: 40, color: 'var(--c-ev)'} : null,
    nodes: [
      node('grid', [70, 160, 42], grid, 'var(--c-grid)', true),
      home,
      node('water', [220, 50, 40], water, 'var(--c-wh)', lit(water), tank),
      node('heat', [370, 160, 42], heat, 'var(--c-heat)', lit(heat)),
      node('ev', [220, 276, 40], ev, 'var(--c-ev)', lit(ev)),
    ],
    labels: [
      text(70, 222, t('energy.flow.grid'), 'cap', 'middle'),
      text(70, 238, lit(grid) ? t('energy.importing') : t('energy.idle'), 'st', 'middle'),
      text(300, 44, t('energy.flow.water'), 'cap'),
      text(
        300,
        60,
        waterTemperature !== null && waterTemperature >= HOT_C ? t('energy.hot', {state: waterWord}) : waterWord,
        'st',
      ),
      text(370, 222, t('energy.flow.heat'), 'cap', 'middle'),
      text(370, 238, t('energy.roomsOn', {on: roomsOn, total: power.rooms.length}), 'st', 'middle'),
      text(300, 272, t('energy.flow.ev'), 'cap'),
      text(300, 288, chargerStatus ?? t('energy.unavailable'), 'st'),
      text(120, 290, t('energy.flow.rest'), 'st', 'end'),
      text(120, 306, rest === null ? DASH : t('energy.kw', {n: fmt.fixed(rest, 2)}), 'big', 'end', 15),
    ],
  };
}
