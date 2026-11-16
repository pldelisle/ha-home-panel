// carControls: the charger's card and the comfort and access card as strings, numbers and flags, from the inputs, the values held while a tap awaits Home Assistant, the buttons waiting for a second tap and the departure draft.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler), as `carModel`: it reads no clock, no `hass` and no store, words every message through `deps.t` and every number through `deps.fmt`,
// and takes a held value from `deps.overlay` (ADR 0023). The rules are the legacy `renderCarControls`, `closedText`, `depState` and `depDesc`, deleted in #253; the elements, which hold the armed state and the draft, call it.
// Must not: import the DOM, Lit or the shell, read the clock, hold text the household reads (a catalog key says it), or decide a command (commands.ts does).
import {joined} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {CarInputs, CarRef} from '../../providers/fordpass.ts';
import {chargerStatusKey, pauseHold} from '../../providers/wallbox.ts';
import type {IconName} from '../../ui/icons.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import {HEATER_SWITCHES, type Heater} from './commands.ts';
import type {CarFeatureInputs} from './inputs.ts';
import {K} from './keys.ts';
import {DAYS, describe, type CabinTemperature, type ScheduleDraft} from './schedule.ts';

/** What the view is made of: the catalog, the formatters and the held values. */
export interface ControlsDeps {
  t: Translate;
  fmt: Formatters;
  overlay: Overlay;
}

/** The two buttons that need a second tap: the remote start and the unlock. */
export type ArmedKey = 'remoteStart' | 'lock';

/** The current limits the charger offers, as the legacy panel did: the steps its own range holds. */
const AMPS_STEPS = [16, 24, 32, 40, 48];
/** What an amp is worth in kW, which the legacy panel assumed at 240 V and says so under the group. */
const KW_PER_AMP = 0.24;
/** The charge limits the car reports, which the panel can show and not change. */
const LIMIT_STEPS = [50, 60, 70, 80, 90, 100];
const FULL = 100;
const STATUS_PREFIX = 'energy.status.';

/** A radio option as `<hp-seg>` takes it: strings, since a value is one. */
interface ChoiceView {
  value: string;
  label: string;
  sub?: string;
}

/** One switch row: what it is, what it says, whether it is on and whether it can be turned. */
export interface SwitchRowView {
  /** The entity it turns; null when the house has none. */
  id: string | null;
  title: string;
  line: string;
  on: boolean;
  disabled: boolean;
  /** What a screen reader calls the switch. */
  label: string;
}

export interface ChargerView {
  title: string;
  line: string;
  power: {
    heading: string;
    label: string;
    id: string | null;
    options: ChoiceView[];
    chosen: string | undefined;
    disabled: boolean;
    hint: string;
  };
  limit: {heading: string; label: string; options: ChoiceView[]; chosen: string | undefined; hint: string};
  charging: SwitchRowView;
  lock: SwitchRowView;
}

/** One of the four buttons of the comfort card. */
export interface ComfortButtonView {
  key: 'remoteStart' | Heater;
  icon: IconName;
  /** What the button is called, which a toast repeats. */
  name: string;
  /** What the button says: its name, or "Tap again to start" while it waits. */
  text: string;
  line: string;
  pressed: boolean;
  armed: boolean;
  disabled: boolean;
}

interface DayView {
  /** The day as Ford names it. */
  day: string;
  /** The name a screen reader says. */
  name: string;
  /** The letter on the button. */
  initial: string;
  pressed: boolean;
}

export interface ComfortView {
  car: CarRef;
  title: string;
  line: string;
  buttons: ComfortButtonView[];
  /** The front seats' remote-start setting in words; `''` when the car reports none. */
  seats: string;
  access: {
    title: string;
    line: string;
    /** The button that honks and flashes; null when the car has none. */
    honk: {id: string; label: string} | null;
    lock: {label: string; armed: boolean; disabled: boolean; locked: boolean};
  };
  departure: {
    heading: string;
    row: SwitchRowView;
    daysLabel: string;
    days: DayView[];
    timeLabel: string;
    time: string;
    cabinLabel: string;
    cabin: ChoiceView[];
    chosen: CabinTemperature | undefined;
    hint: string;
    save: string;
  };
}

/** The status as the charger line says it: the catalog's word for a status it knows, else the sensor's own text in lower case; `unavailable` while there is none. */
function statusWord(status: string | null, t: Translate): string {
  if (status === null) return t('car.charger.status', {id: 'unavailable', raw: ''});
  const key = chargerStatusKey(status);
  return t('car.charger.status', {id: key ? key.slice(STATUS_PREFIX.length) : 'other', raw: status.toLowerCase()});
}

/** The charger's card: its line, the current limit and the read-only charge limit, and the charging and lock switches. Null while the house has no car. */
export function chargerControls(inputs: CarFeatureInputs, {t, fmt, overlay}: ControlsDeps): ChargerView | null {
  const {car, charger} = inputs;
  if (!car) return null;
  const {amps, pause, lock} = charger;
  const current = amps.id === null ? amps.value : overlay(K.amps(amps.id), amps.value);
  const steps = AMPS_STEPS.filter(a => a >= amps.min && a <= amps.max);
  const rounded = current === null ? null : Math.round(current);
  const charging = pause.id === null ? pause.on : overlay(pauseHold(pause.id), pause.on);
  const locked = lock.id === null ? lock.on : overlay(K.chargerLock(lock.id), lock.on);
  const outside = rounded !== null && !steps.includes(rounded);
  return {
    title: t('car.charger.title'),
    line: t('car.charger.line', {status: statusWord(charger.status, t), plugged: car.plugged ? 'yes' : 'no'}),
    power: {
      heading: t('car.charger.power'),
      label: t('car.charger.currentLabel'),
      id: amps.id,
      options: steps.map(a => ({
        value: String(a),
        label: t('car.charger.amps', {n: a}),
        sub: t('car.charger.kw', {n: fmt.fixed(a * KW_PER_AMP, 1)}),
      })),
      chosen: rounded === null ? undefined : String(rounded),
      disabled: !amps.available,
      hint: outside ? t('car.charger.ampsHintNow', {n: rounded}) : t('car.charger.ampsHint'),
    },
    limit: {
      heading: t('car.charger.limit'),
      label: t('car.charger.limitLabel'),
      options: LIMIT_STEPS.map(v => ({
        value: String(v),
        label: v === FULL ? t('car.charger.full') : t('car.percent', {n: fmt.integer(v)}),
      })),
      chosen: car.limit === null ? undefined : String(car.limit),
      hint: t('car.charger.limitHint'),
    },
    charging: {
      id: pause.id,
      title: t('car.charger.charging'),
      line: !pause.available
        ? t('car.charger.unavailableLine')
        : t(charging ? 'car.charger.onLine' : 'car.charger.pausedLine'),
      on: charging,
      disabled: !pause.available,
      label: t('car.charger.charging'),
    },
    lock: {
      id: lock.id,
      title: t('car.charger.lock'),
      line: t(locked ? 'car.charger.locked' : 'car.charger.unlocked'),
      on: locked,
      disabled: !lock.available,
      label: t('car.charger.lock'),
    },
  };
}

/** The doors line under the lock status: what is open, or that everything is closed; nothing while the door sensor has no value. */
function closedWords({doors, windowsClosed}: CarInputs, t: Translate): string {
  if (doors.closed === null) return '';
  if (doors.open.length) return t('car.comfort.open', {doors: doors.open.join(', ')});
  return t(windowsClosed ? 'car.comfort.allClosedWindows' : 'car.comfort.allClosed');
}

/** The seat line: how the front seats heat or cool with a remote start, from the select's `heated2`, `cooled1`; `''` for any other state. */
function seatWords(seats: string | null, t: Translate): string {
  const heat = /heated(\d)/.exec(seats ?? '');
  if (heat) return t('car.comfort.seatHeat', {level: heat[1]});
  const cool = /cooled(\d)/.exec(seats ?? '');
  return cool ? t('car.comfort.seatCool', {level: cool[1]}) : '';
}

/** What tells one button from another: its switch under the car's prefix, whether it waits for a second tap, the key it is held by and the line under its name. */
interface ButtonSpec {
  key: ComfortButtonView['key'];
  icon: IconName;
  name: MessageKey;
  switchId: string;
  armable: boolean;
  held: (id: string) => string;
  line: (on: boolean, car: CarInputs, t: Translate) => string;
}

const heaterLine = (on: boolean, _car: CarInputs, t: Translate) =>
  t('car.comfort.withRemote', {on: on ? 'true' : 'false'});

const BUTTONS: readonly ButtonSpec[] = [
  {
    key: 'remoteStart',
    icon: 'fan',
    name: 'car.comfort.remoteStart',
    switchId: 'ignition',
    armable: true,
    held: K.ignition,
    line: (on, car, t) =>
      joined(
        on ? t('car.comfort.running') : t('car.off'),
        car.remoteCabin === null ? '' : t('car.comfort.cabin', {state: car.remoteCabin.toUpperCase()}),
      ),
  },
  {
    key: 'windshield',
    icon: 'wind',
    name: 'car.heater.windshield',
    switchId: HEATER_SWITCHES.windshield,
    armable: false,
    held: K.heater,
    line: heaterLine,
  },
  {
    key: 'rear',
    icon: 'rear',
    name: 'car.heater.rear',
    switchId: HEATER_SWITCHES.rear,
    armable: false,
    held: K.heater,
    line: heaterLine,
  },
  {
    key: 'wheel',
    icon: 'wheel',
    name: 'car.heater.wheel',
    switchId: HEATER_SWITCHES.wheel,
    armable: false,
    held: K.heater,
    line: heaterLine,
  },
];

/**
 * The comfort and access card: the remote start and the three heaters, the seat line, the lock and the horn, and the departure schedule's switch, days, time and cabin setting.
 * `armed` says which buttons wait for their second tap, and `draft` is what the person has edited and not yet saved. Null while the house has no car.
 */
export function comfortControls(
  inputs: CarFeatureInputs,
  armed: (key: ArmedKey) => boolean,
  draft: ScheduleDraft,
  {t, fmt, overlay}: ControlsDeps,
): ComfortView | null {
  const {car, ref} = inputs;
  if (!car || !ref) return null;
  const switches: Record<ComfortButtonView['key'], {on: boolean; available: boolean}> = {
    remoteStart: car.comfort.ignition,
    windshield: car.comfort.defrostFront,
    rear: car.comfort.defrostRear,
    wheel: car.comfort.wheel,
  };
  const buttons = BUTTONS.map(({key, icon, name, switchId, armable, held, line}): ComfortButtonView => {
    const {on: state, available} = switches[key];
    const on = overlay(held(ref.id('switch', switchId)), state);
    const isArmed = armable && armed('remoteStart');
    return {
      key,
      icon,
      name: t(name),
      text: isArmed ? t('car.comfort.tapToStart') : t(name),
      line: line(on, car, t),
      pressed: on,
      armed: isArmed,
      disabled: !available,
    };
  });
  const doorId = ref.id('lock', 'doorlock');
  const locked = overlay(K.doorLock(doorId), car.locked);
  const depId = ref.id('switch', 'departuretimes');
  const depOn = overlay(K.departure(depId), car.departureOn === true);
  const lockArmed = armed('lock');
  return {
    car: ref,
    title: t('car.comfort.title'),
    line: t('car.comfort.line'),
    buttons,
    seats: seatWords(car.seats, t),
    access: {
      title: locked === null ? t('car.comfort.lockUnknown') : t(locked ? 'car.chip.locked' : 'car.chip.unlocked'),
      line: closedWords(car, t),
      honk: car.honkButton === null ? null : {id: car.honkButton, label: t('car.comfort.honk')},
      lock: {
        label: lockArmed ? t('car.comfort.tapToUnlock') : t(locked ? 'car.comfort.unlock' : 'car.comfort.lock'),
        armed: lockArmed,
        disabled: !car.lockAvailable,
        locked: locked === true,
      },
    },
    departure: {
      heading: t('car.comfort.departure'),
      row: {
        id: depId,
        title: t('car.comfort.precondition'),
        line: describe(draft, depOn, fmt, t),
        on: depOn,
        disabled: !car.departureAvailable,
        label: t('car.comfort.departure'),
      },
      daysLabel: t('car.comfort.days'),
      days: DAYS.map(day => ({
        day,
        name: t('car.comfort.dayName', {day}),
        initial: t('car.comfort.dayInitial', {day}),
        pressed: draft.days.includes(day),
      })),
      timeLabel: t('car.comfort.time'),
      time: draft.time,
      cabinLabel: t('car.comfort.cabinLabel'),
      cabin: [
        {value: 'low', label: t('car.comfort.cool')},
        {value: 'medium', label: t('car.comfort.medium')},
        {value: 'high', label: t('car.comfort.warm')},
        {value: 'off', label: t('car.off')},
      ],
      chosen: draft.temp ?? undefined,
      hint: t('car.comfort.departureHint'),
      save: t('car.comfort.save'),
    },
  };
}
