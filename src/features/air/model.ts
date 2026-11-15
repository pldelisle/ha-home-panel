// airModel: the purifiers, the station and the AQHI in, the strings, levels and flags the Air card, the detail and the summary place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no store, words every
// message through `deps.t` and every number through `deps.fmt`, and a held mode or speed comes from `deps.overlay` (ADR 0023). Each rule is the
// legacy panel's own (`renderAir`, `renderAirLive`, `roomAir`, `airSummary`), deleted by #234.
// Must not: import the DOM, Lit or the shell, read the clock, or hold text the household reads (a catalog key says it).
import {capitalise, DASH} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {whole, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import {outdoorLevel, rateRoom, type Level, type Pollutant, type RoomRating} from '../../providers/air-quality.ts';
import {POLLEN_KINDS, type AirRoomInputs, type OutsideAirInputs, type PollenKind} from '../../providers/mila.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import {RANGES, type Range} from '../../ui/ranges.ts';
import {K, MAX_PCT, MIN_PCT, type Mode} from './commands.ts';
import {
  CHART_METRICS,
  chartText,
  DEFAULT_METRIC,
  DEFAULT_RANGE,
  METRICS,
  type ChartMetric,
  type Metric,
} from './history.ts';
import type {AirInputs} from './inputs.ts';

/** The colour of a level: 0 good, 1 moderate, 2 poor; a room that reads nothing is drawn as good, as the legacy panel drew it. */
export type Tone = 0 | 1 | 2;

/** The level words, by level. */
const LEVEL_WORDS: Record<Tone, MessageKey> = {0: 'air.level.good', 1: 'air.level.moderate', 2: 'air.level.poor'};
/** The level words in running text, in lower case: "CO₂ moderate". */
const LOWER_WORDS: Record<Tone, MessageKey> = {
  0: 'air.levelLower.good',
  1: 'air.levelLower.moderate',
  2: 'air.levelLower.poor',
};
/** The two modes' words, by mode: the preset's name is Home Assistant's, the word the household's. */
const MODE_WORDS: Record<Mode, MessageKey> = {Automagic: 'air.automagic', Manual: 'air.manual'};
/** The four pollen reports' labels, listed in `POLLEN_KINDS`' order. */
const POLLEN_LABELS: Record<PollenKind, MessageKey> = {
  trees: 'air.pollen.trees',
  grass: 'air.pollen.grass',
  weeds: 'air.pollen.weeds',
  mold: 'air.pollen.mold',
};
/** The statuses Mila reports the pollen in, as the catalog words them; any other is shown capitalised. */
const POLLEN_STATUSES: ReadonlyMap<string, MessageKey> = new Map([
  ['none', 'air.pollenLevel.none'],
  ['low', 'air.pollenLevel.low'],
  ['moderate', 'air.pollenLevel.moderate'],
  ['high', 'air.pollenLevel.high'],
  ['very high', 'air.pollenLevel.veryHigh'],
]);
/** The tiles of a room's detail, in order: the four rated pollutants, then the two particle sizes and the humidity. */
const TILES: readonly Metric[] = ['pm2_5', 'co2', 'voc', 'co', 'pm1', 'pm10', 'humidity'];
/** The three the card lists under a room's name. */
const CARD_METRICS: readonly Pollutant[] = ['pm2_5', 'co2', 'voc'];
/** A bare number from 1000 and 10000 is written in thousands on the card: `1.5k`, `13k`. */
const THOUSAND = 1000;
const TEN_THOUSAND = 10_000;
/** Carbon monoxide reads with a decimal under this, where the other pollutants are whole numbers. */
const CO_DECIMAL_BELOW = 10;

export interface AirModelDeps {
  /** The instant the model is read at, in milliseconds: the contract every model takes, though no Air line is dated. */
  now: number;
  t: Translate;
  fmt: Formatters;
  /** The held value of a key while a tap awaits Home Assistant, else the current one (`OptimisticController.read`). */
  overlay: Overlay;
  /** The detail's selection, for the chart's title and caption; the legacy sheet's own defaults when it has none. */
  metric?: ChartMetric;
  range?: Range;
}

/** A pollutant on the card, short: "1.5k" for a thousand and a half. */
export interface CardMetric {
  metric: Metric;
  label: string;
  value: string;
  /** Moderate or poor: the card writes it in the level's colour. */
  high: boolean;
}

export interface RoomLine {
  /** The fan's entity id, which names the room for a tap. */
  id: string;
  name: string;
  tone: Tone;
  metrics: CardMetric[];
  /** "Automagic · 40% · 45% RH", "Fan off", "Purifier offline". */
  line: string;
}

export interface Tile {
  metric: Metric;
  label: string;
  value: string;
  unit: string;
  high: boolean;
}

export type RoomControl =
  | {offline: true; message: string}
  | {
      offline: false;
      /** The radio group's name for a screen reader: "Office mode". */
      modeLabel: string;
      modes: {mode: Mode; label: string; checked: boolean}[];
      /** The fan speed's stepper, in Manual; null in Automagic. */
      speed: {
        pct: number;
        text: string;
        caption: string;
        label: string;
        downLabel: string;
        upLabel: string;
        atMin: boolean;
        atMax: boolean;
      } | null;
      /** What Automagic is doing, in Automagic; null in Manual. */
      hint: string | null;
    };

export interface RoomDetail {
  id: string;
  name: string;
  tone: Tone;
  /** The level's word, or a dash with no reading. */
  state: string;
  /** "CO₂ moderate, VOC moderate · 21.4°", "Clean air", "Mila index 68", "No readings". */
  headline: string;
  tiles: Tile[];
  control: RoomControl;
}

export interface OutsideDetail {
  title: string;
  hint: string;
  tone: Tone;
  state: string;
  /** "AQI" and the figure, which the detail writes in bold. */
  reading: {label: string; value: string};
  /** What follows, joined with " · ": "AQHI 2 · PM2.5 9.0 µg/m³ · station 6 km away"; empty when there is nothing to say. */
  more: string;
  /** The four pollen tiles; null when the station reports none. */
  pollen: {label: string; value: string}[] | null;
  pollenHint: string;
}

export interface AirViewModel {
  /** The sub-line: "2 purifiers · Good", "2 purifiers · Moderate · Office: CO₂ 1,050", "No purifiers found". */
  summary: string;
  card: {title: string} & (
    | {empty: true; message: string}
    | {
        empty: false;
        /** The station's index with its level on the card's right; null without a reading. */
        outside: {label: string; aqi: string; level: string} | null;
        state: {tone: Tone; text: string; why: string};
        rooms: RoomLine[];
      }
  );
  detail: {
    title: string;
    /** "Good in every room", "Moderate · Office: CO₂ 1,050", "No readings yet". */
    sub: string;
    rooms: RoomDetail[];
    history: {
      label: string;
      metric: ChartMetric;
      metrics: {metric: ChartMetric; label: string}[];
      /** "PM2.5, last 24 hours". */
      title: string;
      /** What the band means: "Good is up to 12 µg/m³, moderate up to 35." */
      caption: string;
      unavailable: string;
    };
    /** The station and the AQHI; null without a station. */
    outside: OutsideDetail | null;
    outdoorChart: {title: string; hint: string; empty: string} | null;
  };
}

const joined = (...parts: string[]): string => parts.filter(Boolean).join(' · ');

/** A reading as the legacy `aqFmt` wrote it: a dash for none, one decimal for carbon monoxide under ten, else whole; `short` writes thousands as `1.5k`. */
function figure(k: Pollutant, value: number | null, fmt: Formatters, short = false): string {
  if (value === null) return DASH;
  if (short && value >= TEN_THOUSAND) return `${whole(fmt, value / THOUSAND)}k`;
  if (short && value >= THOUSAND) return `${fmt.fixed(value / THOUSAND, 1)}k`;
  return k === 'co' && value < CO_DECIMAL_BELOW ? fmt.fixed(value, 1) : fmt.integer(value);
}

/** The rooms' rating, and the lines the card, the detail and the summary all say from it. */
interface Overall {
  /** The worst level of any room, or -1 when none reads. */
  worst: Level;
  clean: number;
  /** The rooms at the worst level and what is high in each, as "Office: CO₂ 1,050 · Den: Mila index 68"; empty unless the worst is above good. */
  why: string;
}

function overallOf(rated: readonly {room: AirRoomInputs; rating: RoomRating}[], {t, fmt}: AirModelDeps): Overall {
  const worst = Math.max(-1, ...rated.map(({rating}) => rating.level)) as Level;
  const high = worst > 0 ? rated.filter(({rating}) => rating.level === worst) : [];
  return {
    worst,
    clean: rated.filter(({rating}) => rating.level === 0).length,
    why: high
      .map(({room, rating}) =>
        t('air.roomWhy', {
          name: room.name,
          detail: rating.why.length
            ? rating.why.map(w => `${t(METRICS[w.k].label)} ${figure(w.k, w.v, fmt)}`).join(', ')
            : t('air.milaIndex', {n: Math.round(rating.milaIndex ?? 0)}),
        }),
      )
      .join(' · '),
  };
}

const toneOf = (level: Level): Tone => Math.max(0, level) as Tone;

/** The fan's mode and speed as a held tap says them, else as the purifier reports them. */
function fanOf({fanId, fan}: AirRoomInputs, overlay: Overlay) {
  const mode = overlay<Mode>(K.mode(fanId), fan.preset === 'Automagic' ? 'Automagic' : 'Manual');
  const pct = overlay(K.pct(fanId), fan.on ? fan.percentage : 0);
  return {mode, pct};
}

function roomLine(room: AirRoomInputs, rating: RoomRating, {t, fmt, overlay}: AirModelDeps): RoomLine {
  const {mode, pct} = fanOf(room, overlay);
  const fanWords = !room.fan.available
    ? t('air.purifierOffline')
    : !room.fan.on
      ? t('air.fanOff')
      : t('air.fanLine', {mode: t(MODE_WORDS[mode]), n: pct});
  return {
    id: room.fanId,
    name: room.name,
    tone: toneOf(rating.level),
    metrics: rating.pollutants
      .filter(({k}) => CARD_METRICS.includes(k))
      .map(({k, v, level}) => ({
        metric: k,
        label: t(METRICS[k].label),
        value: figure(k, v, fmt, true),
        high: level > 0,
      })),
    line: joined(fanWords, room.readings.humidity === null ? '' : t('air.rh', {n: whole(fmt, room.readings.humidity)})),
  };
}

function tilesOf(room: AirRoomInputs, rating: RoomRating, {t, fmt}: AirModelDeps): Tile[] {
  return TILES.map(metric => {
    const {label, unit} = METRICS[metric];
    const rated = rating.pollutants.find(p => p.k === metric);
    const value = room.readings[metric];
    return {
      metric,
      label: t(label),
      value: rated ? figure(rated.k, rated.v, fmt) : value === null ? DASH : whole(fmt, value),
      unit,
      high: !!rated && rated.level > 0,
    };
  });
}

function controlOf(room: AirRoomInputs, {t, fmt, overlay}: AirModelDeps): RoomControl {
  if (!room.fan.available) return {offline: true, message: t('air.offlineHint')};
  const {mode, pct} = fanOf(room, overlay);
  const changes = room.readings.airChanges;
  return {
    offline: false,
    modeLabel: t('air.mode', {name: room.name}),
    modes: (['Automagic', 'Manual'] as const).map(m => ({mode: m, label: t(MODE_WORDS[m]), checked: m === mode})),
    speed:
      mode === 'Manual'
        ? {
            pct,
            text: t('air.percent', {n: pct}),
            caption: t('air.fan'),
            label: t('air.fanSpeed', {name: room.name}),
            downLabel: t('air.slower'),
            upLabel: t('air.faster'),
            atMin: pct <= MIN_PCT,
            atMax: pct >= MAX_PCT,
          }
        : null,
    hint:
      mode === 'Manual'
        ? null
        : t('air.automagicHint', {
            clauses:
              (room.fan.on ? t('air.hintNow', {n: pct}) : '') +
              (changes === null ? '' : t('air.hintChanges', {n: fmt.fixed(changes, 1)})),
          }),
  };
}

function roomDetail(room: AirRoomInputs, rating: RoomRating, deps: AirModelDeps): RoomDetail {
  const {t, fmt} = deps;
  const tone = toneOf(rating.level);
  const headline =
    rating.level < 0
      ? t('air.noReadings')
      : rating.why.length
        ? rating.why.map(w => `${t(METRICS[w.k].label)} ${t(LOWER_WORDS[toneOf(w.level)])}`).join(', ')
        : rating.level > 0
          ? t('air.milaIndex', {n: Math.round(rating.milaIndex ?? 0)})
          : t('air.cleanAir');
  return {
    id: room.fanId,
    name: room.name,
    tone,
    state: rating.level < 0 ? DASH : t(LEVEL_WORDS[tone]),
    headline: joined(headline, room.readings.temperature === null ? '' : `${fmt.fixed(room.readings.temperature, 1)}°`),
    tiles: tilesOf(room, rating, deps),
    control: controlOf(room, deps),
  };
}

/** A pollen report as the catalog words it, else HA's own word capitalised; a dash when the station reports none. */
function pollenValue(status: string | null, t: Translate): string {
  if (status === null) return DASH;
  const key = POLLEN_STATUSES.get(status.replace(/_/g, ' '));
  return key ? t(key) : capitalise(status.replace(/_/g, ' '));
}

function outsideDetail(outside: OutsideAirInputs, aqhi: number | null, {t, fmt}: AirModelDeps): OutsideDetail {
  const {aqi, pm, distance, pollen} = outside.readings;
  const tone = outdoorLevel(aqi);
  const reported = POLLEN_KINDS.some(kind => pollen[kind] !== null);
  return {
    title: t('air.outside'),
    hint: t('air.outsideHint'),
    tone,
    state: aqi === null ? t('air.noData') : t(LEVEL_WORDS[tone]),
    reading: {label: t('air.aqi'), value: aqi === null ? DASH : whole(fmt, aqi)},
    more: joined(
      aqhi === null ? '' : t('air.aqhiValue', {n: String(aqhi)}),
      pm === null ? '' : t('air.stationPm', {n: fmt.fixed(pm, 1)}),
      distance === null ? '' : t('air.station', {n: whole(fmt, distance)}),
    ),
    pollen: reported
      ? POLLEN_KINDS.map(kind => ({label: t(POLLEN_LABELS[kind]), value: pollenValue(pollen[kind], t)}))
      : null,
    pollenHint: t('air.noPollenYet'),
  };
}

/** The Air tab's view: the card, the detail and the sub-line, from the inputs, in the language `deps.t` words. */
export function airModel(inputs: AirInputs, deps: AirModelDeps): AirViewModel {
  const {t, fmt} = deps;
  const rated = inputs.rooms.map(room => ({room, rating: rateRoom(room)}));
  const {worst, clean, why} = overallOf(rated, deps);
  const metric = deps.metric ?? DEFAULT_METRIC;
  const range = deps.range ?? DEFAULT_RANGE;
  const level = worst < 0 ? '' : t(LEVEL_WORDS[toneOf(worst)]);
  const station = inputs.outside?.readings.aqi ?? null;
  const rooms = inputs.rooms.length;
  const head =
    worst > 0
      ? why
      : clean === rooms
        ? t('air.allRoomsClean', {n: rooms})
        : t('air.roomsClean', {n: clean, total: rooms});
  return {
    summary: rooms
      ? joined(t('air.purifiers', {n: rooms}), worst < 0 ? t('air.noDataLower') : level, worst > 0 ? why : '')
      : t('air.noPurifiers'),
    card: {
      title: t('air.quality'),
      ...(rooms
        ? {
            empty: false as const,
            outside:
              station === null
                ? null
                : {label: t('air.outsideAqi'), aqi: whole(fmt, station), level: t(LEVEL_WORDS[outdoorLevel(station)])},
            state: {tone: toneOf(worst), text: worst < 0 ? t('air.noData') : level, why: head},
            rooms: rated.map(({room, rating}) => roomLine(room, rating, deps)),
          }
        : {empty: true as const, message: t('air.noPurifiers')}),
    },
    detail: {
      title: t('air.quality'),
      sub: worst < 0 ? t('air.noReadingsYet') : worst === 0 ? t('air.goodEveryRoom') : joined(level, why),
      rooms: rated.map(({room, rating}) => roomDetail(room, rating, deps)),
      history: {
        label: t('air.whatToChart'),
        metric,
        metrics: CHART_METRICS.map(m => ({metric: m, label: t(METRICS[m].label)})),
        ...chartText(metric, range, deps),
        unavailable: t('air.historyUnavailable'),
      },
      outside: inputs.outside ? outsideDetail(inputs.outside, inputs.aqhi, deps) : null,
      outdoorChart:
        inputs.outside?.aqi || inputs.aqhiId
          ? {
              title: t('air.outdoorAir', {range: t(RANGES[range].labelKey)}),
              hint: t('air.outdoorHint'),
              empty: t('air.noOutdoorHistory'),
            }
          : null,
    },
  };
}
