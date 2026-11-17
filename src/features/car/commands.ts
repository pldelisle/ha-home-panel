// The Car commands: what a tap on the charger's or the car's controls asks Home Assistant for, as `Command` data, and the departure schedule's save.
// Pattern: Command (Gamma et al.) built by pure functions; the kit's `CommandRunner` sends them, an element holds the value each `holds` key names in the panel's overlay (ADR 0023). The pause switch is
// the provider's (`wallboxCommands.pause`: the live pill runs it too). The rules are the legacy `carControl`'s, deleted in #253; the question before remote start and unlock is the element's `<hp-dialog>`.
// Must not: send anything, read the store or the clock, or word a string (`done` is a catalog key, the runner words it; a name or a time arrives already written).
import type {Command} from '../../core/commands.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {CarRef} from '../../providers/fordpass.ts';
import {wallboxCommands} from '../../providers/wallbox.ts';
import {K} from './keys.ts';
import {roundToFive, scheduleWords, type ScheduleDraft} from './schedule.ts';

/** The charger's amps, its lock or its switch, as a command names it: the entity. */
interface Target {
  id: string;
}

/** The car's three heaters, which differ only in the switch and the name the toast says. */
export type Heater = 'windshield' | 'rear' | 'wheel';

/** The key of each heater's switch, under the car's prefix. */
export const HEATER_SWITCHES: Readonly<Record<Heater, string>> = {
  windshield: 'rccdefrostfront',
  rear: 'rccdefrostrear',
  wheel: 'rccsteeringwheel',
};

/** What a schedule's toast needs to say the time and the days: the household's formatters and catalog. */
interface ScheduleWords {
  fmt: Pick<Formatters, 'clock'>;
  t: Translate;
}

const turn = (on: boolean) => (on ? 'turn_on' : 'turn_off');

/** Sets the Wallbox's current limit, which shows the new value at once. */
export const setAmps = (amps: Target, value: number): Command => ({
  domain: 'number',
  service: 'set_value',
  data: {entity_id: amps.id, value},
  holds: [K.amps(amps.id)],
  done: {key: 'car.ampsSet', values: {n: value}},
});

/** Turns the charging switch on or off, shown at once: the provider's command, which the live pill's "Pause charging" runs too. */
export const togglePause = wallboxCommands.pause;

/** Locks or unlocks the charger, shown at once. */
export const toggleChargerLock = (lock: Target, on: boolean): Command => ({
  domain: 'lock',
  service: on ? 'lock' : 'unlock',
  data: {entity_id: lock.id},
  holds: [K.chargerLock(lock.id)],
  done: {key: on ? 'car.chargerLocked' : 'car.chargerUnlocked'},
});

/** Starts the car's remote start or stops it, shown at once. The element asks first, in a dialog (ADR 0035). */
export const remoteStart = (car: CarRef, on: boolean): Command => {
  const id = car.id('switch', 'ignition');
  return {
    domain: 'switch',
    service: turn(on),
    data: {entity_id: id},
    holds: [K.ignition(id)],
    done: {key: on ? 'car.remoteStartSent' : 'car.remoteStartStopped'},
  };
};

/** Turns one of the three heaters on or off, shown at once; `name` is the heater as its button says it, which the toast repeats. */
export const toggleHeater = (car: CarRef, heater: Heater, on: boolean, name: string): Command => {
  const id = car.id('switch', HEATER_SWITCHES[heater]);
  return {
    domain: 'switch',
    service: turn(on),
    data: {entity_id: id},
    holds: [K.heater(id)],
    done: {key: on ? 'car.heaterOn' : 'car.heaterOff', values: {name}},
  };
};

/** Honks the horn and flashes the lights: presses the car's button, which has no state to show. */
export const honk = (button: Target): Command => ({
  domain: 'button',
  service: 'press',
  data: {entity_id: button.id},
  done: {key: 'car.honkSent'},
});

/** Locks the car's doors, shown at once. */
export const lockCar = (car: CarRef): Command => doors(car, true);

/** Unlocks the car's doors, shown at once. The element asks first, in a dialog (ADR 0035). */
export const unlockCar = (car: CarRef): Command => doors(car, false);

function doors(car: CarRef, locked: boolean): Command {
  const id = car.id('lock', 'doorlock');
  return {
    domain: 'lock',
    service: locked ? 'lock' : 'unlock',
    data: {entity_id: id},
    holds: [K.doorLock(id)],
    done: {key: locked ? 'car.lockSent' : 'car.unlockSent'},
  };
}

/** Turns the departure times' switch on or off, shown at once. */
export const toggleDeparture = (car: CarRef, on: boolean): Command => {
  const id = car.id('switch', 'departuretimes');
  return {
    domain: 'switch',
    service: turn(on),
    data: {entity_id: id},
    holds: [K.departure(id)],
    done: {key: on ? 'car.departureSwitchedOn' : 'car.departureSwitchedOff'},
  };
};

/**
 * Saves the departure schedule Ford keeps (the service names no entity: the integration has one schedule): the draft's days, its time in five-minute steps and its cabin setting, in one call; the toast says the days and the time that were sent.
 * A draft with no time to send is refused by `validate` before it gets here, so this throws for one rather than send `NaN` as the legacy panel did.
 */
export const saveSchedule = (draft: ScheduleDraft, {fmt, t}: ScheduleWords): Command => {
  const time = roundToFive(draft.time);
  if (!time) throw new Error('saveSchedule: a draft with no time cannot be saved; validate refuses it');
  return {
    domain: 'fordpass',
    service: 'update_departure_schedule',
    data: {
      hour: time.hour,
      minute: time.minute,
      schedule_days: [...draft.days],
      precondition_temperature: draft.temp,
    },
    done: {key: 'car.scheduleSaved', values: {when: scheduleWords({...draft, time: time.time}, fmt, t)}},
  };
};
