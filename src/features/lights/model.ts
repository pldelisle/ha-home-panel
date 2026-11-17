// lightsModel and sheetModel: the tiles, the strip, the pane's line and a room's sheet as the Lights elements place them, from the inputs.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it words every message through `deps.t` and every time
// through `deps.fmt`, and takes the clock, the sun, the screen and who is looking as `deps`. Each rule is the legacy panel's (`renderLights`,
// `lightSub`, `renderAlBar`, `renderPaneSubs`' Lights line, `renderLightSheet`, `lightPicker`), whose copies went with #260 and #262.
// Must not: import the DOM, Lit or the shell, read the clock or `hass`, or hold text the household reads (a catalog key says it).
import {kelvinRGB} from '../../core/color.ts';
import {joined} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import {alCurve, curveKelvin, type AlCurve} from '../../providers/adaptive-lighting.ts';
import {alStripLayout} from './al-strip-layout.ts';
import type {AdaptiveReading, LightsInputs, LightTile, SwitchReading} from './inputs.ts';

export interface LightsDeps {
  t: Translate;
  fmt: Pick<Formatters, 'hourNow' | 'time' | 'hour'>;
  now: number;
  /** Today's sun at the house, for the strip. */
  sun: AlCurve['sun'];
  /** The phone's layout: a tile's line leaves out the colour temperature, and the strip's marks their names. */
  compact: boolean;
  /** Arrange is on: the pane's line says how to drag. */
  editing: boolean;
  /** Only an admin may arrange the tiles or link rooms (Home Assistant refuses anyone else's system-data write). */
  isAdmin: boolean;
}

export interface TileView {
  key: string;
  name: string;
  /** The line under the name, short on a phone. */
  sub: string;
  /** The tile's accessible name: the name, the full line and the partner. */
  label: string;
  /** The bulb's accessible name. */
  bulbLabel: string;
  on: boolean;
  available: boolean;
  /** The colour of the lit lights, `''` when none is on. */
  tint: string;
  /** The partner's name, when the room is linked. */
  linkedWith: string | null;
  /** The pair block's place: the first tile opens the block, the second closes it; null outside a pair. */
  pair: 'first' | 'second' | null;
  /** The pair block's colour, from both tiles' lit lights; set on the first tile only. */
  pairTint: string;
}

export interface StripView {
  title: string;
  /**
   * The right-hand line in three pieces, because the kelvin is drawn bold between them (`Now **3800 K** · on everywhere`): `now` and `kelvin` are
   * null while every switch is off, and `state` is then `Off everywhere`.
   */
  right: {now: string | null; kelvin: string | null; state: string};
  stops: string[];
  now: string;
  marks: {at: string; text: string}[];
  hours: {at: string; label: string}[];
}

export interface LightsViewModel {
  /** The pane header's line. */
  summary: string;
  /** The card's title and its right-hand words; `empty` when the house has no light. */
  card: {title: string; right: string; empty: boolean};
  /** The phone's line where the tiles would be, when the house has no light. */
  emptyHint: string | null;
  allOff: {show: boolean; count: number; label: string};
  tiles: TileView[];
  strip: StripView | null;
  /** The header's two buttons: Arrange (an admin's, with two units or more) and Reset order (while arranging a saved order). */
  arrange: {show: boolean; editing: boolean; canReset: boolean; label: string; resetLabel: string};
}

/** How many of the house's Adaptive Lighting switches are on. */
type HowMany = 'all' | 'some' | 'none';
const howMany = ({on, switches}: AdaptiveReading): HowMany => (on === switches ? 'all' : on ? 'some' : 'none');
/** The words for each, in the pane's line and on the strip. */
const ON_WORDS: Record<'pane' | 'strip', Record<HowMany, MessageKey>> = {
  pane: {all: 'lights.alEverywhere', some: 'lights.alSome', none: 'lights.alNowhere'},
  strip: {all: 'lights.onEverywhere', some: 'lights.onIn', none: 'lights.offEverywhere'},
};

/** A tile's name: the Other tile's is the catalog's. */
const nameOf = (tile: LightTile, t: Translate) => tile.name || t('lights.otherLights');

/** The line under a tile's name: Unavailable, Off, or how many are on, the brightness, then the mode, else the colour temperature (not `short`). */
function tileSub(tile: LightTile, t: Translate, short: boolean): string {
  const {state, mode, ids} = tile;
  if (!state.avail) return t('lights.unavailable');
  if (!state.any) return t('lights.off');
  return joined(
    state.on.length < ids.length ? t('lights.someOn', {on: String(state.on.length), total: String(ids.length)}) : '',
    t('lights.percent', {n: String(state.br)}),
    mode.mode ? t('lights.mode', {mode: mode.mode}) : state.k && !short ? t('lights.kelvin', {k: String(state.k)}) : '',
  );
}

/** A linked tile's partner. */
const partnerOf = (tile: LightTile, tiles: LightTile[]) =>
  tile.link ? (tiles.find(o => o.key === tile.link!.other) ?? null) : null;

function tileView(tile: LightTile, tiles: LightTile[], deps: LightsDeps): TileView {
  const {t} = deps;
  const partner = partnerOf(tile, tiles);
  const name = nameOf(tile, t);
  const full = tileSub(tile, t, false);
  const linkedWith = partner ? nameOf(partner, t) : null;
  return {
    key: tile.key,
    name,
    sub: deps.compact ? tileSub(tile, t, true) : full,
    label: linkedWith
      ? t('lights.tileLabelLinked', {name, sub: full, partner: linkedWith})
      : t('lights.tileLabel', {name, sub: full}),
    bulbLabel: t('lights.areaLights', {name}),
    on: tile.state.any,
    available: tile.state.avail,
    tint: tile.state.tint,
    linkedWith,
    pair: tile.link ? (tile.link.first ? 'first' : 'second') : null,
    pairTint: tile.pairTint,
  };
}

/** The pane: its line, the card's words, the tiles, the strip and the Arrange bar. */
export function lightsModel(inputs: LightsInputs, deps: LightsDeps): LightsViewModel {
  const {t} = deps;
  const {tiles, adaptive} = inputs;
  const lit = tiles.reduce((n, tile) => n + tile.state.on.length, 0);
  const lightsOn = t('lights.lightsOn', {n: lit});
  const alLine = !adaptive
    ? ''
    : t(ON_WORDS.pane[howMany(adaptive)], {on: String(adaptive.on), total: String(adaptive.switches)});
  const units = tiles.filter(tile => !tile.link || tile.link.first).length;
  return {
    summary: deps.editing ? t('lights.dragHint') : joined(lit ? lightsOn : t('lights.allLightsOff'), alLine),
    card: {
      title: t('lights.title'),
      right: !tiles.length ? t('lights.noLights') : lit ? lightsOn : t('lights.allOff'),
      empty: !tiles.length,
    },
    emptyHint: tiles.length ? null : t('lights.noLightsHint'),
    allOff: {show: lit > 0, count: lit, label: t('lights.allOff')},
    tiles: tiles.map(tile => tileView(tile, tiles, deps)),
    strip: stripView(inputs, deps),
    arrange: {
      show: deps.isAdmin && units >= 2,
      editing: deps.editing,
      canReset: deps.editing && inputs.order.length > 0,
      label: t(deps.editing ? 'lights.done' : 'lights.arrange'),
      resetLabel: t('lights.resetOrder'),
    },
  };
}

/** The strip, while a tile has an Adaptive Lighting switch: today's curve, now, the sun and the hours, and how many switches are on. */
function stripView({adaptive}: LightsInputs, deps: LightsDeps): StripView | null {
  const curve = adaptive && alCurve(adaptive.configurations, deps.sun);
  if (!adaptive || !curve) return null;
  const {t} = deps;
  const layout = alStripLayout(curve, deps.now, deps.fmt);
  const nowK = Math.round(adaptive.liveK ?? curveKelvin(curve, deps.now));
  return {
    title: t('lights.adaptiveToday'),
    right: {
      now: adaptive.on ? t('lights.now') : null,
      kelvin: adaptive.on ? t('lights.kelvin', {k: String(nowK)}) : null,
      state: t(ON_WORDS.strip[howMany(adaptive)], {on: String(adaptive.on), total: String(adaptive.switches)}),
    },
    stops: layout.stops,
    now: layout.now,
    marks: layout.marks.map(m => ({
      at: m.at,
      text: deps.compact ? m.time : t('lights.sunMark', {kind: m.kind, time: m.time}),
    })),
    hours: layout.hours,
  };
}

export interface SliderView {
  /** The slider's accessible name. */
  name: string;
  value: number;
  min: number;
  max: number;
  /** The big value under the pill. */
  text: string;
  /** The small word under it. */
  label: string;
  /** The slider's `aria-valuetext`. */
  valueText: string;
  disabled: boolean;
}

export interface SheetSwitchView extends SwitchReading {
  label: string;
  desc: string;
}

export interface SheetView {
  key: string;
  title: string;
  sub: string;
  power: {on: boolean; available: boolean; label: string; tint: string};
  brightness: SliderView & {off: boolean};
  colour: (SliderView & {night: boolean; warm: string; mid: string; cool: string}) | null;
  modes: {auto: SheetSwitchView; night: SheetSwitchView | null} | null;
  bulbs: {label: string; chips: (SwitchReading & {label: string})[]} | null;
  link: {show: boolean; enabled: boolean; label: string; desc: string; value: string};
  picker: {
    title: string;
    back: string;
    options: {key: string; name: string; sub: string; nowWith: string; checked: boolean}[];
    foot: string;
  };
}

/** The colour pill's words for a colour temperature: warm to 3000 K, cool from 5000 K, neutral between. */
const tone = (k: number) => (k <= 3000 ? 'warm' : k >= 5000 ? 'cool' : 'neutral');

/** The room's sheet, for the tile `key`; null when the tile is gone (the sheet closes). */
export function sheetModel(
  key: string,
  inputs: LightsInputs,
  deps: Pick<LightsDeps, 't' | 'isAdmin'>,
): SheetView | null {
  const {t} = deps;
  const {tiles} = inputs;
  const tile = tiles.find(x => x.key === key);
  if (!tile) return null;
  const {state, mode} = tile;
  const name = nameOf(tile, t);
  const partner = partnerOf(tile, tiles);
  const brightness = state.any ? state.br : 0;
  const brightText = state.any ? t('lights.percent', {n: String(brightness)}) : t('lights.off');
  const ct = state.ct;
  const night = mode.nightOn && mode.alOn;
  const kelvinText = ct ? (night ? t('lights.night') : t('lights.kelvin', {k: String(ct.k)})) : '';
  return {
    key,
    title: name,
    sub: tileSub(tile, t, false),
    power: {on: state.any, available: state.avail, label: t('lights.areaLights', {name}), tint: state.tint},
    brightness: {
      name: t('lights.brightness'),
      value: brightness,
      min: 0,
      max: 100,
      off: !state.any,
      text: brightText,
      label: t('lights.brightness'),
      valueText: brightText,
      disabled: !state.avail,
    },
    colour: ct && {
      name: t('lights.colourTemperature'),
      value: ct.k,
      min: ct.min,
      max: ct.max,
      night,
      text: kelvinText,
      label: night ? t('lights.nightLook') : t('lights.white', {tone: tone(ct.k)}),
      valueText: kelvinText,
      disabled: !(state.any && state.avail),
      warm: kelvinRGB(ct.min),
      mid: kelvinRGB((ct.min + ct.max) / 2),
      cool: kelvinRGB(ct.max),
    },
    modes: tile.auto && {
      auto: {...tile.auto, on: mode.auto, label: t('lights.auto'), desc: t('lights.autoDesc')},
      night: tile.night && {...tile.night, on: night, label: t('lights.night'), desc: t('lights.nightDesc')},
    },
    bulbs:
      tile.units.length > 1
        ? {label: t('lights.bulbs'), chips: tile.bulbs.map((bulb, k) => ({...bulb, label: tile.labels[k]}))}
        : null,
    link: {
      show: tiles.length >= 2,
      enabled: deps.isAdmin,
      label: t('lights.linkedWith'),
      desc: deps.isAdmin ? t('lights.linkedDesc') : t('lights.adminOnly'),
      value: partner ? nameOf(partner, t) : t('lights.none'),
    },
    picker: {
      title: t('lights.linkWith'),
      back: name,
      options: [
        {key: '', name: t('lights.none'), sub: t('lights.noneDesc'), nowWith: '', checked: !partner},
        ...tiles
          .filter(other => other.key !== key)
          .map(other => {
            const elsewhere = other.link && other.link.other !== key ? partnerOf(other, tiles) : null;
            return {
              key: other.key,
              name: nameOf(other, t),
              sub: tileSub(other, t, false),
              nowWith: elsewhere ? t('lights.nowWith', {name: nameOf(elsewhere, t)}) : '',
              checked: partner?.key === other.key,
            };
          }),
      ],
      foot: t('lights.linkFoot'),
    },
  };
}
