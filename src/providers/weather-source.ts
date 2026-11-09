// The weather port: what a weather source must answer (`WeatherSource`) and the generic inputs it fills (`WeatherInputs`).
// Pattern: strategy (Gamma et al., Design Patterns), one interface and two adapters that both exist, the weather entity
// and Environment Canada; each adapter is an anti-corruption layer (Evans, Domain-Driven Design) so the model never
// matches on an integration's naming. A source is added by one file and one line in `WEATHER_SOURCES`.
// Must not: import a feature or the DOM, hold a string the household reads, or read the clock.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';

export interface WeatherSource {
  /** `weather-entity`, `environment-canada`. */
  readonly name: string;
  /** The entity ids this source reads for the given config; the pane subscribes to their union. */
  ids(config: ResolvedConfig): readonly string[];
  /** True when the house has what this source reads; a source that is absent fills nothing. */
  present(states: HassEntities, config: ResolvedConfig): boolean;
  /** The fields this source knows; a later source in the list overrides an earlier one, field by field. */
  read(states: HassEntities, config: ResolvedConfig): Partial<WeatherInputs>;
}

/** One alert of Environment Canada's kind of feed: a warning, a watch, an advisory or a statement. */
export interface WeatherAlert {
  kind: 'warning' | 'watch' | 'advisory' | 'statement';
  tone: 'crit' | 'warn' | 'ok';
  /** The alert's own title, or null when the sensor only counted them (then `count` says how many). */
  title: string | null;
  count: number | null;
  /** When the alert was issued, as the source wrote it. */
  time: string | null;
}

export interface WeatherInputs {
  temperature: number | null;
  /** Home Assistant's condition word (`partlycloudy`, `rainy`), or the integration's own wording. */
  condition: string | null;
  /** The sun is up, or unknown (the old panel's rule: no sun entity means day). */
  isDay: boolean;
  /** `next` is the sun's coming event; `hasFirstLight` is true when the house has a sensor for the first light. */
  sun: {up: boolean; next: {kind: 'rise' | 'set'; at: number} | null; hasFirstLight: boolean};
  today: {hi: number | null; lo: number | null; pop: number | null};
  normals: {hi: number | null; lo: number | null};
  /** Speeds in km/h, the unit the panel shows. */
  wind: {speed: number | null; gust: number | null; direction: string | null; bearing: number | null};
  humidity: number | null;
  dewPoint: number | null;
  /** Pressure in kPa, the unit the panel shows. */
  pressure: {kpa: number | null; tendency: string | null};
  uv: number | null;
  aqhi: number | null;
  visibility: number | null;
  feelsLike: {value: number; kind: 'windChill' | 'humidex'} | null;
  /** Environment Canada's text forecast. */
  summary: string | null;
  observation: {at: number; station: string | null} | null;
  alerts: WeatherAlert[];
  /** The data credit the weather entity carries; the detail ticket draws it. */
  attribution: string | null;
  /** How this house's forecast entries fold into one row per day; absent means one row per entry (`defaultFold`). */
  foldForecast?: (entries: ForecastEntry[], isoDay: (ms: number) => string) => ForecastDay[];
}

/** One entry of a `weather/subscribe_forecast` message. */
export interface ForecastEntry {
  datetime: string | number;
  temperature?: number | null;
  templow?: number | null;
  condition?: string | null;
  precipitation_probability?: number | null;
  /** A twice-daily forecast marks its night entries `false`. */
  is_daytime?: boolean;
}

/** One row of the daily forecast: a local day. */
export interface ForecastDay {
  /** `YYYY-MM-DD` in the house's zone. */
  dayKey: string;
  /** The first forecast entry of the day, in milliseconds: an instant that is on this local day. */
  at: number;
  hi: number | null;
  lo: number | null;
  condition: string | null;
  pop: number | null;
  /** A night entry and no high: the model tests that the row is today's. */
  isTonight: boolean;
}

/** What a house with no weather source says: nothing is known, and the sun is taken to be up. */
export const EMPTY_INPUTS: WeatherInputs = {
  temperature: null,
  condition: null,
  isDay: true,
  sun: {up: false, next: null, hasFirstLight: false},
  today: {hi: null, lo: null, pop: null},
  normals: {hi: null, lo: null},
  wind: {speed: null, gust: null, direction: null, bearing: null},
  humidity: null,
  dewPoint: null,
  pressure: {kpa: null, tendency: null},
  uv: null,
  aqhi: null,
  visibility: null,
  feelsLike: null,
  summary: null,
  observation: null,
  alerts: [],
  attribution: null,
};

/** A forecast entry's instant in milliseconds, whether Home Assistant sent a date text or a number. */
export const forecastTime = (entry: ForecastEntry): number =>
  typeof entry.datetime === 'number' ? entry.datetime : Date.parse(entry.datetime);

/** The fold of a generic entity: one row per entry, as the entity sends them (a twice-daily forecast is not folded). */
export function defaultFold(entries: ForecastEntry[], isoDay: (ms: number) => string): ForecastDay[] {
  return entries.map(entry => {
    const at = forecastTime(entry);
    return {
      dayKey: isoDay(at),
      at,
      hi: entry.temperature ?? null,
      lo: entry.templow ?? null,
      condition: entry.condition ?? null,
      pop: entry.precipitation_probability ?? null,
      isTonight: false,
    };
  });
}
