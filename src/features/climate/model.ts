// climateModel: the house, its rooms and the heat pump in, every text, figure and shape the Climate list, the phone's tiles and the detail's head, tiles, note and controls place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no store, words every message through
// `deps.t` and every number through `deps.fmt`, takes a held setpoint or mode from `deps.overlay` (ADR 0023), and delegates the drawings to the pure geometry of
// dial-geometry.ts and gauge-geometry.ts. Each rule is the legacy panel's own (`climateSummary`, `climInfo`, `renderClimateHead`, `renderClimateControls`), deleted in #248.
// Must not: import the DOM, Lit or the shell, read the clock, hold text the household reads (a catalog key says it), or decide the frost guard's commands (#248's).
import {capitalWords, DASH} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {degrees, fixedOr} from '../../core/i18n/format.ts';
import {roomName} from '../../core/i18n/room-name.ts';
import {FUJITSU_BRAND, type HeatPumpInputs} from '../../providers/heat-pump.ts';
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
import {K} from './keys.ts';

/** What the detail shows: `house`, `hp` or a room's key. A key that names nothing the house has shows the house. */
export type ClimateSelection = string;

/** The range the tiles are named for until the person picks one (the legacy `crange`'s default). */
const DEFAULT_RANGE: Range = 'day';
/** What "set every room" starts at (the legacy `allSp ?? 21`, deleted in #248). */
const DEFAULT_ALL_SETPOINT = 21;
/** The heat pump's modes that have no target to set (the legacy lists, deleted in #248). */
const NO_TARGET_MODES: ReadonlySet<string> = new Set(['off', 'fan_only', 'dry']);
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
  /** The value of the house's "set every room" stepper, element state; 21 until the person moves it. */
  allSetpoint?: number;
  /** The "all rooms" button waiting for its second tap, element state. */
  armed?: 'allset' | 'alloff' | null;
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
  | {kind: 'house'; allSetpoint: number; armed: 'allset' | 'alloff' | null; roomsCount: number}
  | {kind: 'room'; offline: true}
  | {
      kind: 'room';
      offline?: false;
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

export interface DialView {
  /** The setpoint can be moved: the thermostat is on. */
  editable: boolean;
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
    /** The charts and the heatmap, drawn from the loaded history (#246): nothing is loaded yet. */
    chart: null;
    heatmap: null;
    outsideChart: null;
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
  dial: Bounded<number | null | undefined> & {editable: boolean};
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

/** The Range tile: its value waits for the history (#246). */
function rangeTile({t}: ClimateModelDeps, range: Range): DetailTile {
  return {
    label: t('climate.rangeSpan', {span: t(RANGES[range].shortKey)}),
    value: DASH,
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

function roomControls(room: RoomPower, {overlay, fmt, t}: ClimateModelDeps): ControlsView {
  if (!room.available) return {kind: 'room', offline: true};
  const value = overlay(K.sp(room.climate), room.setpoint) ?? room.minTemp;
  return {
    kind: 'room',
    setpoint: {value, lo: room.minTemp, hi: room.maxTemp, off: value <= OFF_AT_OR_BELOW},
    quick: QUICK.map(q => ({
      value: q,
      label: q === 'off' ? t('climate.off') : degrees(fmt, q),
      pressed: value === (q === 'off' ? FROST_GUARD : q),
    })),
  };
}

function houseHead(inputs: ClimateInputs, deps: ClimateModelDeps, items: ClimateItem[], range: Range): Head {
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
    dial: {value: undefined, lo: FROST_GUARD, hi: DEFAULT_MAX_TEMP, editable: false},
    tiles: [
      named(warmest, 'climate.warmest'),
      named(coolest, 'climate.coolest'),
      {label: t('climate.heatingNow'), value: fmt.fixed(inputs.heat, 2), unit: 'kW', sub: all, range: false},
      {
        label: t('climate.heatingSpan', {span: t(RANGES[range].shortKey)}),
        value: DASH,
        unit: 'kWh',
        sub: all,
        range: false,
      },
    ],
    note: null,
    controls: {
      kind: 'house',
      allSetpoint: deps.allSetpoint ?? DEFAULT_ALL_SETPOINT,
      armed: deps.armed ?? null,
      roomsCount: rooms.length,
    },
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

function heatPumpHead(hp: HeatPumpInputs, inputs: ClimateInputs, deps: ClimateModelDeps, range: Range): Head {
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
    },
    tiles: [
      rangeTile(deps, range),
      {
        label: t('climate.lastUpdate'),
        value: hp.available && hp.lastUpdated !== null ? fmt.time(hp.lastUpdated) : DASH,
        unit: '',
        sub: null,
        range: false,
      },
    ],
    note: t('climate.noteHeatPump'),
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

function roomHead(room: RoomPower, deps: ClimateModelDeps, range: Range): Head {
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
    },
    tiles: [
      rangeTile(deps, range),
      {label: t('climate.drawingNow'), value: fmt.fixed(room.power ?? 0, 2), unit: 'kW', sub: null, range: false},
      {
        label: t('climate.heatingSpan', {span: t(RANGES[range].shortKey)}),
        value: DASH,
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
  const {value: sp, lo, hi, editable} = head.dial;
  const geometry = dialGeometry(head.temperature, sp, lo, hi);
  const reading = head.temperature;
  return {
    editable,
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
): Head {
  const range = deps.range ?? DEFAULT_RANGE;
  if (pump) return heatPumpHead(pump, inputs, deps, range);
  if (room) return roomHead(room, deps, range);
  return houseHead(inputs, deps, items, range);
}

/**
 * The Climate tab's view for one selection: the summary, the list, the phone's tiles and the detail, from the inputs, in the language
 * `deps.t` words. `history` is the loaded range (#246); until then the charts are null and the tiles that need it show a dash.
 */
export function climateModel(
  inputs: ClimateInputs,
  history: null,
  sel: ClimateSelection,
  deps: ClimateModelDeps,
): ClimateViewModel {
  const items = climateItems(inputs, deps);
  const {heatPump, rooms, outside} = inputs;
  const room = rooms.find(candidate => candidate.key === sel);
  const pump = sel === 'hp' ? heatPump : null;
  const head = headOf(pump, room, inputs, deps, items);
  const {t, fmt} = deps;
  return {
    summary: summaryOf(inputs, deps),
    items,
    tiles: items.map(item => ({...item, wide: item.id === 'house'})),
    selection: pump ? 'hp' : (room?.key ?? 'house'),
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
      chart: null,
      heatmap: null,
      outsideChart: null,
    },
  };
}
