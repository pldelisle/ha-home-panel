// upcoming: the phone's "Coming up" list on the Home pane, what the house has planned: the sun's next two events with what they do,
// Hilo's challenge, Hydro-Québec's coming peak, the car's departure and the modes that are on (spec 24, #267). Not Automations' runs.
// Pattern: a pure view model in two halves (Meszaros' humble object): `readUpcoming` reads the states, `upcoming` words them; the
// legacy panel's `upcoming()`, which #269 deletes with the header.
// Must not: read the clock, import the DOM, Lit or a feature, or hold text the household reads (a catalog key says it).
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import type {Formatters} from '../core/i18n/format.ts';
import type {Translate} from '../core/i18n/messages.ts';
import type {Names} from '../core/i18n/names.ts';
import {isAvailable} from '../core/states.ts';
import {departureSchedule, findCar, type Schedule} from '../providers/fordpass.ts';
import {hiloChallenge} from '../providers/hilo.ts';
import {hydroQuebec} from '../providers/hydro-quebec.ts';

export interface UpcomingInputs {
  /** The sun is up, or the house has no sun: the sunset comes first. */
  day: boolean;
  /** The next sunset and sunrise in milliseconds; null when the sensor reads nothing. */
  sunset: number | null;
  sunrise: number | null;
  /** Hilo's challenge state while one is on, else null. */
  challenge: string | null;
  peakComing: boolean;
  /** The departure Ford saved, while its switch is on; else null. */
  departure: Schedule | null;
  /** The names of the config's modes that are on. */
  modes: string[];
}

/** One row: when (a time, or the source's name) and what. */
export interface UpcomingRow {
  when: string;
  what: string;
}

export interface UpcomingDeps {
  t: Translate;
  fmt: Pick<Formatters, 'time' | 'clock'>;
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const EVERY_DAY = 7;

/** The instant a sun sensor names, or null. */
function instantOf(states: HassEntities, id: string | null): number | null {
  const s = id ? states[id] : undefined;
  return isAvailable(s) ? Date.parse(s.state) : null;
}

/** What the list reads of the states. */
export function readUpcoming(states: HassEntities, config: ResolvedConfig, names: Names): UpcomingInputs {
  const {sun, setting, rising} = config.entities;
  const sunState = sun ? states[sun] : undefined;
  const challenge = hiloChallenge(states, config);
  const car = findCar(states);
  const departureOn = !!car && states[car.id('switch', 'departuretimes')]?.state === 'on';
  return {
    day: !sunState || sunState.state === 'above_horizon',
    sunset: instantOf(states, setting),
    sunrise: instantOf(states, rising),
    challenge: challenge?.active ? challenge.state : null,
    peakComing: !!hydroQuebec(states, config)?.peakUpcoming,
    departure: car && departureOn ? departureSchedule(states, car) : null,
    modes: config.modes.filter(id => states[id]?.state === 'on').map(id => names.name(id)),
  };
}

/** The departure's days and time, as the list says them: every day, weekdays, or the days' short names. */
function departureWords({days, hours, minutes}: Schedule, {t, fmt}: UpcomingDeps): string {
  const named =
    days.length === EVERY_DAY
      ? t('stack.days.every')
      : days.length === WEEKDAYS.length && WEEKDAYS.every(day => days.includes(day))
        ? t('stack.days.weekdays')
        : days.map(day => t('car.dayShort', {day})).join(', ');
  return t('stack.days.at', {days: named, time: fmt.clock(hours, minutes)});
}

/** The rows, in the legacy order: the sun's two events in the order they come, then Hilo, Hydro-Québec, the car, the modes. */
export function upcoming(inputs: UpcomingInputs, deps: UpcomingDeps): UpcomingRow[] {
  const {t, fmt} = deps;
  const sunset: UpcomingRow[] =
    inputs.sunset === null ? [] : [{when: fmt.time(inputs.sunset), what: t('home.upcoming.sunset')}];
  const sunrise: UpcomingRow[] =
    inputs.sunrise === null ? [] : [{when: fmt.time(inputs.sunrise), what: t('home.upcoming.sunrise')}];
  return [
    ...(inputs.day ? [...sunset, ...sunrise] : [...sunrise, ...sunset]),
    ...(inputs.challenge === null
      ? []
      : [
          {when: 'Hilo', what: t('home.upcoming.challenge', {phase: t('stack.peak.phase', {phase: inputs.challenge})})},
        ]),
    ...(inputs.peakComing ? [{when: 'Hydro-Québec', what: t('home.upcoming.peak')}] : []),
    ...(inputs.departure
      ? [
          {
            when: t('home.upcoming.car'),
            what: t('home.upcoming.departure', {schedule: departureWords(inputs.departure, deps)}),
          },
        ]
      : []),
    ...inputs.modes.map(name => ({when: t('home.upcoming.on'), what: name})),
  ];
}
