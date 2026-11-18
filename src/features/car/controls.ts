// carControls: the actions row (with its two questions), the charger's card and the departure row and editor as strings, numbers and flags, from the inputs, the values held while a tap awaits Home Assistant and the departure draft.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler), as `carModel`: it reads no clock, no `hass` and no store, words every message through `deps.t` and every number through `deps.fmt`,
// and takes a held value from `deps.overlay` (ADR 0023). The rules began as the legacy `renderCarControls`, `depState` and `depDesc` (deleted in #253) and were reshaped by docs/apple-hig-audit-car-2026-11-17.md; the elements, which hold the dialogs and the draft, call it.
// Must not: import the DOM, Lit or the shell, read the clock, hold text the household reads (a catalog key says it), or decide a command (commands.ts does).
import {capitalise} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {CarInputs, CarRef} from '../../providers/fordpass.ts';
import {chargerStatusKey, pauseHold} from '../../providers/wallbox.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import {HEATER_SWITCHES, type Heater} from './commands.ts';
import type {CarFeatureInputs} from './inputs.ts';
import {K} from './keys.ts';
import {
  DAYS,
  clockWords,
  draftFromSchedule,
  scheduleWords,
  validate,
  type CabinTemperature,
  type ScheduleDraft,
} from './schedule.ts';

/** What the view is made of: the catalog, the formatters and the held values. */
export interface ControlsDeps {
  t: Translate;
  fmt: Formatters;
  overlay: Overlay;
}

/** The current limits the charger offers, as the legacy panel did: the steps its own range holds. */
const AMPS_STEPS = [16, 24, 32, 40, 48];
/** What an amp is worth in kW, which the legacy panel assumed at 240 V and says so under the group. */
const KW_PER_AMP = 0.24;
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
  lock: SwitchRowView;
  /** The charger answers: its controls can be used. While it does not, the card is one line (`unavailable`) instead of controls that do nothing. */
  available: boolean;
  unavailable: {title: string; line: string};
}

/** A question asked before an action that is hard to take back: what it is, what follows, and the two buttons (HIG, Alerts). */
export interface ConfirmView {
  title: string;
  line: string;
  confirm: string;
  cancel: string;
}

/** The actions row (docs/apple-hig-audit-car-2026-11-17.md): each button's words, the line under it that says how things stand, and whether it asks first. */
export interface ActionsView {
  /** Lock or unlock; unlocking asks first. Null when the car has no lock. */
  lock: {label: string; line: string; locked: boolean; confirm: ConfirmView | null} | null;
  /** Start (it asks first, with the heaters the car has as options) or stop the engine; null when the car has no remote start. */
  start: {
    label: string;
    line: string;
    running: boolean;
    confirm: ConfirmView;
    /** The remote start's heaters, as switches in the confirmation: each a setting the car keeps for the next start. */
    options: {key: Heater; name: string; on: boolean}[];
    /** The heaters' group label: they run with every start, not only this one. */
    optionsLabel: string;
    /** Under them: each is saved to the car as it is switched, so Cancel is not their undo (HIG, Toggles: a switch shows a state in effect). */
    optionsFoot: string;
    /** The front seats' remote-start setting in words; `''` when the car reports none. */
    seats: string;
  } | null;
  /** Pause or resume the Wallbox; null while the charger does not answer. */
  pause: {id: string; label: string; line: string; paused: boolean} | null;
  /** The car's button that honks and flashes; null when it has none. */
  honk: {id: string; label: string} | null;
}

/** The three heaters a remote start can run, in the order the confirmation lists them. */
const HEATERS: readonly {key: Heater; name: MessageKey}[] = [
  {key: 'windshield', name: 'car.heater.windshield'},
  {key: 'rear', name: 'car.heater.rear'},
  {key: 'wheel', name: 'car.heater.wheel'},
];

/** A heater's switch as the car reports it. */
const heaterState = (car: CarInputs, key: Heater): {on: boolean; available: boolean} =>
  ({windshield: car.comfort.defrostFront, rear: car.comfort.defrostRear, wheel: car.comfort.wheel})[key];

/** The actions row: lock, start, the charger's pause and the horn, each only where the house can do it. Null while the house has no car. */
export function carActions(inputs: CarFeatureInputs, {t, fmt, overlay}: ControlsDeps): ActionsView | null {
  const {car, ref, charger} = inputs;
  if (!car || !ref) return null;
  const locked = overlay(K.doorLock(ref.id('lock', 'doorlock')), car.locked);
  const {ignition} = car.comfort;
  const running = overlay(K.ignition(ref.id('switch', 'ignition')), ignition.on);
  const {pause} = charger;
  const charging = pause.id === null ? pause.on : overlay(pauseHold(pause.id), pause.on);
  const cancel = t('car.action.cancel');
  return {
    lock: !car.lockAvailable
      ? null
      : {
          label: t(locked ? 'car.comfort.unlock' : 'car.comfort.lock'),
          line:
            locked === null
              ? t('car.comfort.lockUnknown')
              : t(locked ? 'car.action.lockedNow' : 'car.action.unlockedNow'),
          locked: locked === true,
          confirm: locked
            ? {
                title: t('car.action.unlockTitle'),
                line: t('car.action.unlockLine'),
                confirm: t('car.comfort.unlock'),
                cancel,
              }
            : null,
        },
    start: !ignition.available
      ? null
      : {
          label: t(running ? 'car.action.stop' : 'car.action.start'),
          line: t(running ? 'car.comfort.running' : 'car.action.engineOff'),
          running,
          confirm: {
            title: t('car.action.startTitle'),
            line: t('car.action.startLine'),
            confirm: t('car.action.startConfirm'),
            cancel,
          },
          options: HEATERS.filter(({key}) => heaterState(car, key).available).map(({key, name}) => ({
            key,
            name: t(name),
            on: overlay(K.heater(ref.id('switch', HEATER_SWITCHES[key])), heaterState(car, key).on),
          })),
          optionsLabel: t('car.action.startOptions'),
          optionsFoot: t('car.action.startOptionsFoot'),
          seats: seatWords(car.seats, t),
        },
    pause:
      pause.id === null || !pause.available
        ? null
        : {
            id: pause.id,
            label: t(charging ? 'car.action.pause' : 'car.action.resume'),
            line: !charging
              ? t('car.action.paused')
              : charger.power === null || charger.power <= 0
                ? ''
                : t('car.charger.kw', {n: fmt.fixed(charger.power, 1)}),
            paused: !charging,
          },
    honk: car.honkButton === null ? null : {id: car.honkButton, label: t('car.comfort.honk')},
  };
}

/** The status as the charger line says it: the catalog's word for a status it knows, else the sensor's own text in lower case; `unavailable` while there is none. */
function statusWord(status: string | null, t: Translate): string {
  if (status === null) return t('car.charger.status', {id: 'unavailable', raw: ''});
  const key = chargerStatusKey(status);
  return t('car.charger.status', {id: key ? key.slice(STATUS_PREFIX.length) : 'other', raw: status.toLowerCase()});
}

/** The charger's card: its line, the current limit and the lock (the charge limit is the summary's, the pause the actions row's), or one line while it does not answer. Null while the house has no car. */
export function chargerControls(inputs: CarFeatureInputs, {t, fmt, overlay}: ControlsDeps): ChargerView | null {
  const {car, charger} = inputs;
  if (!car) return null;
  const {amps, lock} = charger;
  const current = amps.id === null ? amps.value : overlay(K.amps(amps.id), amps.value);
  const steps = AMPS_STEPS.filter(a => a >= amps.min && a <= amps.max);
  const rounded = current === null ? null : Math.round(current);
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
    lock: {
      id: lock.id,
      title: t('car.charger.lock'),
      line: t(locked ? 'car.charger.locked' : 'car.charger.unlocked'),
      on: locked,
      disabled: !lock.available,
      label: t('car.charger.lock'),
    },
    available: amps.available || lock.available,
    unavailable: {
      title: t('car.charger.unavailableTitle'),
      // the time it stopped answering, as a date and a time: the view reads no clock, so it cannot say "2 h ago"
      line:
        charger.statusSince === null
          ? t('car.charger.unavailableLine')
          : t('car.charger.unavailableSince', {
              date: fmt.date(charger.statusSince),
              time: fmt.time(charger.statusSince),
            }),
    },
  };
}

/** The seat line: how the front seats heat or cool with a remote start, from the select's `heated2`, `cooled1`; `''` for any other state. */
function seatWords(seats: string | null, t: Translate): string {
  const heat = /heated(\d)/.exec(seats ?? '');
  if (heat) return t('car.comfort.seatHeat', {level: heat[1]});
  const cool = /cooled(\d)/.exec(seats ?? '');
  return cool ? t('car.comfort.seatCool', {level: cool[1]}) : '';
}

/** The departure row: one button that opens the editor, saying what Ford saved and whether it is on (HIG, Lists and tables: a row navigates or toggles, not both). */
export interface DepartureRowView {
  title: string;
  line: string;
}

/** The departure editor (a sheet with Cancel and Save, HIG Sheets): the switch, the time, the cabin to choose and the days as a checkmark list. */
export interface DepartureEditorView {
  title: string;
  /** The first row, a switch that acts at once (not on Save): the entity it turns, what a screen reader calls it, whether it is on and whether the car has it. */
  departure: {id: string; label: string; on: boolean; disabled: boolean};
  cancel: string;
  save: string;
  /** Whether Save can be pressed; `reason` says what is missing while it cannot. */
  canSave: boolean;
  reason: string;
  /** Whether the rows below the switch answer a tap: not while the car's switch is there and off (Ford keeps no schedule then); a car with no switch has none that is off. */
  live: boolean;
  /** `value` is the input's `HH:MM`; `shown` is the same time in the house's format (`8:30 am`), what the row reads. */
  time: {label: string; value: string; shown: string};
  cabin: {
    label: string;
    options: ChoiceView[];
    chosen: CabinTemperature | undefined;
    choose: string;
    /** what the row reads: the chosen cabin's name, or `choose` while none is */ shown: string;
  };
  repeat: string;
  days: {day: string; name: string; checked: boolean}[];
  foot: string;
}

export interface DepartureView {
  car: CarRef;
  row: DepartureRowView;
  editor: DepartureEditorView;
}

/** The departure row from what Ford saved, and its editor from `draft`, what the person edits and has not saved. Null while the house has no car. */
export function departureControls(
  inputs: CarFeatureInputs,
  draft: ScheduleDraft,
  {t, fmt, overlay}: ControlsDeps,
): DepartureView | null {
  const {car, ref} = inputs;
  if (!car || !ref) return null;
  const depId = ref.id('switch', 'departuretimes');
  const on = overlay(K.departure(depId), car.departureOn === true);
  const problem = validate(draft);
  const cabins: ChoiceView[] = [
    {value: 'low', label: t('car.comfort.cool')},
    {value: 'medium', label: t('car.comfort.medium')},
    {value: 'high', label: t('car.comfort.warm')},
    {value: 'off', label: t('car.off')},
  ];
  return {
    car: ref,
    row: {
      title: t('car.departure.title'),
      line: t('car.departure.line', {
        schedule: car.schedule
          ? capitalise(scheduleWords(draftFromSchedule(car.schedule), fmt, t))
          : t('car.departure.none'),
        state: t(on ? 'car.departure.on' : 'car.departure.off'),
      }),
    },
    editor: {
      title: t('car.departure.title'),
      departure: {id: depId, label: t('car.comfort.departure'), on, disabled: !car.departureAvailable},
      cancel: t('car.action.cancel'),
      save: t('car.departure.save'),
      canSave: problem === null,
      reason: problem === null ? '' : t(problem),
      live: on || !car.departureAvailable,
      time: {label: t('car.departure.time'), value: draft.time, shown: clockWords(draft.time, fmt)},
      cabin: {
        label: t('car.departure.cabin'),
        options: cabins,
        chosen: draft.temp ?? undefined,
        choose: t('car.departure.choose'),
        shown: cabins.find(({value}) => value === draft.temp)?.label ?? t('car.departure.choose'),
      },
      repeat: t('car.departure.repeat'),
      days: DAYS.map(day => ({day, name: t('car.departure.every', {day}), checked: draft.days.includes(day)})),
      foot: t('car.departure.foot'),
    },
  };
}
