// The Climate commands: what a tap on a thermostat or the heat pump asks Home Assistant for, as `Command` data, and the arithmetic of a setpoint's next step.
// Pattern: Command (Gamma et al.) built by pure functions; the kit's `CommandRunner` sends them, an element holds the value each `holds` key names in the panel's
// overlay store (ADR 0023). The rules are the legacy `climateControl`'s and `applySp`'s, deleted in #248: below 5.5 going down is the lowest setpoint, up from off is 15.
// Must not: send anything, read the store or the clock, or word a string (`done` is a catalog key, the runner words it; a number or a word arrives already written).
import {temperatureFigure, type Formatters} from '../../core/i18n/format.ts';
import {FROST_GUARD, OFF_AT_OR_BELOW} from '../../providers/power.ts';
import type {Command} from '../../core/commands.ts';
import {K} from './keys.ts';

/** What a tap on a stepper adds or takes away, and the grid the thermostats' setpoints and the dial's snap to: half a degree. */
export const SETPOINT_STEP = 0.5;

/** Where "up from off" starts: the legacy stepper's first step from the frost guard went to 15, not to 5.5. */
export const WAKE_SETPOINT = 15;

/** The house's "set every room" stepper: where it starts, and its ends (the legacy `allSp`: 21, from 5.5 to 30). */
export const ALL_ROOMS = {start: 21, lo: OFF_AT_OR_BELOW, hi: 30} as const;

/** What a command needs of the formatters: a number to a fixed number of decimals, as the household's language writes it. */
export type DegreeFormat = Pick<Formatters, 'fixed'>;

/** A thermostat as a command names it: its entity and the name its toast says. */
export interface RoomTarget {
  id: string;
  name: string;
}

/** The heat pump as a command names it. */
export interface HeatPumpTarget {
  id: string;
}

/** A setpoint as a thermostat takes it: on the half degrees, kept in its own range. */
export const clampSetpoint = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.round(value / SETPOINT_STEP) * SETPOINT_STEP));

/**
 * The setpoint a step of `delta` from `current` asks for. Below 5.5 going down is `lo`, the thermostat off; from off, up is 15 (a thermostat does not
 * climb in halves from the frost guard); anything else is `current + delta`; all of it on the half degrees and in `lo` to `hi`.
 */
export function nextSetpoint(current: number, delta: number, lo: number, hi: number): number {
  let value = current + delta;
  if (value < OFF_AT_OR_BELOW && delta < 0) value = lo;
  if (current <= OFF_AT_OR_BELOW && delta > 0) value = WAKE_SETPOINT;
  return clampSetpoint(value, lo, hi);
}

/** The quick button's setpoint: its degrees, or the frost guard for Off, kept in the thermostat's range. */
export const quickSetpoint = (quick: number | 'off', lo: number, hi: number): number =>
  clampSetpoint(quick === 'off' ? FROST_GUARD : quick, lo, hi);

const climate = (service: string, data: Record<string, unknown>): Pick<Command, 'domain' | 'service' | 'data'> => ({
  domain: 'climate',
  service,
  data,
});

/** Sets one thermostat, which shows the value at once; the toast says off at or below 5.5. The element debounces it, so a burst of taps is one call. */
export const setRoomTemperature = (room: RoomTarget, value: number, fmt: DegreeFormat): Command => ({
  ...climate('set_temperature', {entity_id: room.id, temperature: value}),
  holds: [K.sp(room.id)],
  done:
    value <= OFF_AT_OR_BELOW
      ? {key: 'climate.roomOff', values: {name: room.name}}
      : {key: 'climate.roomSet', values: {name: room.name, n: temperatureFigure(fmt, value)}},
});

/** Sets every room in one call, each shown at the value at once; the frost guard is the "all off" the toast names. */
export const setAllRooms = (ids: readonly string[], value: number, fmt: DegreeFormat): Command => ({
  ...climate('set_temperature', {entity_id: [...ids], temperature: value}),
  holds: ids.map(id => K.sp(id)),
  done:
    value <= FROST_GUARD
      ? {key: 'climate.allRoomsOff'}
      : {key: 'climate.allRoomsSet', values: {n: temperatureFigure(fmt, value)}},
});

/**
 * The heat pump's word settings, which differ only in names: the service and its field, the overlay key, and the toast's catalog key and value name.
 * The louvers are one setting when the unit has one list of positions, and two, up and down and side to side, when it lists the side-to-side ones apart.
 */
const HP_SETTINGS = {
  mode: {service: 'set_hvac_mode', field: 'hvac_mode', hold: K.hp.mode, done: 'climate.hpMode', name: 'mode'},
  fan: {service: 'set_fan_mode', field: 'fan_mode', hold: K.hp.fan, done: 'climate.hpFan', name: 'fan'},
  preset: {
    service: 'set_preset_mode',
    field: 'preset_mode',
    hold: K.hp.preset,
    done: 'climate.hpPreset',
    name: 'preset',
  },
  swing: {service: 'set_swing_mode', field: 'swing_mode', hold: K.hp.swing, done: 'climate.hpSwing', name: 'swing'},
  swingVertical: {
    service: 'set_swing_mode',
    field: 'swing_mode',
    hold: K.hp.swing,
    done: 'climate.hpSwingVertical',
    name: 'swing',
  },
  swingHorizontal: {
    service: 'set_swing_horizontal_mode',
    field: 'swing_horizontal_mode',
    hold: K.hp.swingHorizontal,
    done: 'climate.hpSwingHorizontal',
    name: 'swing',
  },
} as const;

/** Sets one of the heat pump's word settings; `word` is the value as its control says it, the toast says it in lower case. */
const hpSetting = (setting: keyof typeof HP_SETTINGS, hp: HeatPumpTarget, value: string, word: string): Command => {
  const {service, field, hold, done, name} = HP_SETTINGS[setting];
  return {
    ...climate(service, {entity_id: hp.id, [field]: value}),
    holds: [hold(hp.id)],
    done: {key: done, values: {[name]: word.toLowerCase()}},
  };
};

/** Sets the heat pump's mode; `word` is the mode as its button says it, the toast says it in lower case. */
export const hpMode = (hp: HeatPumpTarget, mode: string, word: string): Command => hpSetting('mode', hp, mode, word);

/** Sets the heat pump's target. The element debounces it, as a room's. */
export const hpTemperature = (hp: HeatPumpTarget, value: number, fmt: DegreeFormat): Command => ({
  ...climate('set_temperature', {entity_id: hp.id, temperature: value}),
  holds: [K.hp.sp(hp.id)],
  done: {key: 'climate.hpSet', values: {n: temperatureFigure(fmt, value)}},
});

/** Sets the heat pump's fan speed, as its mode. */
export const hpFan = (hp: HeatPumpTarget, fan: string, word: string): Command => hpSetting('fan', hp, fan, word);

/** Sets the heat pump's preset, as its mode. */
export const hpPreset = (hp: HeatPumpTarget, preset: string, word: string): Command =>
  hpSetting('preset', hp, preset, word);

/** Sets the heat pump's louver position, as its mode. */
export const hpSwing = (hp: HeatPumpTarget, swing: string, word: string): Command =>
  hpSetting('swing', hp, swing, word);

/** Sets the up-and-down louvers of a unit that sets the side-to-side ones apart: the same call as `hpSwing`, the toast names the direction. */
export const hpSwingVertical = (hp: HeatPumpTarget, swing: string, word: string): Command =>
  hpSetting('swingVertical', hp, swing, word);

/** Sets the side-to-side louvers (`climate.set_swing_horizontal_mode`, Home Assistant 2024.12). */
export const hpSwingHorizontal = (hp: HeatPumpTarget, swing: string, word: string): Command =>
  hpSetting('swingHorizontal', hp, swing, word);
