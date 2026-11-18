// weatherModel: the inputs, the forecast and the clock in, the strings and numbers the Weather elements place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock and no `hass`,
// words every message through `deps.t` (units and symbols are literal) and formats everything through `deps.fmt`, and returns a tree of strings and numbers.
// Each rule is the legacy panel's own (weatherSummary, renderWeather, renderWeatherNow, renderForecast, wxDays, dayName).
// Must not: import the DOM, a UI kit element or the shell, hold a colour (tiles carry a tone name), or read the clock.
import {capitalise, DASH, DAY_MS, HOUR_MS, joined} from '../../core/figures.ts';
import {conditionName} from '../../core/i18n/condition-name.ts';
import {
  forecastFigure,
  forecastTemperature,
  temperature,
  temperatureFigure,
  whole,
  type Formatters,
} from '../../core/i18n/format.ts';
import type {Messages} from '../../core/i18n/messages.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {isDayAt, sunTimes} from '../../core/sun.ts';
import {
  defaultFold,
  forecastTime,
  type ForecastDay,
  type ForecastEntry,
  type WeatherAlert,
  type WeatherInputs,
} from '../../providers/weather-source.ts';
import {reading} from '../../ui/reading.ts';
import {tileDefinition, TILES, type StatTileDefinition, type TileIcon, type TileKey, type Tone} from './tiles.ts';

type Translate = Messages['t'];

export interface WeatherModelDeps {
  /** The instant the model is read at, in milliseconds: passed in, never read. */
  now: number;
  /** The store's locale-aware formats. */
  fmt: Formatters;
  /** The store's `t()`. */
  t: Translate;
  latitude: number;
  longitude: number;
  /** The house picture the config names, one for the light theme and one for the dark; none by default. */
  house?: {day: string | null; night: string | null} | null;
}

/** A weather icon to draw: the condition, whether it is day, and the name of the condition for the screen reader. */
export interface IconSpec {
  condition: string | null;
  day: boolean;
  label: string;
}

export interface StatTileView {
  key: TileKey;
  icon: TileIcon;
  label: string;
  /** The reading, or the words for no reading (`missing`). */
  value: string;
  /** Drawn small after the value, spacing included; empty when there is no reading to put it after. */
  unit: string;
  /** There is no reading: `value` is the words that say so, drawn in the line's style, with no unit. */
  missing?: true;
  sub: string;
  tone: Tone | null;
  /** Wind's bearing arrow, drawn in `sub` after its first `after` characters, the compass point. */
  arrow: {bearing: number; after: number} | null;
}

export interface DayCell {
  dayKey: string;
  label: string;
  icon: IconSpec;
  /** The high, or empty for tonight. */
  hi: string;
  /** The low; for tonight it is the figure, with `loLabel` under it. */
  lo: string;
  loLabel: string;
  isTonight: boolean;
}

export interface HourCell {
  /** The hour's instant, the key of a repeated cell. */
  key: number;
  label: string;
  icon: IconSpec;
  temperature: string;
  pop: string;
}

export interface DayRow {
  dayKey: string;
  label: string;
  icon: IconSpec;
  condition: string;
  pop: string;
  lo: string;
  hi: string;
  /** Where the bar starts and how wide it is, in percent of the week's range. */
  barLeft: number;
  barWidth: number;
  /** Where the dot for now sits, in percent, on today's row only. */
  dot: number | null;
}

export interface SunView {
  /** The sentence about the length of daylight and its change since yesterday. */
  daylight: string;
  /** The screen reader's label of the arc. */
  label: string;
  isUp: boolean;
  /** How far through the day the sun is, 0 to 100. */
  percent: number;
  /** The sun's place on the 300 by 150 arc, to one decimal. */
  cx: number;
  cy: number;
  events: {key: 'sunrise' | 'noon' | 'sunset'; label: string; time: string; sub: string}[];
}

/** The next hours' temperature and chance of rain or snow as `[ms, value]` points, for the chart. */
export interface HourSeries {
  temperature: [number, number | null][];
  pop: [number, number][];
}

export interface AlertView {
  tone: WeatherAlert['tone'];
  kind: string;
  title: string;
  time: string | null;
}

export interface WeatherViewModel {
  /** The pane's sub-line: "Partly cloudy · observed 2:00 pm at Springfield · pressure falling · no alerts". */
  summary: string;
  /** The phone's summary card. */
  card: {
    /** The house picture the card draws behind its text, or null. */
    house: {day: string; night: string} | null;
    sunLabel: string;
    sunTime: string;
    temperature: string;
    condition: string;
    range: string;
    days: DayCell[];
  };
  tiles: StatTileView[];
  /** The detail panel's first block. */
  now: {
    temperature: string;
    condition: string;
    icon: IconSpec;
    line: string;
    summary: string | null;
    /** The eight tiles again, in the detail's order and wording. */
    tiles: StatTileView[];
  };
  sun: SunView | null;
  alerts: AlertView[];
  /** Every third hour of the next day. */
  hours: HourCell[];
  /** All the hours of the next day, for the chart. */
  hourSeries: HourSeries;
  days: DayRow[];
}

/** The forecast days the panel keeps; the phone's card shows the first four. */
const DAYS_KEPT = 7;
const CARD_DAYS = 4;
const HOURS_KEPT = 24;
/** The strip shows one hour in three. */
const HOUR_STEP = 3;

/** The tiles in the order the detail panel shows them; the pane's order is TILES'. */
const DETAIL_ORDER: readonly TileKey[] = ['wind', 'hum', 'pres', 'pop', 'uv', 'aqhi', 'feels', 'normal'];

/** What every section says and formats with: the catalog, the formats and the rounding the legacy panel did. */
interface Say {
  t: Translate;
  fmt: Formatters;
  /** A whole number; the -0 of Math.round(-0.4) is 0, which Intl would otherwise write as `-0`. */
  int: (n: number) => string;
  degrees: (n: number) => string;
  /** A reading as the sensor gave it, to two digits at most, or null for no reading (a tile says so: `reading`). */
  raw: (n: number | null) => string | null;
  /** A reading to exactly `digits` fraction digits, or null for no reading. */
  fixed: (n: number | null, digits: number) => string | null;
  /** A compass point in the user's language; a word the catalog does not know is shown as it is. */
  compass: (point: string) => string;
  condition: (word: string | null) => string;
  icon: (word: string | null, day: boolean) => IconSpec;
}

function sayWith(t: Translate, fmt: Formatters): Say {
  return {
    t,
    fmt,
    int: n => whole(fmt, n),
    degrees: n => forecastTemperature(fmt, n),
    raw: n => (n === null ? null : fmt.number(n, 2)),
    fixed: (n, digits) => (n === null ? null : fmt.fixed(n, digits)),
    compass: point => t('weather.compass', {point}),
    condition: word => conditionName(word, t),
    icon: (word, day) => ({condition: word, day, label: conditionName(word, t)}),
  };
}

/** The local days the model compares forecast days with. */
interface Days {
  today: string;
  tomorrow: string;
}

/** `rising`, or its French, from a tendency word as Environment Canada writes it. */
const tendencyWord = (tendency: string, t: Translate) => t('weather.tendency', {tendency: tendency.toLowerCase()});

// ---------- the pane's sub-line and the alerts ----------

function alertViews(inputs: WeatherInputs, {t}: Say): AlertView[] {
  return inputs.alerts.map(alert => ({
    tone: alert.tone,
    kind: t(`weather.alertKind.${alert.kind}`),
    // a sensor that only counts has no title: the count is worded here
    title: alert.title ?? t('weather.alerts.kindCount', {kind: alert.kind, n: alert.count ?? 0}),
    time: alert.time,
  }));
}

function summaryLine(inputs: WeatherInputs, alerts: number, condition: string, {t, fmt}: Say): string {
  const {observation, pressure} = inputs;
  return [
    condition,
    observation
      ? observation.station
        ? t('weather.observedAt', {time: fmt.time(observation.at), station: observation.station})
        : t('weather.observed', {time: fmt.time(observation.at)})
      : '',
    pressure.tendency ? t('weather.pressureTrend', {tendency: pressure.tendency.toLowerCase()}) : '',
    alerts ? t('weather.alerts.count', {n: alerts}) : t('weather.alerts.none'),
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---------- the tiles ----------

/** What a tile says of its reading; the rest of a tile's view comes from its definition. */
type Shown = Pick<StatTileView, 'unit' | 'sub'> &
  Partial<Pick<StatTileView, 'tone' | 'arrow'>> & {value: string | null};

/** A tile from what it says; a `null` value is no reading (the words, no unit, `missing`), decided here once for every tile of both layouts. */
const tileView = (definition: StatTileDefinition, {value, unit, ...shown}: Shown, {t}: Say): StatTileView => ({
  key: definition.key,
  icon: definition.icon,
  label: t(definition.labelKey),
  tone: null,
  arrow: null,
  ...shown,
  ...reading(t, value, unit),
});

/** The word of a band the reading falls in, or nothing. */
function bandWord(definition: StatTileDefinition, value: number | null, {t}: Say): string {
  const band = value === null ? undefined : definition.bands?.find(b => value >= b.from && value <= b.to);
  return band ? t(band.labelKey) : '';
}

/** The sub-line about feels-like, in the pane's wording or the detail's (lower case). */
function feelsSub({feelsLike}: WeatherInputs, lower: boolean, {t}: Say): string {
  if (!feelsLike) return lower ? t('weather.sub.sameAirLower') : t('weather.sub.sameAir');
  if (feelsLike.kind === 'windChill') return lower ? t('weather.sub.windChillLower') : t('weather.sub.windChill');
  return lower ? t('weather.sub.humidexLower') : t('weather.sub.humidex');
}

/** The pane's tiles: a figure to the unit the tile is drawn with, the unit only after a reading, sentences from a capital. */
function paneTiles(inputs: WeatherInputs, say: Say): StatTileView[] {
  const {t, fmt, int, degrees, fixed, compass} = say;
  const {wind, pressure, today, normals, feelsLike, uv, aqhi, humidity, dewPoint} = inputs;
  // the pane rounds with `toFixed` where the detail rounds with `Math.round`, so a negative half differs between them; that is
  // the legacy panel's own behaviour too, kept for parity
  const reading: Record<TileKey, () => Shown> = {
    wind: () => ({
      value: fixed(wind.speed, 0),
      unit: wind.speed === null ? '' : ' km/h',
      sub: [
        wind.direction ? compass(wind.direction) : '',
        wind.gust === null ? '' : t('weather.sub.gustsUnit', {speed: fmt.fixed(wind.gust, 0)}),
      ]
        .filter(Boolean)
        .join(' · '),
    }),
    hum: () => ({
      value: fixed(humidity, 0),
      unit: humidity === null ? '' : '%',
      sub: dewPoint === null ? '' : t('weather.sub.dewPoint', {temp: temperatureFigure(fmt, dewPoint)}),
    }),
    feels: () => ({
      value: feelsLike || inputs.temperature !== null ? temperature(fmt, feelsLike?.value ?? inputs.temperature) : null,
      unit: '',
      sub: feelsSub(inputs, false, say),
    }),
    pres: () => ({
      value: fixed(pressure.kpa, 1),
      unit: pressure.kpa === null ? '' : ' kPa',
      sub: pressure.tendency ? capitalise(tendencyWord(pressure.tendency, t)) : '',
    }),
    uv: () => ({
      value: uv === null ? null : int(uv),
      unit: '',
      sub: bandWord(tileDefinition('uv'), uv, say) || (uv !== null && uv >= 8 ? t('weather.band.veryHigh') : ''),
    }),
    aqhi: () => ({
      value: aqhi === null ? null : int(aqhi),
      unit: '',
      sub: bandWord(tileDefinition('aqhi'), aqhi, say),
    }),
    pop: () => ({
      value: fixed(today.pop, 0),
      unit: today.pop === null ? '' : '%',
      sub: t('weather.sub.chanceToday'),
    }),
    normal: () => ({
      value: normals.hi === null ? null : degrees(normals.hi),
      unit: normals.hi === null || normals.lo === null ? '' : ` / ${degrees(normals.lo)}`,
      sub: t('weather.sub.forTheDate'),
    }),
  };
  return TILES.map(definition => tileView(definition, {...reading[definition.key](), tone: 'blue'}, say));
}

/** From this UV index the detail says extreme: the scale goes on past the last band of TILES (8 to 10 is very high). */
const UV_EXTREME_FROM = 11;
/** The detail's word for each band of the UV tile, in the order of `TILES`' bands, then the two the bands stop short of. */
const UV_WORDS = ['weather.uv.low', 'weather.uv.moderate', 'weather.uv.high'] as const;

/**
 * The detail's word for a UV index, from the bands of the UV tile in `TILES` (a band ends where the next whole number begins, so 2.9 is
 * low), then very high up to `UV_EXTREME_FROM` and extreme beyond.
 */
export function uvWord(value: number): MessageKey {
  const band = tileDefinition('uv').bands?.findIndex(b => value < b.to + 1) ?? -1;
  return band >= 0 ? UV_WORDS[band] : value < UV_EXTREME_FROM ? 'weather.uv.veryHigh' : 'weather.uv.extreme';
}

/** The risk of an AQHI reading, from the bands of the air-quality tile in `TILES` (a band includes its `to`), very high past the last. */
const AQHI_RISKS = ['low', 'moderate', 'high'] as const;
export function aqhiRisk(value: number): (typeof AQHI_RISKS)[number] | 'veryHigh' {
  const band = tileDefinition('aqhi').bands?.findIndex(b => value <= b.to) ?? -1;
  return band >= 0 ? AQHI_RISKS[band] : 'veryHigh';
}

/** The detail's tiles: the same readings in the detail's wording, the unit always drawn, sentences in lower case. */
function detailTiles(inputs: WeatherInputs, say: Say): StatTileView[] {
  const {t, fmt, int, degrees, raw, fixed, compass} = say;
  const {wind, pressure, today, normals, feelsLike, uv, aqhi, humidity, dewPoint, visibility} = inputs;
  const dir = wind.direction ? compass(wind.direction) : '';
  const reading: Record<TileKey, () => Shown> = {
    wind: () => ({
      value: wind.speed === null ? null : int(wind.speed),
      unit: 'km/h',
      sub: [dir, wind.gust === null ? '' : t('weather.sub.gusts', {speed: int(wind.gust)})].filter(Boolean).join(' · '),
      arrow: wind.bearing === null ? null : {bearing: wind.bearing, after: dir.length},
    }),
    hum: () => ({
      value: raw(humidity),
      unit: '%',
      sub: dewPoint === null ? '' : t('weather.sub.dewPointLower', {temp: temperatureFigure(fmt, dewPoint)}),
    }),
    pres: () => ({
      value: fixed(pressure.kpa, 1),
      unit: 'kPa',
      sub: pressure.tendency ? tendencyWord(pressure.tendency, t) : '',
    }),
    pop: () => ({value: raw(today.pop), unit: '%', sub: t('weather.sub.chanceTodayLower')}),
    uv: () => ({value: raw(uv), unit: '', sub: uv === null ? '' : t(uvWord(uv))}),
    aqhi: () => ({
      value: raw(aqhi),
      unit: '',
      sub: aqhi === null ? t('weather.aqhi') : t('weather.aqhiRisk', {risk: aqhiRisk(aqhi)}),
    }),
    feels: () => ({
      value: feelsLike || inputs.temperature !== null ? temperature(fmt, feelsLike?.value ?? inputs.temperature) : null,
      unit: '',
      sub:
        feelsLike || visibility === null
          ? feelsSub(inputs, true, say)
          : t('weather.sub.visibility', {km: int(visibility)}),
    }),
    normal: () => ({
      value:
        normals.hi === null
          ? null
          : normals.lo === null
            ? degrees(normals.hi)
            : `${degrees(normals.hi)} / ${degrees(normals.lo)}`,
      unit: '',
      sub: t('weather.sub.normalHighLow'),
    }),
  };
  return DETAIL_ORDER.map(key => tileView(tileDefinition(key), reading[key](), say));
}

// ---------- the lines under the temperature ----------

/**
 * "High 14° · Low 6° · normal 9° / 1°": the card says the normals, the detail's line does not and says "Feels like" first
 * when `feelsText` is given. The two sets of figures the French map has a sentence for are worded whole; any other set is
 * joined from its parts.
 */
function rangeLine(inputs: WeatherInputs, feelsText: string | null, withNormals: boolean, {t, fmt}: Say): string {
  const {today, normals} = inputs;
  const high = today.hi === null ? null : forecastFigure(fmt, today.hi);
  const low = today.lo === null ? null : forecastFigure(fmt, today.lo);
  const normal =
    withNormals && normals.hi !== null && normals.lo !== null
      ? {high: forecastFigure(fmt, normals.hi), low: forecastFigure(fmt, normals.lo)}
      : null;
  if (feelsText === null && high !== null && low !== null)
    return normal
      ? t('weather.highLowNormal', {high, low, normalHigh: normal.high, normalLow: normal.low})
      : t('weather.highLow', {high, low});
  return [
    feelsText === null ? '' : t('weather.feelsLike', {temp: feelsText}),
    high === null ? '' : t('weather.high', {temp: high}),
    low === null ? '' : t('weather.low', {temp: low}),
    normal ? t('weather.normal', {high: normal.high, low: normal.low}) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The feels-like figure, when it differs from the air by a degree or more: the detail's line says it first. */
function feelsShown({feelsLike, temperature: air}: WeatherInputs, {fmt}: Say): string | null {
  return feelsLike && Math.abs(feelsLike.value - (air ?? 0)) >= 1 ? temperatureFigure(fmt, feelsLike.value) : null;
}

// ---------- the days ----------

const isTonight = (day: ForecastDay, days: Days) => day.isTonight && day.dayKey === days.today;

/** Today, Tomorrow (not in the short form), else the weekday of the day's own first entry, with a capital. */
function dayLabel(day: ForecastDay, short: boolean, days: Days, {t, fmt}: Say): string {
  if (day.dayKey === days.today) return t('weather.today');
  if (!short && day.dayKey === days.tomorrow) return t('weather.tomorrow');
  return capitalise(fmt.weekday(day.at, short ? 'short' : 'long'));
}

function cardDays(forecastDays: ForecastDay[], days: Days, say: Say): DayCell[] {
  const {t, degrees, icon} = say;
  return forecastDays.slice(0, CARD_DAYS).map(day => {
    const tonight = isTonight(day, days);
    return {
      dayKey: day.dayKey,
      label: tonight ? t('weather.tonight') : dayLabel(day, true, days, say),
      icon: icon(day.condition, !tonight),
      hi: tonight || day.hi === null ? '' : degrees(day.hi),
      lo: day.lo === null ? (tonight ? DASH : '') : degrees(day.lo),
      loLabel: tonight ? t('weather.lowWord') : '',
      isTonight: tonight,
    };
  });
}

/** The days as range bars on one scale; tonight, which has no high, runs from now down to its low. */
function dayRows(forecastDays: ForecastDay[], days: Days, now: number | null, say: Say): DayRow[] {
  const {t, degrees, icon, condition} = say;
  const top = (day: ForecastDay) =>
    day.hi ?? (day.dayKey === days.today && now !== null ? Math.max(now, day.lo ?? now) : day.lo);
  const bottom = (day: ForecastDay) => day.lo ?? day.hi;
  const known = forecastDays.filter(day => bottom(day) !== null);
  const low = Math.min(...known.map(day => bottom(day)!));
  const span = Math.max(1, Math.max(...known.map(day => top(day)!)) - low);
  return forecastDays.map(day => {
    const start = bottom(day);
    const end = top(day);
    const tonight = isTonight(day, days);
    return {
      dayKey: day.dayKey,
      label: tonight ? t('weather.tonight') : dayLabel(day, false, days, say),
      icon: icon(day.condition, !tonight),
      condition: condition(day.condition),
      pop: day.pop !== null && day.pop >= 20 ? t('weather.percent', {value: day.pop}) : '',
      lo: day.lo === null ? '' : degrees(day.lo),
      hi: day.hi === null ? '' : degrees(day.hi),
      barLeft: start === null ? 0 : ((start - low) / span) * 100,
      barWidth: start === null || end === null ? 0 : Math.max(4, ((end - start) / span) * 100),
      dot: day.dayKey === days.today && now !== null ? Math.min(100, Math.max(0, ((now - low) / span) * 100)) : null,
    };
  });
}

// ---------- the next hours ----------

function hourViews(hourly: ForecastEntry[], deps: WeatherModelDeps, say: Say) {
  const {now, latitude, longitude} = deps;
  const {t, fmt, degrees, icon} = say;
  const upcoming = hourly.filter(entry => forecastTime(entry) > now - HOUR_MS).slice(0, HOURS_KEPT);
  const cells: HourCell[] = upcoming
    .filter((_, index) => index % HOUR_STEP === 0)
    .map(entry => {
      const at = forecastTime(entry);
      const chance = entry.precipitation_probability;
      return {
        key: at,
        label: fmt.hour(at),
        icon: icon(entry.condition ?? null, isDayAt(at, latitude, longitude, fmt.isoDay(at))),
        temperature: entry.temperature == null ? DASH : degrees(entry.temperature),
        pop: chance ? t('weather.percent', {value: chance}) : '',
      };
    });
  const series = {
    temperature: upcoming.map((entry): [number, number | null] => [forecastTime(entry), entry.temperature ?? null]),
    pop: upcoming.map((entry): [number, number] => [forecastTime(entry), entry.precipitation_probability || 0]),
  };
  return {cells, series};
}

// ---------- the sun ----------

function sunView(inputs: WeatherInputs, deps: WeatherModelDeps, days: Days, {t, fmt}: Say): SunView | null {
  const {now, latitude, longitude} = deps;
  const day = sunTimes(latitude, longitude, days.today);
  if (day.rise === null || day.set === null) return null;
  const before = sunTimes(latitude, longitude, fmt.isoDay(now - DAY_MS));
  const length = day.set - day.rise;
  // the first day of the sun after the polar night has no day before it to be compared with
  const change = length - (before.rise !== null && before.set !== null ? before.set - before.rise : length);
  const through = Math.min(1, Math.max(0, (now - day.rise) / length));
  const isUp = now > day.rise && now < day.set;
  const angle = Math.PI * (1 - through);
  const place = (n: number) => Math.round(n * 10) / 10;
  const percent = Math.round(through * 100);
  return {
    daylight: t('weather.daylight', {
      hours: Math.floor(length / HOUR_MS),
      minutes: Math.round(length / 6e4) % 60,
      changeMinutes: Math.floor(Math.abs(change) / 6e4),
      changeSeconds: Math.round(Math.abs(change) / 1e3) % 60,
      change: change < 0 ? 'shorter' : 'longer',
    }),
    label: isUp ? t('weather.sunPosition', {percent}) : t('weather.sunBelow'),
    isUp,
    percent,
    cx: place(150 + 120 * Math.cos(angle)),
    cy: place(130 - 110 * Math.sin(angle)),
    events: [
      {
        key: 'sunrise',
        label: t('weather.sunrise'),
        time: fmt.time(day.rise),
        sub: inputs.sun.hasFirstLight && day.dawn !== null ? t('weather.firstLight', {time: fmt.time(day.dawn)}) : '',
      },
      {key: 'noon', label: t('weather.solarNoon'), time: fmt.time(day.noon), sub: ''},
      {
        key: 'sunset',
        label: t('weather.sunset'),
        time: fmt.time(day.set),
        sub: day.dusk === null ? '' : t('weather.lastLight', {time: fmt.time(day.dusk)}),
      },
    ],
  };
}

// ---------- the model ----------

/** The current condition: the source's own phrase has its message, else the word is Home Assistant's (or capitalised as it came). */
const conditionOf = (inputs: WeatherInputs, {t, condition}: Say): string =>
  inputs.conditionWords ? t(inputs.conditionWords) : condition(inputs.condition);

/** The Home pane's weather card (#268): the next sun event and the one after, the big temperature, the condition, the high and low. */
export interface WeatherCardView {
  /** "Sunset" or "Sunrise", whichever comes next, and its time (a dash when the sensor reads nothing). */
  next: {label: string; time: string};
  /** The other event, lower case after the first ("sunrise"), when its sensor reads a time. */
  then: {label: string; time: string} | null;
  temperature: string;
  condition: string;
  /** "High 7° · low -1°", or what of it the sensors give. */
  range: string;
}

/** The legacy `renderHome`'s weather part, deleted in #268: the sun's two events in the order they come, by the sun entity. */
export function weatherCardModel(
  inputs: WeatherInputs,
  sun: {set: number | null; rise: number | null},
  {t, fmt}: Pick<WeatherModelDeps, 't' | 'fmt'>,
): WeatherCardView {
  const say = sayWith(t, fmt);
  const up = inputs.sun.up;
  const [first, second] = up ? [sun.set, sun.rise] : [sun.rise, sun.set];
  const {hi, lo} = inputs.today;
  return {
    next: {label: t(up ? 'weather.sunset' : 'weather.sunrise'), time: first === null ? DASH : fmt.time(first)},
    then:
      second === null
        ? null
        : {label: t(up ? 'weather.card.thenSunrise' : 'weather.card.thenSunset'), time: fmt.time(second)},
    temperature: inputs.temperature === null ? DASH : temperature(fmt, inputs.temperature),
    condition: conditionOf(inputs, say),
    range: joined(
      hi === null ? '' : t('weather.card.high', {n: forecastFigure(fmt, hi)}),
      lo === null ? '' : t('weather.card.low', {n: forecastFigure(fmt, lo)}),
    ),
  };
}

/** The header's weather chip (#269): the outside temperature to a tenth, as the legacy chip wrote it, and the condition. */
export interface WeatherChipView {
  temperature: string;
  condition: string;
}

/** The chip's words, or null when the house reads no temperature (the legacy header drew no chip then). */
export function weatherChipModel(
  inputs: WeatherInputs,
  {t, fmt}: Pick<WeatherModelDeps, 't' | 'fmt'>,
): WeatherChipView | null {
  if (inputs.temperature === null) return null;
  return {temperature: temperature(fmt, inputs.temperature), condition: conditionOf(inputs, sayWith(t, fmt))};
}

/** The word under Weather in the phone's More sheet: "4° · Partly cloudy", or nothing when the house has no temperature. */
export function weatherBrief(inputs: WeatherInputs, {fmt, t}: Pick<WeatherModelDeps, 'fmt' | 't'>): string {
  if (inputs.temperature === null) return '';
  return `${temperature(fmt, inputs.temperature)} · ${conditionOf(inputs, sayWith(t, fmt))}`;
}

/**
 * The name a screen reader gives the phone's Home weather card, which is one button over the weather and Who's home: "Weather: 4°,
 * mainly sunny. Opens the forecast", or without the figures when the house reads no temperature.
 */
export function weatherCardName(inputs: WeatherInputs, {fmt, t}: Pick<WeatherModelDeps, 'fmt' | 't'>): string {
  if (inputs.temperature === null) return t('weather.card.nameBare');
  return t('weather.card.name', {
    temperature: temperature(fmt, inputs.temperature),
    condition: conditionOf(inputs, sayWith(t, fmt)).toLowerCase(),
  });
}

export function weatherModel(
  inputs: WeatherInputs,
  forecast: {daily: ForecastEntry[]; hourly: ForecastEntry[]},
  deps: WeatherModelDeps,
): WeatherViewModel {
  const {now, fmt, t} = deps;
  // the house's local day, not UTC's: the fold of the forecast groups by it
  const isoDay = (ms: number) => fmt.isoDay(ms);
  const say = sayWith(t, fmt);
  const days: Days = {today: isoDay(now), tomorrow: isoDay(now + DAY_MS)};
  const forecastDays = (inputs.foldForecast ?? defaultFold)(forecast.daily, isoDay).slice(0, DAYS_KEPT);
  const alerts = alertViews(inputs, say);
  const hours = hourViews(forecast.hourly, deps, say);
  const outside = temperature(fmt, inputs.temperature);
  const condition = conditionOf(inputs, say);
  return {
    summary: summaryLine(inputs, alerts.length, condition, say),
    card: {
      house: deps.house?.day ? {day: deps.house.day, night: deps.house.night ?? deps.house.day} : null,
      sunLabel: inputs.sun.up ? t('weather.sunset') : t('weather.sunrise'),
      sunTime: inputs.sun.next ? fmt.time(inputs.sun.next.at) : DASH,
      temperature: outside,
      condition,
      range: rangeLine(inputs, null, true, say),
      days: cardDays(forecastDays, days, say),
    },
    tiles: paneTiles(inputs, say),
    now: {
      temperature: outside,
      condition,
      icon: {condition: inputs.condition, day: inputs.isDay, label: condition},
      line: rangeLine(inputs, feelsShown(inputs, say), false, say),
      summary: inputs.summary,
      tiles: detailTiles(inputs, say),
    },
    sun: sunView(inputs, deps, days, say),
    alerts,
    hours: hours.cells,
    hourSeries: hours.series,
    days: dayRows(forecastDays, days, inputs.temperature, say),
  };
}
