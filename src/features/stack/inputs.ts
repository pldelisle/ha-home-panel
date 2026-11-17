// readStack: what the smart stack's rules read of the house, composed from the providers at one instant.
// Pattern: a composition of readers at one place (ADR 0025), as `readLive` is for the header: the door sensors, the light areas, the
// weather alerts and forecast, the car, who's home and the frozen trackers, the sun, the peaks, the power, the speakers, today's events,
// Away, the rooms' air and the stack's own history. This is the one file that knows which providers the stack reads.
// Must not: import another feature, word anything a person reads, read the clock (`now` is passed in), or touch the DOM or `hass`.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities, PanelHass, Registries} from '../../core/hass.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Names} from '../../core/i18n/names.ts';
import {sunTimes, type SunTimes} from '../../core/sun.ts';
import {DAY_MS} from '../../core/figures.ts';
import {attributeOf, isAvailable, textAttributeOf} from '../../core/states.ts';
import {rateRoom, type RoomRating} from '../../providers/air-quality.ts';
import {todaysEvents} from '../../providers/calendar.ts';
import {doorMotionSensors, type SensorInputs} from '../../providers/door-motion.ts';
import {foldForecastDays, readAlerts} from '../../providers/environment-canada.ts';
import {findCar, readCar, type CarInputs} from '../../providers/fordpass.ts';
import {hiloChallenge, type HiloChallenge} from '../../providers/hilo.ts';
import {hydroQuebec, type HydroQuebecInputs} from '../../providers/hydro-quebec.ts';
import {lightAreas} from '../../providers/light-areas.ts';
import {speakers} from '../../providers/media-players.ts';
import {milaRooms} from '../../providers/mila.ts';
import {frozenPresence, presence, type FrozenTracker, type Person} from '../../providers/people.ts';
import {powerNow, type PowerNow} from '../../providers/power.ts';
import type {FlowRow, MeterTotals} from '../../providers/power-history.ts';
import {forecastTime, type ForecastDay, type ForecastEntry, type WeatherAlert} from '../../providers/weather-source.ts';

/** One light tile as the stack reads it: its name, its lights that stopped answering and since when, and whether any is on. */
export interface StackLightArea {
  name: string;
  /** The tile's lights that are `unavailable`, each with its `last_changed` in milliseconds. */
  unavailable: {id: string; since: number}[];
  on: boolean;
}

/** The speaker that is playing, as the now-playing card shows it. */
export interface NowPlaying {
  /** The area's name, else the speaker's own. */
  place: string;
  picture: string | null;
  title: string | null;
  /** The artist, else the app's name; null when neither says. */
  artist: string | null;
}

/** One of today's events as the agenda card shows it. */
export interface StackEvent {
  /** The event's title, else the calendar's name. */
  title: string;
  start: number;
  allDay: boolean;
}

/** What the stack's history gives the Energy-today filler: today's hours of the flow and the meter's total for today. */
export interface StackHistoryData {
  /** When it was derived. */
  at: number;
  flow: FlowRow[];
  totals: MeterTotals;
}

export interface StackInputs {
  /** The instant the rules are read at, in milliseconds. */
  now: number;
  stack: ResolvedConfig['stack'];
  /** The door sensors (not the motion ones), by name. */
  doors: SensorInputs[];
  lights: StackLightArea[];
  alerts: WeatherAlert[];
  car: CarInputs | null;
  people: Person[];
  frozen: FrozenTracker[];
  /** Today's and tomorrow's sun at the house. */
  sun: {today: SunTimes; tomorrow: SunTimes};
  hydroQuebec: HydroQuebecInputs | null;
  challenge: HiloChallenge | null;
  power: PowerNow;
  playing: NowPlaying | null;
  events: StackEvent[];
  /** The Away switch; null when the config names none or it reads nothing. */
  away: {on: boolean; since: number} | null;
  air: {name: string; rating: RoomRating}[];
  /** The forecast, one row per local day. */
  forecast: ForecastDay[];
  /** Tonight's condition: the night entry of today's forecast; null when there is none. */
  tonight: string | null;
  history: StackHistoryData | null;
}

/** What `readStack` takes besides the states: the instant, the formatters' days, the house's place, the forecast and the history. */
export interface StackReading {
  now: number;
  fmt: Pick<Formatters, 'isoDay'>;
  location: Pick<PanelHass['config'], 'latitude' | 'longitude'>;
  forecast: ForecastEntry[];
  history: StackHistoryData | null;
}

const ms = (iso: string): number => Date.parse(iso);

/** Each light tile's unanswering lights and whether one is on. */
function lightsOf(
  states: HassEntities,
  registries: Registries,
  names: Names,
  config: ResolvedConfig,
): StackLightArea[] {
  return lightAreas(states, registries, names, config).map(area => ({
    name: area.name,
    unavailable: area.ids
      .filter(id => states[id]?.state === 'unavailable')
      .map(id => ({id, since: ms(states[id].last_changed)})),
    on: area.ids.some(id => states[id]?.state === 'on'),
  }));
}

/** The first speaker that is playing, its place named as the legacy panel named it. */
function playingOf(states: HassEntities, registries: Registries, names: Names): NowPlaying | null {
  const tv = findTvId(states, registries);
  const speaker = speakers(states, registries, names, tv).find(s => states[s.id]?.state === 'playing');
  if (!speaker) return null;
  const {id, areaId, name} = speaker;
  return {
    place: registries.areas?.[areaId]?.name ? names.name(areaId) : name,
    picture: textAttributeOf(states, id, 'entity_picture'),
    title: textAttributeOf(states, id, 'media_title'),
    artist: textAttributeOf(states, id, 'media_artist') || textAttributeOf(states, id, 'app_name'),
  };
}

/**
 * The television the speakers leave out: the visible `device_class: tv` player, a Samsung one first. The legacy `tv()` rule, which
 * the speakers' reading has always been given; Media's `findTv` is the same rule over its sources, but a feature never imports another.
 */
function findTvId(states: HassEntities, registries: Registries): string | null {
  const tvs = Object.keys(states).filter(
    id =>
      id.startsWith('media_player.') &&
      attributeOf(states, id, 'device_class') === 'tv' &&
      !registries.entities?.[id]?.hidden,
  );
  return tvs.find(id => registries.entities?.[id]?.platform === 'samsungtv') ?? tvs[0] ?? null;
}

/** The night entry of `today`'s forecast, the legacy `wxDays`' `night`: the last one listed. */
function tonightOf(entries: ForecastEntry[], today: string, isoDay: (at: number) => string): string | null {
  const nights = entries.filter(e => e.is_daytime === false && isoDay(forecastTime(e)) === today);
  return nights.at(-1)?.condition ?? null;
}

/** The inputs of the house at these states, at `reading.now`. */
export function readStack(
  states: HassEntities,
  registries: Registries,
  config: ResolvedConfig,
  names: Names,
  reading: StackReading,
): StackInputs {
  const {now, fmt, location, forecast, history} = reading;
  const car = findCar(states);
  const today = fmt.isoDay(now);
  const {latitude = 0, longitude = 0} = location;
  const away = config.entities.away;
  return {
    now,
    stack: config.stack,
    doors: doorMotionSensors(states, registries, names).filter(s => s.kind === 'door'),
    lights: lightsOf(states, registries, names, config),
    alerts: readAlerts(states, config.entities),
    car: car ? readCar(states, config, names, car) : null,
    people: presence(states, registries, config.people),
    frozen: frozenPresence(states, registries, now),
    sun: {
      today: sunTimes(latitude, longitude, today),
      tomorrow: sunTimes(latitude, longitude, fmt.isoDay(now + DAY_MS)),
    },
    hydroQuebec: hydroQuebec(states, config),
    challenge: hiloChallenge(states, config),
    power: powerNow(states, config),
    playing: playingOf(states, registries, names),
    events: todaysEvents(states, registries, now, fmt).map(e => ({
      title: e.message ?? names.name(e.id),
      start: e.start,
      allDay: e.allDay,
    })),
    away:
      away && isAvailable(states[away])
        ? {on: states[away].state === 'on', since: ms(states[away].last_changed)}
        : null,
    air: milaRooms(states, registries, names).map(room => ({name: room.name, rating: rateRoom(room)})),
    forecast: foldForecastDays(forecast, fmt.isoDay),
    tonight: tonightOf(forecast, today, fmt.isoDay),
    history,
  };
}
