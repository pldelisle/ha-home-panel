// The Wallbox charger: its power and status for the energy card, its controls' inputs for the Car, the catalog key of each status and the charging sessions its hourly power makes.
// Pattern: an adapter below the features (ADR 0025), found by the config's keys (convention over configuration), not the registry; the reads are those of the legacy flow,
// `attention()` and `renderCarControls` (deleted in #241 and #253); `chargingSessions` is a rule over the charger's hourly rows, here and not in the Car so the live pill can ask it too (spec 22).
// The pause command is `Command` data (core), which the kit's runner sends; the Car's charging switch (since #253) and the pill's "Pause charging" (#255) both use it, so it is built once, here.
// Must not: word the status (it names the catalog key that does), send a command, import the kit, or read the registry or the clock.
import type {Command} from '../core/commands.ts';
import type {ResolvedConfig} from '../core/config.ts';
import {HOUR_MS} from '../core/figures.ts';
import type {StatisticRow} from '../core/ha.ts';
import type {HassEntities} from '../core/hass.ts';
import type {MessageKey} from '../core/i18n/en.ts';
import {overlayKey} from '../core/overlay-key.ts';
import {hasState, isAvailable, kilowattsOf, numberAttributeOf, numberOf, switchOf, textOf} from '../core/states.ts';

/** The range a charger that does not say its own current range is offered: the legacy panel's 6 to 48 amps. */
const DEFAULT_MIN_AMPS = 6;
const DEFAULT_MAX_AMPS = 48;

/** A switch or a lock as the controls read it: its entity id, whether it is on (locked), and whether Home Assistant has a value for it. */
export interface WallboxSwitch {
  /** The configured entity; null when the house has none. */
  id: string | null;
  on: boolean;
  available: boolean;
}

export interface WallboxInputs {
  /** The charger's power in kW; null when the sensor is unset or reports no number. */
  power: number | null;
  /** The status sensor's text; null when it is unset, unavailable or unknown. */
  status: string | null;
  /** The status sensor is in the states, whatever it reads: an unavailable one is the Status checks' "Wallbox offline". */
  statusPresent: boolean;
  /** The house has a charger: its power or its status sensor is in the states, whatever it reads. */
  present: boolean;
  /** The charger's current limit in amps: the `number` entity, its value and its range (6 to 48 where it says none). */
  amps: {id: string | null; value: number | null; min: number; max: number; available: boolean};
  /** The charging switch: on while it charges, off while it is paused. */
  pause: WallboxSwitch;
  /** The charger's lock: on while it is locked. */
  lock: WallboxSwitch;
  /** The price per kWh the house set for the charger; null when it set none (the models estimate at `DEFAULT_KWH_PRICE`). */
  price: number | null;
}

/** A switch or a lock with the entity it is read from. */
const switchWithId = (states: HassEntities, id: string | null): WallboxSwitch => ({id, ...switchOf(states, id)});

export function wallbox(states: HassEntities, config: ResolvedConfig): WallboxInputs {
  const {evP, wbStatus, wbAmps, wbPause, wbLock, wbPrice} = config.entities;
  return {
    power: kilowattsOf(states, evP),
    status: textOf(states, wbStatus),
    statusPresent: hasState(states, wbStatus),
    present: hasState(states, evP) || hasState(states, wbStatus),
    amps: {
      id: wbAmps,
      value: numberOf(states, wbAmps),
      // a charger that reports 0 for a bound has none: the legacy `attributes.min || 6`
      min: numberAttributeOf(states, wbAmps, 'min') || DEFAULT_MIN_AMPS,
      max: numberAttributeOf(states, wbAmps, 'max') || DEFAULT_MAX_AMPS,
      available: isAvailable(wbAmps ? states[wbAmps] : undefined),
    },
    pause: switchWithId(states, wbPause),
    lock: switchWithId(states, wbLock),
    price: numberOf(states, wbPrice),
  };
}

/** One charging session: when it began and ended (ms), the energy it delivered (kWh) and its peak power (kW). */
export interface Session {
  start: number;
  end: number;
  kwh: number;
  peak: number;
}

/** An hour is charging when the Wallbox's mean power is above this many kW. */
const CHARGING_ABOVE_KW = 0.3;
/** Hours of charging this far apart or closer are one session: a car that pauses for up to three hours and resumes. */
const JOIN_GAP_MS = 3 * HOUR_MS;
/** A session that delivered less than this many kWh is not one. */
const MIN_SESSION_KWH = 1;

/**
 * The charging sessions in the Wallbox's hourly rows (`mean` and `max` in kW, oldest first): runs of hours above 0.3 kW, joined across gaps up to
 * three hours, each ending an hour after its last hour, with the energy as the sum of the hourly means and the peak from `max`; those under 1 kWh dropped.
 * Read by the Car's history (#250) and, for the current session, by the live pill (#255).
 */
export function chargingSessions(rows: readonly StatisticRow[]): Session[] {
  const runs: {start: number; last: number; kwh: number; peak: number}[] = [];
  let current: (typeof runs)[number] | null = null;
  for (const row of rows) {
    const mean = row.mean || 0;
    if (mean <= CHARGING_ABOVE_KW) continue;
    if (current && row.start - current.last <= JOIN_GAP_MS) {
      current.last = row.start;
      current.kwh += mean;
      current.peak = Math.max(current.peak, row.max || 0);
    } else {
      current = {start: row.start, last: row.start, kwh: mean, peak: row.max || 0};
      runs.push(current);
    }
  }
  return runs
    .map(({start, last, kwh, peak}) => ({start, end: last + HOUR_MS, kwh, peak}))
    .filter(session => session.kwh >= MIN_SESSION_KWH);
}

/** The charger's statuses the catalog words, by the text the Wallbox integration gives. */
const STATUS_KEYS: ReadonlyMap<string, MessageKey> = new Map([
  ['Ready', 'energy.status.ready'],
  ['Charging', 'energy.status.charging'],
  ['Connected: waiting for car demand', 'energy.status.connectedWaitingForCar'],
  ['Waiting for car demand', 'energy.status.waitingForCar'],
  ['Connected: waiting for next schedule', 'energy.status.connectedWaitingForSchedule'],
  ['Waiting for next schedule', 'energy.status.waitingForSchedule'],
  ['Paused by user', 'energy.status.pausedByUser'],
  ['Scheduled', 'energy.status.scheduled'],
  ['Discharging', 'energy.status.discharging'],
  ['Error', 'energy.status.error'],
  ['Disconnected', 'energy.status.disconnected'],
  ['Locked', 'energy.status.locked'],
  ['Locked, car connected', 'energy.status.lockedCarConnected'],
  ['Updating', 'energy.status.updating'],
  ['Waiting', 'energy.status.waiting'],
  ['Waiting in queue by Power Sharing', 'energy.status.queuePowerSharing'],
  ['Waiting in queue by Power Boost', 'energy.status.queuePowerBoost'],
  ['Waiting in queue by Eco-Smart', 'energy.status.queueEcoSmart'],
  ['Waiting for MID failed', 'energy.status.midFailed'],
]);

/** The catalog message that words a status the Wallbox integration gives; undefined for any other, which is shown as the sensor says it. Energy's flow and the Car's card word the status so. */
export const chargerStatusKey = (status: string): MessageKey | undefined => STATUS_KEYS.get(status);

/** The overlay key of the charging switch's held value: `wallboxCommands.pause` holds it and the Car's switch reads it. */
export const pauseHold = overlayKey('pause');

/** The price per kWh the sessions are costed at when the house set none: the legacy panel's 7 cents, which Car and the live pill share. */
export const DEFAULT_KWH_PRICE = 0.07;

/** What the commands name of the charging switch: its entity id. */
export interface PauseTarget {
  id: string;
}

/** The Wallbox's commands as data: run by the Car's charger controls and, from #255, by the live pill's "Pause charging". */
export const wallboxCommands = {
  /** Turns the charging switch `on` (resumes) or off (pauses), shown at once; the toast says charging on or off. */
  pause: (target: PauseTarget, on: boolean): Command => ({
    domain: 'switch',
    service: on ? 'turn_on' : 'turn_off',
    data: {entity_id: target.id},
    done: {key: on ? 'car.chargingOn' : 'car.chargingOff'},
    holds: [pauseHold(target.id)],
  }),
};
