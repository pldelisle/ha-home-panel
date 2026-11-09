// The eight stat tiles of Weather as data: for each, the label and the history sheet's words as message keys, its series, scale and bands.
// Pattern: data-driven design (a table, not eight branches), after the class's WX_DEF with every string replaced by a
// message key and every colour token by a tone name; a ninth tile is one entry.
// Must not: hold a string the household reads, a colour, an entity id (a series names the config key) or any logic.
import type {EntityKey} from '../../core/config.ts';
import type {MessageKey} from '../../core/i18n/en.ts';

/** The tone a band or a tile is drawn in; the element maps it to a colour token. */
export type Tone = 'ok' | 'warn' | 'crit' | 'blue';

export type TileKey = 'wind' | 'hum' | 'feels' | 'pres' | 'uv' | 'aqhi' | 'pop' | 'normal';

/** The name of the icon the element draws; the UI kit resolves it. */
export type TileIcon = 'wind' | 'hum' | 'therm' | 'clock' | 'wx' | 'aq' | 'drop';

/** One line of a history chart: the config key of its sensor, its name, its unit, and how it is drawn. */
export interface TileSeries {
  entity: EntityKey;
  nameKey: MessageKey;
  unit: string;
  /** The statistic drawn for it when it is not the mean. */
  stat?: 'max';
  dash?: boolean;
}

/** A coloured stretch of the scale, from `from` to `to` inclusive, named by `labelKey`. */
export interface TileBand {
  from: number;
  to: number;
  tone: Tone;
  labelKey: MessageKey;
}

export interface StatTileDefinition {
  key: TileKey;
  icon: TileIcon;
  /** The tile's label and its history sheet's title. */
  labelKey: MessageKey;
  /** The history sheet's sub-line. */
  subKey: MessageKey;
  /** The history sheet's note under the chart. */
  noteKey: MessageKey;
  series: readonly TileSeries[];
  min?: number;
  max?: number;
  /** The chart steps between values instead of smoothing them: for what is announced once, not measured. */
  stepline?: boolean;
  /** The fraction digits of the values the history shows. */
  dec?: number;
  bands?: readonly TileBand[];
}

/** The tiles in the order the pane shows them. */
export const TILES: readonly StatTileDefinition[] = [
  {
    key: 'wind',
    icon: 'wind',
    labelKey: 'weather.tile.wind.label',
    subKey: 'weather.tile.wind.sub',
    noteKey: 'weather.tile.wind.note',
    series: [
      {entity: 'wind', nameKey: 'weather.tile.wind.label', unit: 'km/h'},
      {entity: 'gust', nameKey: 'weather.series.gusts', unit: 'km/h', stat: 'max', dash: true},
    ],
    min: 0,
  },
  {
    key: 'hum',
    icon: 'hum',
    labelKey: 'weather.tile.hum.label',
    subKey: 'weather.tile.hum.sub',
    noteKey: 'weather.tile.hum.note',
    series: [
      {entity: 'hum', nameKey: 'weather.tile.hum.label', unit: '%'},
      {entity: 'dew', nameKey: 'weather.series.dewPoint', unit: '°', dash: true},
    ],
    dec: 1,
  },
  {
    key: 'feels',
    icon: 'therm',
    labelKey: 'weather.tile.feels.label',
    subKey: 'weather.tile.feels.sub',
    noteKey: 'weather.tile.feels.note',
    series: [
      {entity: 'outT', nameKey: 'weather.series.air', unit: '°'},
      {entity: 'chill', nameKey: 'weather.series.windChill', unit: '°', dash: true},
      {entity: 'humidex', nameKey: 'weather.series.humidex', unit: '°', dash: true},
    ],
    dec: 1,
  },
  {
    key: 'pres',
    icon: 'clock',
    labelKey: 'weather.tile.pres.label',
    subKey: 'weather.tile.pres.sub',
    noteKey: 'weather.tile.pres.note',
    series: [{entity: 'pres', nameKey: 'weather.tile.pres.label', unit: 'kPa'}],
    dec: 1,
  },
  {
    key: 'uv',
    icon: 'wx',
    labelKey: 'weather.tile.uv.label',
    subKey: 'weather.tile.uv.sub',
    noteKey: 'weather.tile.uv.note',
    series: [{entity: 'uv', nameKey: 'weather.tile.uv.label', unit: ''}],
    min: 0,
    stepline: true,
    bands: [
      {from: 0, to: 2, tone: 'ok', labelKey: 'weather.band.low'},
      {from: 3, to: 5, tone: 'warn', labelKey: 'weather.band.moderate'},
      {from: 6, to: 7, tone: 'crit', labelKey: 'weather.band.high'},
    ],
  },
  {
    key: 'aqhi',
    icon: 'aq',
    labelKey: 'weather.tile.aqhi.label',
    subKey: 'weather.tile.aqhi.sub',
    noteKey: 'weather.tile.aqhi.note',
    series: [{entity: 'aqhi', nameKey: 'weather.aqhi', unit: ''}],
    min: 0,
    max: 10,
    stepline: true,
    bands: [
      {from: 1, to: 3, tone: 'ok', labelKey: 'weather.band.lowRisk'},
      {from: 4, to: 6, tone: 'warn', labelKey: 'weather.band.moderate'},
      {from: 7, to: 10, tone: 'crit', labelKey: 'weather.band.highRisk'},
    ],
  },
  {
    key: 'pop',
    icon: 'drop',
    labelKey: 'weather.tile.pop.label',
    subKey: 'weather.tile.pop.sub',
    noteKey: 'weather.tile.pop.note',
    series: [{entity: 'pop', nameKey: 'weather.series.chance', unit: '%'}],
    min: 0,
    max: 100,
    stepline: true,
  },
  {
    key: 'normal',
    icon: 'wx',
    labelKey: 'weather.tile.normal.label',
    subKey: 'weather.tile.normal.sub',
    noteKey: 'weather.tile.normal.note',
    series: [
      {entity: 'hi', nameKey: 'weather.series.forecastHigh', unit: '°'},
      {entity: 'nhi', nameKey: 'weather.series.normalHigh', unit: '°', dash: true},
      {entity: 'lo', nameKey: 'weather.series.forecastLow', unit: '°'},
      {entity: 'nlo', nameKey: 'weather.series.normalLow', unit: '°', dash: true},
    ],
    stepline: true,
  },
];

/** The tile with this key. */
export const tileDefinition = (key: TileKey): StatTileDefinition => TILES.find(tile => tile.key === key)!;
