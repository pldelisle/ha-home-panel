// climateModel: the house, its rooms and the heat pump in, every text, figure and shape the Climate list, the phone's tiles and the detail's head, tiles, note and controls place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no store, words every message through
// `deps.t` and every number through `deps.fmt`, takes a held setpoint or mode from `deps.overlay` (ADR 0023), and delegates the drawings to the pure geometry of
// dial-geometry.ts and gauge-geometry.ts. Each rule is the legacy panel's own (`climateSummary`, `climInfo`, `renderClimateHead`, `renderClimateControls`), which #244 to #248 deleted.
// Must not: import the DOM, Lit or the shell, read the clock, hold text the household reads (a catalog key says it), or decide the frost guard's commands (commands.ts does).
import {capitalWords, DASH} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {degrees, fixedOr} from '../../core/i18n/format.ts';
import {roomName} from '../../core/i18n/room-name.ts';
import {FUJITSU_BRAND, NO_TARGET_MODES, type HeatPumpInputs} from '../../providers/heat-pump.ts';
import {DEFAULT_MAX_TEMP, FROST_GUARD, OFF_AT_OR_BELOW, type RoomPower} from '../../providers/power.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import {RANGES, type Range} from '../../ui/ranges.ts';
import {dialGeometry, type DialGeometry} from './dial-geometry.ts';
import {GAUGE, gaugeGeometry, type GaugeGeometry} from './gauge-geometry.ts';
import type {ClimateInputs} from './inputs.ts';
import {
  actionWord,
  averageTemperature,
  climateItems,
  heatingCount,
  tenthDegrees,
  type ClimateItem,
  type ClimateItemsDeps,
  type Tone,
} from './items.ts';
import {lateHeatPumpStart, RANGE_WORDS, selectedKwh, selectedSeries, type ClimateHistoryData} from './history.ts';
import type {HeatPumpTarget, RoomTarget} from './commands.ts';
import {K} from './keys.ts';

/** What the detail shows: `house`, `hp` or a room's key. A key that names nothing the house has shows the house. */
export type ClimateSelection = string;

/**
 * What the detail's tiles and note read off the loaded history, for the selection over the range shown: the Range tile's span and the Heating
 * tile's kWh (the legacy chart code's `climFigures`), and where the heat pump's line starts when that is late. Null before the load.
 */
interface Figures {
  /** The lowest and highest reading of the selection over the range; null without one. */
  span: {lo: number; hi: number} | null;
  /** The heating over the range: the house's total or the room's own; null for the heat pump. */
  kwh: number | null;
  /** The instant the heat pump's line starts, when that is later than the range does (the recorder keeps about ten days of its history); null for any other selection. */
  hpFrom: number | null;
}

/** One line of a legend: its swatch, a colour as CSS says it (a token, so the theme is the page's), and its name; a dashed one is a dashed stroke. */
export interface LegendItem {
  name: string;
  color: string;
  dashed: boolean;
}

/** Why a chart's place has no chart: the loading word, the failure's, or the empty house's; `kind` picks the paragraph's class. */
export interface ChartNotice {
  kind: 'loading' | 'failed' | 'empty';
  text: string;
}

/** The detail's chart: its legend and the range's words, with what to show in its place until there is a line. */
export interface ChartBlock {
  legend: LegendItem[];
  /** "last 24 hours", at the legend's end. */
  rangeLabel: string;
  /** The line's name, the legend's first. */
  name: string;
  notice: ChartNotice | null;
}

/** The tablet's heatmap block: its words, the rooms in the order it draws them (the last room on top) and what stands in for it. */
export interface HeatmapBlock {
  title: string;
  hint: string;
  rooms: {key: string; name: string}[];
  notice: ChartNotice | null;
}

/** The tablet's outside chart block. */
export interface OutsideBlock {
  title: string;
  note: string;
  legend: LegendItem[];
  notice: ChartNotice | null;
}

/** The range the tiles are named for until the person picks one (the legacy `crange`'s default). */
const DEFAULT_RANGE: Range = 'day';
/** The room's quick setpoints, `off` first: the frost guard is what a tap on it asks for. */
const QUICK: readonly (number | 'off')[] = ['off', 19, 20, 21, 22];

/**
 * The heat pump's settings the catalog words, by what Home Assistant calls them: the modes, the fan speeds and the presets. Any
 * other is shown capitalised, as the legacy `cap()` did (`heat_cool` and `fan_only` are the legacy `HVAC` table's, which said `Auto` and `Fan`).
 */
const SETTING_WORDS: ReadonlyMap<string, MessageKey> = new Map([
  ['off', 'climate.off'],
  ['heat', 'climate.word.heat'],
  ['cool', 'climate.word.cool'],
  ['auto', 'climate.word.auto'],
  ['heat_cool', 'climate.word.auto'],
  ['dry', 'climate.word.dry'],
  ['fan_only', 'climate.word.fan'],
  ['quiet', 'climate.word.quiet'],
  ['low', 'climate.word.low'],
  ['medium', 'climate.word.medium'],
  ['high', 'climate.word.high'],
  ['boost', 'climate.word.boost'],
  ['eco', 'climate.word.eco'],
  ['comfort', 'climate.word.comfort'],
  ['sleep', 'climate.word.sleep'],
  ['diffuse', 'climate.word.diffuse'],
]);
/**
 * The pill's words for a mode standing in for a missing action where they differ from the mode button's: the legacy pill wrote `cap(hp.state)`,
 * "Fan only" and "Heat cool", where the `HVAC` table's button said "Fan" and "Auto"; the layer translated the pill's to "Ventilation" and "Auto".
 */
const PILL_MODE_WORDS: ReadonlyMap<string, MessageKey> = new Map([
  ['fan_only', 'climate.mode.fanOnly'],
  ['heat_cool', 'climate.mode.heatCool'],
]);
/** The louvers' positions the catalog words; `vertical_3` and `horizontal_2` carry their number. */
const SWING_WORDS: ReadonlyMap<string, MessageKey> = new Map([
  ['vertical', 'climate.swing.vertical'],
  ['horizontal', 'climate.swing.horizontal'],
  ['both', 'climate.swing.both'],
  ['off', 'climate.swing.off'],
]);
const SWING_AT: readonly [RegExp, MessageKey][] = [
  [/^vertical_(\d+)$/i, 'climate.swing.verticalAt'],
  [/^horizontal_(\d+)$/i, 'climate.swing.horizontalAt'],
];

export interface ClimateModelDeps extends ClimateItemsDeps {
  /** The held value of a key while a tap awaits Home Assistant, else the current one (`OptimisticController.read`). */
  overlay: Overlay;
  /** The phone: the detail has the dial, not the big number and the gauge. */
  compact: boolean;
  /** The detail's range, which names the Range and Heating tiles; the legacy sheet's own default when it has none. */
  range?: Range;
  /** The loader's last read of the range failed, and there is nothing to draw: the charts say so instead of "Loading history…". */
  historyFailed?: boolean;
}

/** A value with the ends of its scale: a stepper's target, a room's setpoint, the dial's knob between `lo` and `hi`. Not the kit's `Range`, a span of time. */
export interface Bounded<V = number> {
  value: V;
  lo: number;
  hi: number;
}

/** A choice of a radio group or a select: its value as Home Assistant says it, its words, and whether it is the current one. */
export interface ControlOption {
  value: string;
  label: string;
  checked: boolean;
}

/** What the controls draw; the element switches on `kind` and never computes. */
export type ControlsView =
  | {kind: 'hp'; offline: true}
  | {
      kind: 'hp';
      offline?: false;
      /** The unit's entity, which the commands name. */
      id: string;
      /** The mode as shown, a held one included. */
      mode: string;
      modes: ControlOption[];
      /** The target's stepper; null in a mode that has none. A unit that reports no target has one with a null value: the stepper reads a dash, both buttons disabled, as the legacy drew it. */
      target: Bounded<number | null> | null;
      /** Null when the unit is off or has no such setting. */
      fan: ControlOption[] | null;
      preset: ControlOption[] | null;
      swing: ControlOption[] | null;
    }
  /** Every room's thermostat, for "set every room"; the value and the armed button are the controls' own state. */
  | {kind: 'house'; rooms: string[]}
  | {kind: 'room'; offline: true}
  | {
      kind: 'room';
      offline?: false;
      /** The thermostat's entity and the room's name, which the commands and their toasts name. */
      id: string;
      name: string;
      setpoint: Bounded & {off: boolean};
      /** The quick setpoints; `off` is a tap for the frost guard. */
      quick: {value: number | 'off'; label: string; pressed: boolean}[];
    };

/** One tile of the detail: "Range, 24 h", `18.5–23.0` and `°`. */
export interface DetailTile {
  label: string;
  value: string;
  unit: string;
  /** The line under the value: a room's name, "all thermostats"; null for none. */
  sub: string | null;
  /** The Range tile, which the phone gives a row of its own. */
  range: boolean;
}

/** What the dial's setpoint is for: a thermostat or the heat pump; null on the house's dial, which has none to set. */
export type SetpointTarget = ({kind: 'hp'} & HeatPumpTarget) | ({kind: 'room'} & RoomTarget);

export interface DialView {
  /** The setpoint can be moved: the thermostat is on. */
  editable: boolean;
  /** The one a drag or a key sets; null when `editable` is false. */
  target: SetpointTarget | null;
  lo: number;
  hi: number;
  /** The setpoint the knob stands for (`lo` when off); null while it is unknown. */
  value: number | null;
  geometry: DialGeometry;
  /** The centre's text: the setpoint, "Off", or the temperature while the setpoint is unknown. */
  big: string;
  /** Under it: "Now 20.8° · Outside 3.1°". */
  caption: string;
  /** The slider's name, or the image's. */
  label: string;
  /** What a screen reader says of the slider's value: "Off" or "21 degrees"; empty while it is unknown. */
  valueText: string;
}

export interface GaugeView {
  geometry: GaugeGeometry;
  /** The image's description for a screen reader. */
  label: string;
  /** "Now 20.8°", written at the dot. */
  now: string;
  /** Under the bar: "Bar marks the setpoint", the frost guard, or nothing. */
  caption: string;
  /** The scale's ends: "14°" and "30°". */
  lo: string;
  hi: string;
}

export interface ClimateViewModel {
  /** "20.8° average inside · 3.1° outside · 2 rooms heating · heat pump off". */
  summary: string;
  items: ClimateItem[];
  /** The phone's grid: the items, the house's wide. */
  tiles: (ClimateItem & {wide: boolean})[];
  /** What the detail shows: the selection asked for, or the house when the house has nothing under that key. */
  selection: ClimateSelection;
  detail: {
    title: string;
    sub: string;
    pill: {text: string; tone: Tone};
    /** The big number on the tablet, `20.8`, with no unit; null on the phone. */
    temperature: string | null;
    /** "Outside 3.1°" on the tablet; null on the phone, whose dial says it. */
    outside: string | null;
    /** The tablet's bar; null on the phone, or without a reading. */
    gauge: GaugeView | null;
    /** The phone's dial; null on the tablet. */
    dial: DialView | null;
    tiles: DetailTile[];
    note: string | null;
    controls: ControlsView;
    /** The room, house or heat pump chart's legend and notice; its lines are `ClimateCharts`', from the same history. */
    chart: ChartBlock;
    /** The tablet's heatmap block; null on the phone, whose sheet is one room. */
    heatmap: HeatmapBlock | null;
    /** The tablet's outside chart block; null on the phone. */
    outsideChart: OutsideBlock | null;
  };
}

/** The head of the detail for one selection, before the dial or the gauge is drawn from it. */
interface Head {
  title: string;
  sub: string;
  pill: {text: string; tone: Tone};
  /** The reading the big number, the dot and the gauge show. */
  temperature: number | null;
  /** The setpoint the gauge marks; the house has none. */
  mark: number | null;
  /** The dial's scale and setpoint: a number, `null` for off, `undefined` for not loaded (the house's). */
  dial: Bounded<number | null | undefined> & {editable: boolean; target: SetpointTarget | null};
  tiles: DetailTile[];
  note: string | null;
  controls: ControlsView;
}

/** The words under the gauge's bar, by what its geometry says. */
const GAUGE_CAPTIONS: Record<'setpoint' | 'off', MessageKey> = {
  setpoint: 'climate.gauge.setpoint',
  off: 'climate.gauge.off',
};

/** A pill's tone: lit when `on`, red when `bad`. */
function toneOf(on: boolean, bad: boolean): Tone {
  if (on) return 'on';
  return bad ? 'bad' : '';
}

/** A setting as the catalog words it, else as Home Assistant says it, capitalised. */
function settingLabel(value: string, {t}: ClimateModelDeps): string {
  const word = SETTING_WORDS.get(value);
  return word ? t(word) : capitalWords(value);
}

/** A louver position as the catalog words it, else as Home Assistant says it, capitalised (`swingName`). */
function swingLabel(value: string, {t}: ClimateModelDeps): string {
  const word = SWING_WORDS.get(value);
  if (word) return t(word);
  for (const [pattern, key] of SWING_AT) {
    const at = pattern.exec(value);
    if (at) return t(key, {n: at[1] ?? ''});
  }
  return capitalWords(value);
}

/** What the heat pump says in the summary: nothing without one, else offline, off, or what it is doing, to its target. */
function heatPumpSummary(heatPump: HeatPumpInputs | null, {t, fmt}: ClimateModelDeps): string {
  if (!heatPump) return '';
  if (!heatPump.available) return t('climate.summaryHpOffline');
  if (heatPump.mode === 'off') return t('climate.summaryHpOff');
  const action = actionWord(heatPump.action || heatPump.mode, t);
  return heatPump.target === null
    ? t('climate.summaryHpAction', {action})
    : t('climate.summaryHpActionTo', {action, n: fmt.number(heatPump.target, 2)});
}

/** The pane's sub-line, short on purpose: the room list sits right under it. */
function summaryOf({rooms, heatPump, outside}: ClimateInputs, deps: ClimateModelDeps): string {
  const {t, fmt} = deps;
  const average = averageTemperature(rooms);
  const heating = heatingCount(rooms);
  return [
    average === null ? '' : t('climate.averageInside', {n: fmt.fixed(average, 1)}),
    outside === null ? '' : t('climate.outsideTemp', {n: fmt.fixed(outside, 1)}),
    heating ? t('climate.roomsHeating', {n: heating}) : t('climate.noRoomsHeating'),
    heatPumpSummary(heatPump, deps),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The Range tile: its span is the loaded history's, a dash before it. */
function rangeTile({t, fmt}: ClimateModelDeps, range: Range, figures: Figures | null): DetailTile {
  const span = figures?.span;
  return {
    label: t('climate.rangeSpan', {span: t(RANGES[range].shortKey)}),
    value: span ? `${fmt.fixed(span.lo, 1)}–${fmt.fixed(span.hi, 1)}` : DASH,
    unit: '°',
    sub: null,
    range: true,
  };
}

function options(
  values: readonly string[] | null,
  current: string | null,
  label: (value: string) => string,
): ControlOption[] | null {
  return values && values.map(value => ({value, label: label(value), checked: value === current}));
}

function heatPumpControls(hp: HeatPumpInputs, deps: ClimateModelDeps): ControlsView {
  if (!hp.available) return {kind: 'hp', offline: true};
  const {overlay, t} = deps;
  const mode = overlay(K.hp.mode(hp.id), hp.mode);
  const target = overlay(K.hp.sp(hp.id), hp.target);
  const off = mode === 'off';
  return {
    kind: 'hp',
    id: hp.id,
    mode,
    modes: hp.modes.map(value => ({value, label: settingLabel(value, deps), checked: value === mode})),
    target: NO_TARGET_MODES.has(mode) ? null : {value: target, lo: hp.minTemp, hi: hp.maxTemp},
    fan: off ? null : options(hp.fanModes, overlay(K.hp.fan(hp.id), hp.fan), value => settingLabel(value, deps)),
    preset: off
      ? null
      : options(hp.presetModes, overlay(K.hp.preset(hp.id), hp.preset), value =>
          value === 'none' ? t('climate.normal') : settingLabel(value, deps),
        ),
    swing: off ? null : options(hp.swingModes, overlay(K.hp.swing(hp.id), hp.swing), value => swingLabel(value, deps)),
  };
}

function roomControls(room: RoomPower, deps: ClimateModelDeps): ControlsView {
  const {overlay, fmt, t} = deps;
  if (!room.available) return {kind: 'room', offline: true};
  const value = overlay(K.sp(room.climate), room.setpoint) ?? room.minTemp;
  return {
    kind: 'room',
    id: room.climate,
    name: roomName(room, deps),
    setpoint: {value, lo: room.minTemp, hi: room.maxTemp, off: value <= OFF_AT_OR_BELOW},
    quick: QUICK.map(q => ({
      value: q,
      label: q === 'off' ? t('climate.off') : degrees(fmt, q),
      pressed: value === (q === 'off' ? FROST_GUARD : q),
    })),
  };
}

function houseHead(
  inputs: ClimateInputs,
  deps: ClimateModelDeps,
  items: ClimateItem[],
  range: Range,
  figures: Figures | null,
): Head {
  const {t, fmt} = deps;
  const {rooms} = inputs;
  const house = items[0];
  const read = rooms
    .flatMap(room => (room.temperature === null ? [] : [{name: roomName(room, deps), temperature: room.temperature}]))
    .sort((a, b) => b.temperature - a.temperature);
  const warmest = read[0];
  const coolest = read[read.length - 1];
  const named = (reading: typeof warmest, label: MessageKey): DetailTile => ({
    label: t(label),
    value: reading ? fmt.fixed(reading.temperature, 1) : DASH,
    unit: '°',
    sub: reading?.name ?? null,
    range: false,
  });
  const all = t('climate.allThermostats');
  return {
    title: t('climate.wholeHouse'),
    sub: t('climate.averageOf', {n: rooms.length}),
    pill: {text: house.sub, tone: house.tone},
    temperature: averageTemperature(rooms),
    mark: null,
    dial: {value: undefined, lo: FROST_GUARD, hi: DEFAULT_MAX_TEMP, editable: false, target: null},
    tiles: [
      named(warmest, 'climate.warmest'),
      named(coolest, 'climate.coolest'),
      {label: t('climate.heatingNow'), value: fmt.fixed(inputs.heat, 2), unit: 'kW', sub: all, range: false},
      {
        label: t('climate.heatingSpan', {span: t(RANGES[range].shortKey)}),
        value: figures?.kwh == null ? DASH : fmt.integer(figures.kwh),
        unit: 'kWh',
        sub: all,
        range: false,
      },
    ],
    note: null,
    controls: {kind: 'house', rooms: rooms.map(room => room.climate)},
  };
}

/** What the heat pump is doing, capitalised: its action, else its mode as the legacy pill wrote it (`cap(hp.state)`) and the layer translated it. */
function heatPumpAction(hp: HeatPumpInputs, mode: string, deps: ClimateModelDeps): string {
  if (hp.action) return capitalWords(actionWord(hp.action, deps.t));
  const word = PILL_MODE_WORDS.get(mode);
  return word ? deps.t(word) : settingLabel(mode, deps);
}

/** The heat pump's pill: offline, off, or what it is doing, to its target when it has one. */
function heatPumpPill(hp: HeatPumpInputs, mode: string, deps: ClimateModelDeps): string {
  const {t, fmt} = deps;
  if (!hp.available) return t('climate.offline');
  if (mode === 'off') return t('climate.off');
  const action = heatPumpAction(hp, mode, deps);
  return hp.target === null ? action : t('climate.actionTo', {action, n: fmt.number(hp.target, 2)});
}

function heatPumpHead(
  hp: HeatPumpInputs,
  inputs: ClimateInputs,
  deps: ClimateModelDeps,
  range: Range,
  figures: Figures | null,
): Head {
  const {t, fmt, overlay} = deps;
  // the mode as shown, a held one included: the pill, the gauge's mark and the dial agree while a tap is pending
  const mode = overlay(K.hp.mode(hp.id), hp.mode);
  const idle = !hp.available || NO_TARGET_MODES.has(mode);
  return {
    title: t('climate.heatPump'),
    sub: hp.brand === FUJITSU_BRAND ? t('climate.fujitsuThrough') : (hp.brand ?? t('climate.heatPump')),
    pill: {text: heatPumpPill(hp, mode, deps), tone: toneOf(inputs.heatPumpOn, !hp.available)},
    temperature: hp.temperature,
    mark: hp.available && mode !== 'off' ? hp.target : null,
    dial: {
      value: idle ? null : overlay(K.hp.sp(hp.id), hp.target),
      lo: hp.minTemp,
      hi: hp.maxTemp,
      editable: !idle,
      target: idle ? null : {kind: 'hp', id: hp.id},
    },
    tiles: [
      rangeTile(deps, range, figures),
      {
        label: t('climate.lastUpdate'),
        value: hp.available && hp.lastUpdated !== null ? fmt.time(hp.lastUpdated) : DASH,
        unit: '',
        sub: null,
        range: false,
      },
    ],
    note: figures?.hpFrom
      ? `${t('climate.noteHeatPump')} ${t('climate.historyStarts', {date: fmt.date(figures.hpFrom)})}`
      : t('climate.noteHeatPump'),
    controls: heatPumpControls(hp, deps),
  };
}

/** A room's pill: unavailable, heating to its setpoint, holding one above the frost guard, else off. */
function roomPill(room: RoomPower, {t, fmt}: ClimateModelDeps): string {
  const {setpoint} = room;
  if (!room.available) return t('climate.unavailable');
  if (room.heating) return t('climate.heatingTo', {n: setpoint === null ? DASH : fmt.number(setpoint, 2)});
  if (setpoint !== null && setpoint > OFF_AT_OR_BELOW) return t('climate.holding', {n: fmt.number(setpoint, 2)});
  return t('climate.off');
}

function roomHead(room: RoomPower, deps: ClimateModelDeps, range: Range, figures: Figures | null): Head {
  const {t, fmt, overlay} = deps;
  const {setpoint} = room;
  return {
    title: roomName(room, deps),
    sub: t('climate.hiloThermostat'),
    pill: {text: roomPill(room, deps), tone: toneOf(room.heating, !room.available)},
    temperature: room.temperature,
    mark: setpoint,
    dial: {
      value: room.available ? overlay(K.sp(room.climate), setpoint) : null,
      lo: room.minTemp,
      hi: room.maxTemp,
      editable: room.available,
      target: room.available ? {kind: 'room', id: room.climate, name: roomName(room, deps)} : null,
    },
    tiles: [
      rangeTile(deps, range, figures),
      {label: t('climate.drawingNow'), value: fmt.fixed(room.power ?? 0, 2), unit: 'kW', sub: null, range: false},
      {
        label: t('climate.heatingSpan', {span: t(RANGES[range].shortKey)}),
        value: figures?.kwh == null ? DASH : fmt.fixed(figures.kwh, 1),
        unit: 'kWh',
        sub: null,
        range: false,
      },
    ],
    note: t('climate.noteRoom'),
    controls: roomControls(room, deps),
  };
}

/** The dial's centre: the setpoint, "Off", or the temperature while the setpoint is unknown. */
function dialBig({shown, off}: DialGeometry, reading: number | null, {t, fmt}: ClimateModelDeps): string {
  if (shown === null) return reading === null ? DASH : tenthDegrees(fmt, reading);
  return off ? t('climate.off') : tenthDegrees(fmt, shown);
}

/** What a screen reader says of the slider's value; empty while the setpoint is unknown. */
function dialValueText({shown, off}: DialGeometry, {t, fmt}: ClimateModelDeps): string {
  if (shown === null) return '';
  return off ? t('climate.off') : t('climate.dial.degrees', {n: fmt.number(shown, 2)});
}

function dialView(head: Head, outside: number | null, deps: ClimateModelDeps): DialView {
  const {t, fmt} = deps;
  const {value: sp, lo, hi, editable, target} = head.dial;
  const geometry = dialGeometry(head.temperature, sp, lo, hi);
  const reading = head.temperature;
  return {
    editable,
    target,
    lo,
    hi,
    value: geometry.shown,
    geometry,
    big: dialBig(geometry, reading, deps),
    caption: [
      reading === null ? '' : t('climate.now', {n: fixedOr(fmt, reading, 1)}),
      outside === null ? '' : t('climate.dialOutside', {n: fmt.fixed(outside, 1)}),
    ]
      .filter(Boolean)
      .join(' · '),
    label: t(editable ? 'climate.dial.setpoint' : 'climate.dial.temperature'),
    valueText: dialValueText(geometry, deps),
  };
}

function gaugeView(head: Head, {t, fmt}: ClimateModelDeps): GaugeView | null {
  const {temperature, mark} = head;
  const geometry = gaugeGeometry(temperature, mark);
  if (geometry === null || temperature === null) return null;
  const scale = {lo: GAUGE.lo, hi: GAUGE.hi};
  const temp = fmt.fixed(temperature, 1);
  return {
    geometry,
    label:
      geometry.setpoint === null || mark === null
        ? t('climate.gauge.label', {temp, ...scale})
        : t('climate.gauge.labelSetpoint', {temp, sp: fmt.number(mark, 2), ...scale}),
    now: t('climate.now', {n: temp}),
    caption: geometry.caption === null ? '' : t(GAUGE_CAPTIONS[geometry.caption]),
    lo: degrees(fmt, GAUGE.lo),
    hi: degrees(fmt, GAUGE.hi),
  };
}

/** The head of the heat pump if it is selected, else of the room, else of the house. */
function headOf(
  pump: HeatPumpInputs | null,
  room: RoomPower | undefined,
  inputs: ClimateInputs,
  deps: ClimateModelDeps,
  items: ClimateItem[],
  figures: Figures | null,
): Head {
  const range = deps.range ?? DEFAULT_RANGE;
  if (pump) return heatPumpHead(pump, inputs, deps, range, figures);
  if (room) return roomHead(room, deps, range, figures);
  return houseHead(inputs, deps, items, range, figures);
}

/** What the tiles and the note read off the range's history for a selection: its span, its heating and where the heat pump's line starts; null before the load. */
function figuresOf(
  history: ClimateHistoryData | null,
  range: Range,
  selection: ClimateSelection,
  rooms: readonly RoomPower[],
): Figures | null {
  if (!history || history.range !== range) return null;
  const values = selectedSeries(
    history,
    selection,
    rooms.map(({key}) => key),
  ).points.flatMap(([, value]) => (value === null ? [] : [value]));
  return {
    span: values.length ? {lo: Math.min(...values), hi: Math.max(...values)} : null,
    kwh: selectedKwh(history, selection),
    hpFrom: selection === 'hp' ? lateHeatPumpStart(history) : null,
  };
}

/** What stands in a chart's place before there is a line: the loading word, or the failure's. */
function waiting(loaded: boolean, {t, historyFailed}: ClimateModelDeps): ChartNotice | null {
  if (loaded) return null;
  return historyFailed
    ? {kind: 'failed', text: t('climate.historyUnavailable')}
    : {kind: 'loading', text: t('climate.historyLoading')};
}

/** The legend's colours are the page's tokens, so the theme is the page's. */
const ROOM_LINE = 'var(--c-wh)';
const OUTSIDE_LINE = 'var(--c-home)';
const SETPOINT_LINE = 'var(--fg2)';
const OUTSIDE_BAND = 'color-mix(in srgb, var(--c-home) 35%, transparent)';

/** The detail chart's legend and words: the line (the house is "House average"), its setpoint for a room or the heat pump, and the outside. */
function chartBlock(
  head: Head,
  selection: ClimateSelection,
  range: Range,
  loaded: boolean,
  deps: ClimateModelDeps,
): ChartBlock {
  const {t} = deps;
  const house = selection === 'house';
  const name = house ? t('climate.houseAverage') : head.title;
  return {
    name,
    rangeLabel: t(RANGES[range].labelKey),
    legend: [
      {name, color: ROOM_LINE, dashed: false},
      ...(house ? [] : [{name: t('climate.chart.setpoint'), color: SETPOINT_LINE, dashed: true}]),
      {name: t('climate.chart.outside'), color: OUTSIDE_LINE, dashed: false},
    ],
    notice: waiting(loaded, deps),
  };
}

/** The tablet's two blocks under the detail, worded for the range; the last room is drawn on top, as the legacy heatmap's. */
function wideBlocks(
  rooms: readonly RoomPower[],
  range: Range,
  loaded: boolean,
  deps: ClimateModelDeps,
): {heatmap: HeatmapBlock; outsideChart: OutsideBlock} {
  const {t} = deps;
  const waits = waiting(loaded, deps);
  const words = RANGE_WORDS[range];
  return {
    heatmap: {
      title: t(words.heatTitle),
      hint: t('climate.heatHint'),
      rooms: [...rooms].reverse().map(room => ({key: room.key, name: roomName(room, deps)})),
      notice: waits ?? (rooms.length ? null : {kind: 'empty', text: t('climate.noThermostats')}),
    },
    outsideChart: {
      title: t('climate.outsideTitle', {label: t(RANGES[range].labelKey)}),
      note: t(words.outNote),
      legend: [
        {name: t('climate.chart.lowToHigh'), color: OUTSIDE_BAND, dashed: false},
        {name: t('climate.chart.mean'), color: OUTSIDE_LINE, dashed: false},
      ],
      notice: waits,
    },
  };
}

/**
 * The Climate tab's view for one selection: the summary, the list, the phone's tiles and the detail, from the inputs, in the language
 * `deps.t` words. `history` is the range's load (the loader's): until it arrives the tiles show a dash and the charts say they are loading
 * (or that the load failed, `deps.historyFailed`); a history of another range than `deps.range` is no history.
 */
export function climateModel(
  inputs: ClimateInputs,
  history: ClimateHistoryData | null,
  sel: ClimateSelection,
  deps: ClimateModelDeps,
): ClimateViewModel {
  const items = climateItems(inputs, deps);
  const {heatPump, rooms, outside} = inputs;
  const room = rooms.find(candidate => candidate.key === sel);
  const pump = sel === 'hp' ? heatPump : null;
  const selection = pump ? 'hp' : (room?.key ?? 'house');
  const range = deps.range ?? DEFAULT_RANGE;
  const figures = figuresOf(history, range, selection, rooms);
  const head = headOf(pump, room, inputs, deps, items, figures);
  const {t, fmt} = deps;
  const blocks = deps.compact ? null : wideBlocks(rooms, range, figures !== null, deps);
  return {
    summary: summaryOf(inputs, deps),
    items,
    tiles: items.map(item => ({...item, wide: item.id === 'house'})),
    selection,
    detail: {
      title: head.title,
      sub: head.sub,
      pill: head.pill,
      temperature: deps.compact ? null : fixedOr(fmt, head.temperature, 1),
      outside: deps.compact ? null : t('climate.outsideNow', {n: fixedOr(fmt, outside, 1)}),
      gauge: deps.compact ? null : gaugeView(head, deps),
      dial: deps.compact ? dialView(head, outside, deps) : null,
      tiles: head.tiles,
      note: head.note,
      controls: head.controls,
      chart: chartBlock(head, selection, range, figures !== null, deps),
      heatmap: blocks?.heatmap ?? null,
      outsideChart: blocks?.outsideChart ?? null,
    },
  };
}
