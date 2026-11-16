// The FordPass car, found by its entity ids and read into the inputs the Car feature takes: the charge, the plug, the tires, the doors, Ford's messages and the departure schedule.
// Pattern: an adapter below the features (ADR 0025), by convention over configuration: the car is `sensor.fordpass_<name>_soc` and every other entity is `<domain>.fordpass_<name>_<key>`;
// the rules are those of the legacy `findCar`, `carName` and `carState` (deleted in #251), `renderCarSheetLive` and `plugStamp` (#252) and `schedText`, which now reads it (#269 deletes that), with Ford's malformed dates guarded where the legacy `asDate` guarded them.
// Must not: word anything a person reads (the name Ford does not give is `''`, and the model words "Car"), read the clock, the registry or the DOM, or send a command.
import {isRecord, type ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import type {Names} from '../core/i18n/names.ts';
import {
  attributeOf,
  isAvailable,
  numberAttributeOf,
  numberOf,
  switchOf,
  textAttributeOf,
  textOf,
  type SwitchState,
} from '../core/states.ts';

/** `sensor.fordpass_<name>_soc`: the one entity that says a FordPass car is there. */
const SOC_SENSOR = /^sensor\.fordpass_[a-z0-9]+_soc$/;
const SENSOR_PREFIX = 'sensor.';
const SOC_SUFFIX = '_soc';
/** What Ford calls the vehicle's picture entity, which the car's own name is read from. */
const PICTURE_SUFFIX = /\s*Vehicle Picture$/i;

/** The car's entities: its prefix, and the id of one of them. */
export interface CarRef {
  /** `fordpass_<name>`. */
  prefix: string;
  /** `sensor.fordpass_<name>_soc` for `('sensor', 'soc')`. */
  id(domain: string, key: string): string;
}

/** The car at these states, by the first `sensor.fordpass_<name>_soc`; null when the house has none. */
export function findCar(states: HassEntities): CarRef | null {
  const soc = Object.keys(states).find(id => SOC_SENSOR.test(id));
  if (!soc) return null;
  const prefix = soc.slice(SENSOR_PREFIX.length, -SOC_SUFFIX.length);
  return {prefix, id: (domain, key) => `${domain}.${prefix}_${key}`};
}

/** Every entity `readCar` reads, as `[domain, key]`: what a pane subscribes to, so a test pins the list to the reads (it records them). */
const CAR_ENTITIES: readonly (readonly [string, string])[] = [
  ['sensor', 'soc'],
  ['sensor', 'elveh'],
  ['sensor', 'elvehcharging'],
  ['sensor', 'elvehplug'],
  ['sensor', 'doorstatus'],
  ['sensor', 'windowposition'],
  ['sensor', 'alarm'],
  ['sensor', 'gearleverposition'],
  ['sensor', 'tirepressure'],
  ['sensor', 'battery'],
  ['sensor', 'lastfirmwareupdate'],
  ['sensor', 'lastrefresh'],
  ['sensor', 'cabintemperature'],
  ['sensor', 'outsidetemp'],
  ['sensor', 'odometer'],
  ['sensor', 'messages'],
  ['sensor', 'energytransferlogentry'],
  ['sensor', 'departureschedules'],
  ['number', 'globalaccurrentlimit'],
  ['lock', 'doorlock'],
  ['device_tracker', 'tracker'],
  ['switch', 'autosoftwareupdates'],
  ['switch', 'departuretimes'],
  ['switch', 'ignition'],
  ['switch', 'rccdefrostfront'],
  ['switch', 'rccdefrostrear'],
  ['switch', 'rccsteeringwheel'],
  ['select', 'rcctemperature'],
  ['select', 'rccseatfrontleft'],
  ['button', 'hafdefault'],
  ['button', 'hafshort'],
  ['image', 'vehicleimage'],
];

/** The ids of every entity `readCar` reads. */
export const carEntityIds = (ref: CarRef): string[] => CAR_ENTITIES.map(([domain, key]) => ref.id(domain, key));

export interface TirePressure {
  /** Pounds per square inch, unrounded; null when Ford sent no number. */
  psi: number | null;
  /** Ford's word for the tire (`NORMAL`, `LOW`, ...), as it sent it; null when it sent none. */
  state: string | null;
}

/** One of Ford's messages: the subject, the body and when it was created; a date Ford sent as something else is null. */
export interface FordMessage {
  subject: string;
  body: string;
  created: number | null;
}

/** What Ford reports of the last time the car was plugged in; each missing or malformed field is null, so a plug-in with no plug-out still reads. */
export interface LastPlug {
  plugIn: number | null;
  plugOut: number | null;
  firstSoc: number | null;
  lastSoc: number | null;
  rangeAddedKm: number | null;
  /** In hours. */
  pluggedHours: number | null;
}

/** The departure schedule Ford saved: the days it names, in Ford's order, and the one time of day it keeps for them (the first day's). */
export interface Schedule {
  days: string[];
  hours: number;
  minutes: number;
}

export interface CarInputs {
  /** The config's name, else the picture entity's name without "Vehicle Picture"; `''` when neither says (the model words "Car"). */
  name: string;
  /** The vehicle picture's URL, as Home Assistant proxies it; null when the car has none. */
  picture: string | null;
  /** The config's body colour for the drawn car. */
  color: string | null;
  soc: number | null;
  /** The charge sensor has a value, a number or not: without one, the Status checks say "Car not reporting". */
  socReporting: boolean;
  /** The `soc` sensor's `batteryRange`, else the `elveh` sensor's state. */
  range: number | null;
  /** The charge limit, in percent (`globalAcTargetSoc`); null when Ford sends none. */
  limit: number | null;
  /** The cable is in: the plug sensor reads anything but `DISCONNECTED`. */
  plugged: boolean;
  /** The charging sensor says `CHARGING` and not `NOT_CHARGING`. */
  charging: boolean;
  chargingKw: number | null;
  /** The charge's power in kW from the first charging attribute that names a power or kW, as the live pill reads it when the Wallbox says none. */
  chargePowerKw: number | null;
  /**
   * Ford's own estimates of the charge's end, in its attributes' order: a date in an attribute that names an end, a completion or a
   * remainder (`at`, whether past or not), or a number of minutes in one that names minutes or a remainder (`minutes`, 0 to 3,000).
   */
  chargeEstimates: ChargeEstimate[];
  /** When the plug sensor last changed, so when the cable went in or out; null when it has no value. */
  plugChangedAt: number | null;
  /** The charging sensor's state, as Ford words it; null when it reads nothing. */
  chargeState: string | null;
  locked: boolean | null;
  /** The door lock's state (`locked`, `unlocked`, `jammed`, ...); null when it has no value. */
  lockState: string | null;
  /** At home by the tracker; null when the tracker reads nothing. */
  home: boolean | null;
  /** The tracker's state (`home`, `not_home` or a zone's name); null when it reads nothing. */
  tracker: string | null;
  /** When the car last checked in, in milliseconds; null when the sensor reads no date. */
  lastRefresh: number | null;
  battery: {
    remainingKwh: number | null;
    capacityKwh: number | null;
    temperature: number | null;
    fullRangeKm: number | null;
  };
  /** The car's AC current limit in amps: the number entity, else the charging sensor's attribute. */
  acLimit: number | null;
  cabin: number | null;
  outsideTemp: number | null;
  tires: {frontLeft: TirePressure; frontRight: TirePressure; rearLeft: TirePressure; rearRight: TirePressure};
  /** The Status checks' "Tire pressure low": the sensor has a value and says anything but `NORMAL_OPERATION`, or a tire's `<tire>_state` is set and is not `NORMAL`. */
  tiresLow: boolean;
  doors: {
    /** The four doors are closed (one Ford does not report counts as closed); null when the door sensor reads nothing. */
    closed: boolean | null;
    /** The keys of the doors Ford says are open or ajar, in its order. */
    open: string[];
    /** The hood and the tailgate are closed; null when the door sensor reads nothing. */
    hoodTailgateClosed: boolean | null;
  };
  /** The windows are closed; null when the window sensor reads nothing. */
  windowsClosed: boolean | null;
  /** The alarm sensor's state (`DISARMED`, ...); null when it reads nothing. */
  alarm: string | null;
  /** The gear lever's state (`PARK`, ...); null when it reads nothing. */
  gear: string | null;
  odometer: number | null;
  battery12: {percent: number | null; volts: number | null};
  /** The last firmware update; null when the car has no such sensor. `since` is null when the sensor's state is no date. */
  firmware: {version: string | null; since: number | null} | null;
  autoUpdates: boolean | null;
  /** Ford's messages, the first three. */
  messages: FordMessage[];
  /** Null when Ford has reported no plug-in. */
  lastPlug: LastPlug | null;
  schedule: Schedule | null;
  /** The departure switch is on; null when it reads nothing. */
  departureOn: boolean | null;
  /** The departure switch is in the states with a value, which the schedule's controls need. */
  departureAvailable: boolean;
  comfort: {ignition: SwitchState; defrostFront: SwitchState; defrostRear: SwitchState; wheel: SwitchState};
  /** The remote start's cabin setting (`rcctemperature`'s state), as Ford words it; null when it reads nothing. */
  remoteCabin: string | null;
  /** The front left seat's remote-start setting (`heated1`, `cooled2`, ...); null when it reads nothing. */
  seats: string | null;
  /** The entity id of the button that honks and flashes; null when the car has neither. */
  honkButton: string | null;
  /** The door lock has a value, so lock and unlock can be sent. */
  lockAvailable: boolean;
}

/** Ford reports `3.02 bar`, `302 kPa` or `43.8 psi` by Home Assistant's unit system, and sometimes a bare number. */
const PRESSURE = /(-?[\d.]+)\s*([a-z]*)/i;
const PSI_PER_BAR = 14.5038;
const PSI_PER_KPA = 0.145038;
const PA_PER_PSI = 6894.757;
/** The sizes a bare number is guessed from: over 1,000 is pascals, over 100 kilopascals, under 10 bars, else psi. */
const GUESS_PA_ABOVE = 1000;
const GUESS_KPA_ABOVE = 100;
const GUESS_BAR_BELOW = 10;

/** A tire's pressure in psi from whatever Ford sent: by its unit (psi, bar, kPa, Pa), else guessed by size; null when there is no number in it. */
export function tirePsi(raw: unknown): number | null {
  const match = (typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '').match(PRESSURE);
  if (!match) return null;
  const value = +match[1];
  const unit = match[2].toLowerCase();
  let psi: number;
  if (unit === 'psi') psi = value;
  else if (unit === 'bar') psi = value * PSI_PER_BAR;
  else if (unit === 'kpa') psi = value * PSI_PER_KPA;
  else if (unit === 'pa') psi = value / PA_PER_PSI;
  else if (value > GUESS_PA_ABOVE) psi = value / PA_PER_PSI;
  else if (value > GUESS_KPA_ABOVE) psi = value * PSI_PER_KPA;
  else if (value < GUESS_BAR_BELOW) psi = value * PSI_PER_BAR;
  else psi = value;
  return Number.isFinite(psi) ? psi : null;
}

/** A value Home Assistant gave as a date (text or milliseconds) in milliseconds; null when it is missing or not a date (the formatters throw on an invalid one). */
const asTime = (value: unknown): number | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

/** A field of Ford's JSON as text; `''` when it is not text. */
const textOfField = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A field of Ford's JSON as a number; null when it is not a finite one. */
const numberOfField = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** The hour or the minute of a time of day, `0` where Ford sends none (the legacy `t0.hours || 0`). */
const partOfTime = (value: unknown): number => Number(value) || 0;

/** The departure schedule Ford saved (`schedule`, days with a `timeOfDay`); null when it has none. Read by `readCar` and, for the header's upcoming list, by the legacy `schedText`. */
export function departureSchedule(states: HassEntities, ref: CarRef): Schedule | null {
  const saved = attributeOf(states, ref.id('sensor', 'departureschedules'), 'schedule');
  const days = isRecord(saved) ? Object.keys(saved) : [];
  if (!days.length) return null;
  const first = (saved as Record<string, unknown>)[days[0]];
  const timeOfDay = isRecord(first) && isRecord(first.timeOfDay) ? first.timeOfDay : {};
  return {days, hours: partOfTime(timeOfDay.hours), minutes: partOfTime(timeOfDay.minutes)};
}

/** Ford's messages: the first three; a message whose date is not one has no date, and one that is not an object says nothing. */
function messagesOf(states: HassEntities, ref: CarRef): FordMessage[] {
  const json = attributeOf(states, ref.id('sensor', 'messages'), 'json_src');
  if (!Array.isArray(json)) return [];
  return json.slice(0, 3).map(item => {
    const message = isRecord(item) ? item : {};
    const created = message.createdDate;
    return {
      subject: textOfField(message.messageSubject),
      body: textOfField(message.messageBody),
      // Ford's text is not always a date: a string is parsed as one, and what does not parse is tried as it came (a number of milliseconds)
      created: created ? asTime((typeof created === 'string' && Date.parse(created)) || created) : null,
    };
  });
}

/** The last plug-in, from `energytransferlogentry`'s `plugDetails` and `stateOfCharge`; null when Ford reports none. */
function lastPlugOf(states: HassEntities, ref: CarRef): LastPlug | null {
  const log = ref.id('sensor', 'energytransferlogentry');
  const details = attributeOf(states, log, 'plugDetails');
  if (!isRecord(details)) return null;
  const soc = attributeOf(states, log, 'stateOfCharge');
  const charge = isRecord(soc) ? soc : {};
  const plugged = numberOfField(details.totalPluggedInTime);
  return {
    plugIn: asTime(details.plugInTime),
    plugOut: asTime(details.plugOutTime),
    firstSoc: numberOfField(charge.firstSOC),
    lastSoc: numberOfField(charge.lastSOC),
    rangeAddedKm: numberOfField(details.totalDistanceAdded),
    // an hour count of zero reads as none, as the legacy panel drew a dash for it
    pluggedHours: plugged ? plugged / 3600 : null,
  };
}

/** The four doors, the hood and the tailgate from `doorstatus`'s attributes: which are open or ajar, and whether the doors and the hood and tailgate are closed; all unknown while the sensor has no value. */
function doorsOf(states: HassEntities, ref: CarRef): CarInputs['doors'] {
  const doorStatus = ref.id('sensor', 'doorstatus');
  if (!isAvailable(states[doorStatus])) return {closed: null, open: [], hoodTailgateClosed: null};
  // a door Ford does not report is closed (the legacy `door == null`)
  const doorClosed = (key: string) => {
    const door = attributeOf(states, doorStatus, key);
    return door == null || door === 'CLOSED';
  };
  return {
    closed: ['driverFront', 'passengerFront', 'rearLeft', 'rearRight'].every(doorClosed),
    open: Object.entries(states[doorStatus].attributes)
      .filter(([, value]) => value === 'OPEN' || value === 'AJAR')
      .map(([key]) => key),
    hoodTailgateClosed: doorClosed('hood') && doorClosed('tailgate'),
  };
}

/** The software: its version from `lastfirmwareupdate`'s attributes and the day of the update from its state; null when the car has no such sensor, a null day while the sensor has no value. */
function firmwareOf(states: HassEntities, ref: CarRef): CarInputs['firmware'] {
  const id = ref.id('sensor', 'lastfirmwareupdate');
  const firmware = states[id];
  if (!firmware) return null;
  return {
    version: textAttributeOf(states, id, 'firmwareVersion') || null,
    since: isAvailable(firmware) ? asTime(firmware.state) : null,
  };
}

/** The first of the car's two honk buttons that Home Assistant has a value for (an `unknown` one counts: a button has no state to read). */
function honkButtonOf(states: HassEntities, ref: CarRef): string | null {
  const ids = [ref.id('button', 'hafdefault'), ref.id('button', 'hafshort')];
  return ids.find(id => states[id] !== undefined && states[id].state !== 'unavailable') ?? null;
}

/** An attribute of the charging sensor that holds the charge's power: the legacy `liveActs`'s rule (#256 deletes it). */
const CHARGE_POWER_KEY = /charg.*(power|kw)$/i;

function chargePowerOf(states: HassEntities, id: string): number | null {
  const attributes = states[id]?.attributes ?? {};
  const key = Object.keys(attributes).find(name => CHARGE_POWER_KEY.test(name));
  const kw = key === undefined ? NaN : Number(attributes[key]);
  return Number.isFinite(kw) ? kw : null;
}

/** One of Ford's estimates of when the charge ends. */
type ChargeEstimate = {at: number} | {minutes: number};

/** The attributes that may estimate the end, and the ones of those that count minutes: the legacy `liveActs`'s rule (#256 deletes it). */
const ESTIMATE_KEY = /(end|complete|full|remain)/i;
const MINUTES_KEY = /(minutes|remain|to.?full)/i;
const DATE_IN = /\d{4}-\d\d-\d\d/;
/** Over this many minutes is no estimate (Ford sends 3,000 and more for "unknown"). */
const MAX_ESTIMATE_MINUTES = 3000;

function chargeEstimatesOf(states: HassEntities, id: string): ChargeEstimate[] {
  const attributes = states[id]?.attributes ?? {};
  return Object.entries(attributes).flatMap(([key, value]): ChargeEstimate[] => {
    if (!ESTIMATE_KEY.test(key)) return [];
    const at = typeof value === 'string' && DATE_IN.test(value) ? Date.parse(value) : NaN;
    if (Number.isFinite(at)) return [{at}];
    const minutes = Number(value);
    return MINUTES_KEY.test(key) && Number.isFinite(minutes) && minutes > 0 && minutes < MAX_ESTIMATE_MINUTES
      ? [{minutes}]
      : [];
  });
}

/** Ford's words for tires at their normal pressure: the sensor's and each tire's. */
const TIRES_NORMAL = 'NORMAL_OPERATION';
const TIRE_NORMAL = 'NORMAL';
const TIRE_KEYS = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const;

/** The legacy `attention()`'s tire rule (#256 deletes it): any set `<tire>_state` other than `NORMAL` counts, whatever its type. */
function tiresLowOf(states: HassEntities, id: string): boolean {
  const status = textOf(states, id);
  if (status === null) return false;
  return (
    status !== TIRES_NORMAL ||
    TIRE_KEYS.some(key => {
      const state = attributeOf(states, id, `${key}_state`);
      return !!state && state !== TIRE_NORMAL;
    })
  );
}

/** The car at these states; `config` gives the name and the colour the house chose, and `names` the picture entity's own name. */
export function readCar(
  states: HassEntities,
  config: Pick<ResolvedConfig, 'car'>,
  names: Names,
  ref: CarRef,
): CarInputs {
  const sensor = (key: string) => ref.id('sensor', key);
  const charging = sensor('elvehcharging');
  const elveh = sensor('elveh');
  const tirePressure = sensor('tirepressure');
  const tire = (key: string): TirePressure => ({
    psi: tirePsi(attributeOf(states, tirePressure, key)),
    state: textAttributeOf(states, tirePressure, `${key}_state`) || null,
  });
  const lock = ref.id('lock', 'doorlock');
  const tracker = textOf(states, ref.id('device_tracker', 'tracker'));
  const lastRefresh = textOf(states, sensor('lastrefresh'));
  const plug = textOf(states, sensor('elvehplug'));
  const chargeState = textOf(states, charging);
  const windows = textOf(states, sensor('windowposition'));
  const autoUpdates = textOf(states, ref.id('switch', 'autosoftwareupdates'));
  const departure = states[ref.id('switch', 'departuretimes')];
  const pictureName = names.name(ref.id('image', 'vehicleimage'), '').replace(PICTURE_SUFFIX, '');
  return {
    name: config.car.name || pictureName,
    picture: textAttributeOf(states, ref.id('image', 'vehicleimage'), 'entity_picture') || null,
    color: config.car.color,
    soc: numberOf(states, sensor('soc')),
    socReporting: textOf(states, sensor('soc')) !== null,
    range: numberAttributeOf(states, sensor('soc'), 'batteryRange') ?? numberOf(states, elveh),
    limit: numberAttributeOf(states, charging, 'globalAcTargetSoc'),
    plugged: plug !== null && plug !== 'DISCONNECTED',
    charging: chargeState !== null && /CHARGING/.test(chargeState) && !/NOT/.test(chargeState),
    chargingKw: numberAttributeOf(states, charging, 'chargingkW'),
    chargePowerKw: chargePowerOf(states, charging),
    chargeEstimates: chargeEstimatesOf(states, charging),
    plugChangedAt: plug === null ? null : asTime(states[sensor('elvehplug')].last_changed),
    chargeState,
    locked: isAvailable(states[lock]) ? states[lock].state === 'locked' : null,
    lockState: textOf(states, lock),
    home: tracker === null ? null : tracker === 'home',
    tracker,
    lastRefresh: lastRefresh === null ? null : asTime(lastRefresh),
    battery: {
      remainingKwh: numberAttributeOf(states, elveh, 'batteryEnergyRemaining'),
      capacityKwh: numberAttributeOf(states, elveh, 'maximumBatteryCapacity'),
      temperature: numberAttributeOf(states, charging, 'batteryTemperature'),
      fullRangeKm: numberAttributeOf(states, elveh, 'maximumBatteryRange'),
    },
    acLimit:
      numberOf(states, ref.id('number', 'globalaccurrentlimit')) ??
      numberAttributeOf(states, charging, 'globalAcCurrentLimit'),
    cabin: numberOf(states, sensor('cabintemperature')),
    outsideTemp: numberOf(states, sensor('outsidetemp')),
    tires: {
      frontLeft: tire('frontLeft'),
      frontRight: tire('frontRight'),
      rearLeft: tire('rearLeft'),
      rearRight: tire('rearRight'),
    },
    tiresLow: tiresLowOf(states, tirePressure),
    doors: doorsOf(states, ref),
    windowsClosed: windows === null ? null : windows === 'Closed',
    alarm: textOf(states, sensor('alarm')),
    gear: textOf(states, sensor('gearleverposition')),
    odometer: numberOf(states, sensor('odometer')),
    battery12: {
      percent: numberOf(states, sensor('battery')),
      volts: numberAttributeOf(states, sensor('battery'), 'batteryVoltage'),
    },
    firmware: firmwareOf(states, ref),
    autoUpdates: autoUpdates === null ? null : autoUpdates === 'on',
    messages: messagesOf(states, ref),
    lastPlug: lastPlugOf(states, ref),
    schedule: departureSchedule(states, ref),
    departureOn: isAvailable(departure) ? departure.state === 'on' : null,
    departureAvailable: isAvailable(departure),
    comfort: {
      ignition: switchOf(states, ref.id('switch', 'ignition')),
      defrostFront: switchOf(states, ref.id('switch', 'rccdefrostfront')),
      defrostRear: switchOf(states, ref.id('switch', 'rccdefrostrear')),
      wheel: switchOf(states, ref.id('switch', 'rccsteeringwheel')),
    },
    remoteCabin: textOf(states, ref.id('select', 'rcctemperature')),
    seats: textOf(states, ref.id('select', 'rccseatfrontleft')),
    honkButton: honkButtonOf(states, ref),
    lockAvailable: isAvailable(states[lock]),
  };
}
