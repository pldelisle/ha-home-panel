// Environment Canada's sensors as a weather source: the reading, the normals, the air quality, the alerts and the fold of its
// forecast, which sends a day entry and a night entry for each day.
// Pattern: an adapter behind the WeatherSource strategy (Gamma et al.) and an anti-corruption layer (Evans); the three rules
// that are the integration's own (the fold, the alert attributes, the feels-like kind) live here, named, and the model asks.
// Must not: read the clock, format a string the household reads, or import a feature.
import type {EntityKey} from '../core/config.ts';
import {EC_SUFFIX} from '../core/entities.ts';
import type {HassEntities} from '../core/hass.ts';
import type {MessageKey} from '../core/i18n/en.ts';
import {attributeOf, numberOf, textAttributeOf, textOf} from '../core/states.ts';
import {
  forecastTime,
  type ForecastDay,
  type ForecastEntry,
  type WeatherAlert,
  type WeatherInputs,
  type WeatherSource,
} from './weather-source.ts';

// the sensors the config resolver finds by suffix under the weather entity's town: one key for each suffix it knows
const KEYS = Object.keys(EC_SUFFIX) as EntityKey[];

type Entities = Record<EntityKey, string | null>;

/**
 * Environment Canada's condition phrases (its condition sensor sends `Mainly Sunny`), each with the catalog message that words it.
 * The sensor's text is the integration's data, so the model never matches on it: this table is the anti-corruption layer's part.
 */
const CONDITION_WORDS: Readonly<Record<string, MessageKey>> = {
  sunny: 'weather.cond.sunny',
  'mainly sunny': 'weather.cond.ec.mainlySunny',
  clear: 'weather.cond.clear-night',
  'mainly clear': 'weather.cond.ec.mainlyClear',
  'partly cloudy': 'weather.cond.partlycloudy',
  'mostly cloudy': 'weather.cond.ec.mostlyCloudy',
  'mainly cloudy': 'weather.cond.ec.mainlyCloudy',
  cloudy: 'weather.cond.cloudy',
  overcast: 'weather.cond.ec.overcast',
  'a mix of sun and cloud': 'weather.cond.ec.aMixOfSunAndCloud',
  'cloudy periods': 'weather.cond.ec.cloudyPeriods',
  'a few clouds': 'weather.cond.ec.aFewClouds',
  'increasing cloudiness': 'weather.cond.ec.increasingCloudiness',
  clearing: 'weather.cond.ec.clearing',
  'light rain': 'weather.cond.ec.lightRain',
  rain: 'weather.cond.rainy',
  'heavy rain': 'weather.cond.pouring',
  'light rainshower': 'weather.cond.ec.lightRainshower',
  'rain shower': 'weather.cond.ec.rainShower',
  'rain showers': 'weather.cond.ec.rainShowers',
  'heavy rainshower': 'weather.cond.ec.heavyRainshower',
  'chance of showers': 'weather.cond.ec.chanceOfShowers',
  showers: 'weather.cond.ec.showers',
  'periods of rain': 'weather.cond.ec.periodsOfRain',
  'chance of rain': 'weather.cond.ec.chanceOfRain',
  drizzle: 'weather.cond.ec.drizzle',
  'light drizzle': 'weather.cond.ec.lightDrizzle',
  'freezing rain': 'weather.cond.ec.freezingRain',
  'light freezing rain': 'weather.cond.ec.lightFreezingRain',
  'freezing drizzle': 'weather.cond.ec.freezingDrizzle',
  'light snow': 'weather.cond.ec.lightSnow',
  snow: 'weather.cond.snowy',
  'heavy snow': 'weather.cond.ec.heavySnow',
  flurries: 'weather.cond.ec.flurries',
  'chance of flurries': 'weather.cond.ec.chanceOfFlurries',
  'light snowshower': 'weather.cond.ec.lightSnowshower',
  'snow showers': 'weather.cond.ec.snowShowers',
  'periods of snow': 'weather.cond.ec.periodsOfSnow',
  'blowing snow': 'weather.cond.ec.blowingSnow',
  'drifting snow': 'weather.cond.ec.driftingSnow',
  'snow grains': 'weather.cond.ec.snowGrains',
  'ice pellets': 'weather.cond.ec.icePellets',
  'rain and snow': 'weather.cond.snowy-rainy',
  'light rain and snow': 'weather.cond.ec.lightRainAndSnow',
  'wet snow': 'weather.cond.ec.wetSnow',
  hail: 'weather.cond.hail',
  fog: 'weather.cond.fog',
  'fog patches': 'weather.cond.ec.fogPatches',
  mist: 'weather.cond.ec.mist',
  haze: 'weather.cond.ec.haze',
  smoke: 'weather.cond.ec.smoke',
  'ice fog': 'weather.cond.ec.iceFog',
  'freezing fog': 'weather.cond.ec.freezingFog',
  thunderstorm: 'weather.cond.ec.thunderstorm',
  thunderstorms: 'weather.cond.lightning',
  'thunderstorm with light rain': 'weather.cond.ec.thunderstormWithLightRain',
  'thunderstorms and rain': 'weather.cond.lightning-rainy',
  'chance of thunderstorms': 'weather.cond.ec.chanceOfThunderstorms',
  windy: 'weather.cond.windy',
  'windy and cloudy': 'weather.cond.windy-variant',
  'unusual weather': 'weather.cond.exceptional',
  'not observed': 'weather.cond.ec.notObserved',
  'funnel cloud': 'weather.cond.ec.funnelCloud',
  dust: 'weather.cond.ec.dust',
};

/** The catalog message for a phrase of the condition sensor, or null for one this table does not know (the model then capitalises it). */
export const conditionWordsOf = (phrase: string | null): MessageKey | null =>
  (phrase && CONDITION_WORDS[phrase.trim().toLowerCase()]) || null;

/** The four alert sensors, in the order the panel lists them, with the tone each is drawn in. */
const ALERT_KINDS = [
  ['warnings', 'warning', 'crit'],
  ['watches', 'watch', 'warn'],
  ['advisories', 'advisory', 'warn'],
  ['statements', 'statement', 'ok'],
] as const satisfies readonly (readonly [EntityKey, WeatherAlert['kind'], WeatherAlert['tone']])[];

/**
 * Every alert the four sensors carry: a sensor above zero lists them in `alert_N` and `alert_time_N`; a sensor that only
 * counts gives one row with the count and no title, for the model to word.
 */
export function readAlerts(
  states: HassEntities,
  entities: Pick<Entities, 'warnings' | 'watches' | 'advisories' | 'statements'>,
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  for (const [key, kind, tone] of ALERT_KINDS) {
    const id = entities[key];
    const count = numberOf(states, id);
    if (count === null || !(count > 0)) continue;
    const before = alerts.length;
    for (let i = 1; attributeOf(states, id, `alert_${i}`) != null; i++) {
      const title = textAttributeOf(states, id, `alert_${i}`);
      alerts.push({
        kind,
        tone,
        title: title ?? '',
        count: null,
        time: textAttributeOf(states, id, `alert_time_${i}`),
      });
    }
    if (alerts.length === before) alerts.push({kind, tone, title: null, count, time: null});
  }
  return alerts;
}

/** Wind chill when the sensor has one, else the humidex, else nothing: Environment Canada reports each only when it differs from the air. */
export function feelsLike(
  states: HassEntities,
  entities: Pick<Entities, 'chill' | 'humidex'>,
): WeatherInputs['feelsLike'] {
  const chill = numberOf(states, entities.chill);
  if (chill !== null) return {value: chill, kind: 'windChill'};
  const humidex = numberOf(states, entities.humidex);
  return humidex === null ? null : {value: humidex, kind: 'humidex'};
}

/**
 * One row per local day from day and night entries. The day's high is its day entry's temperature; its low is a `templow`,
 * or, for a night entry that has none, the night's temperature, so a night-only day (tonight) gives a low and no high. The
 * condition is the day's, else the night's; the chance of precipitation is the largest of the day's entries.
 */
export function foldForecastDays(entries: ForecastEntry[], isoDay: (ms: number) => string): ForecastDay[] {
  type Row = ForecastDay & {night: string | null; sawNight: boolean};
  const days = new Map<string, Row>();
  for (const entry of entries) {
    const at = forecastTime(entry);
    const dayKey = isoDay(at);
    const row = days.get(dayKey) ?? {
      dayKey,
      at,
      hi: null,
      lo: null,
      condition: null,
      pop: null,
      isTonight: false,
      night: null,
      sawNight: false,
    };
    const night = entry.is_daytime === false;
    const {temperature, templow} = entry;
    if (temperature != null && !night) row.hi = row.hi === null ? temperature : Math.max(row.hi, temperature);
    if (templow != null) row.lo = row.lo === null ? templow : Math.min(row.lo, templow);
    if (night && temperature != null && templow == null)
      row.lo = row.lo === null ? temperature : Math.min(row.lo, temperature);
    if (night) {
      row.night = entry.condition ?? null;
      row.sawNight = true;
    } else row.condition ||= entry.condition ?? null;
    if (entry.precipitation_probability != null) row.pop = Math.max(row.pop ?? 0, entry.precipitation_probability);
    days.set(dayKey, row);
  }
  return [...days.values()].map(({night, sawNight, ...row}) => ({
    ...row,
    condition: row.condition || night,
    isTonight: sawNight && row.hi === null,
  }));
}

export const environmentCanadaSource: WeatherSource = {
  name: 'environment-canada',

  // the weather entity's temperature comes first, as the legacy panel, the Home card and the idle clock read it
  fallback: ['temperature'],

  ids: config => KEYS.map(key => config.entities[key]).filter((id): id is string => id !== null),

  present: (states, config) =>
    [config.entities.outT, config.entities.cond].some(id => !!id && states[id] !== undefined),

  read(states, config) {
    const e = config.entities;
    const number = (key: EntityKey) => numberOf(states, e[key]);
    const text = (key: EntityKey) => textOf(states, e[key]);
    const read: Partial<WeatherInputs> = {foldForecast: foldForecastDays, alerts: readAlerts(states, e)};
    // a value a sensor does not have is left out, so the weather entity's or the empty inputs answer for it
    const set = <K extends keyof WeatherInputs>(field: K, value: WeatherInputs[K] | null) => {
      if (value !== null) read[field] = value;
    };
    const group = <T extends object>(fields: T): T | null =>
      Object.values(fields).some(v => v !== null) ? fields : null;

    set('temperature', number('outT'));
    set('condition', text('cond'));
    set('conditionWords', conditionWordsOf(text('cond')));
    set('today', group({hi: number('hi'), lo: number('lo'), pop: number('pop')}));
    set('normals', group({hi: number('nhi'), lo: number('nlo')}));
    set(
      'wind',
      group({speed: number('wind'), gust: number('gust'), direction: text('windDir'), bearing: number('bearing')}),
    );
    set('humidity', number('hum'));
    set('dewPoint', number('dew'));
    set('pressure', group({kpa: number('pres'), tendency: text('tend')}));
    set('uv', number('uv'));
    set('aqhi', number('aqhi'));
    set('visibility', number('vis'));
    set('feelsLike', feelsLike(states, e));
    set('summary', text('summary'));
    const observedAt = Date.parse(text('obs') ?? '');
    if (!Number.isNaN(observedAt)) {
      read.observation = {at: observedAt, station: textAttributeOf(states, e.obs, 'station') || null};
    }
    return read;
  },
};
