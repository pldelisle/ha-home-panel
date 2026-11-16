// ClimateCharts: the options of the Climate detail's three charts, made again only when what they are made of changed.
// Pattern: memoised builder (Michie, 1968) over the pure option builders of history.ts: each chart has a slot that remembers the history, the selection, the theme and the language
// it was built for, so an update for anything else (a thermostat's new state) hands `<hp-chart>` the very objects it drew, and the heatmap is one instance across a setpoint change (spec 20).
// Must not: read the DOM, the clock or a viewport (the deps carry them, the tokens only when a chart is built), call the cache, or build a chart nothing asked for.
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {ChartOptions} from '../../ui/chart-options.ts';
import {
  bucket,
  heatmapOptions,
  heatScale,
  outsideChartOptions,
  roomChartOptions,
  selectedSeries,
  type ClimateHistoryData,
  type ClimateTokens,
  type HeatRow,
} from './history.ts';

/** What a build reads of the page: the formats and words, the theme, the language, the narrow screen, and the page's colours when a chart is made. */
export interface ClimateChartsDeps {
  fmt: Formatters;
  t: Translate;
  dark: boolean;
  language: string;
  compact: boolean;
  /** Read from the page's custom properties; called only when a chart is built. */
  tokens: () => ClimateTokens;
}

/** What the detail asks the charts for: the range's history, the selection and the words that name its lines, and the rooms of the heatmap. */
export interface ClimateChartsRequest {
  history: ClimateHistoryData;
  selection: string;
  /** The room chart's line: the room, the heat pump or the house average. */
  name: string;
  /** Every room's key: the house's line is their mean. */
  roomKeys: readonly string[];
  /** The tablet draws the heatmap, a row per room in the order given, and the outside chart; the phone's sheet only the room's chart, so it gives none. */
  heatmapRooms: readonly {key: string; name: string}[] | null;
}

/** The options of what is drawn; null where the request did not ask, or where there is nothing to draw (a house without thermostats has no heatmap). */
export interface ClimateOptions {
  chart: ChartOptions;
  heatmap: ChartOptions | null;
  outside: ChartOptions | null;
}

/** A chart's last build: what it was made from (the history by identity, the rest as text) and the options it made. */
interface Slot {
  history: ClimateHistoryData;
  key: string;
  options: ChartOptions;
}

export class ClimateCharts {
  private chart: Slot | undefined;
  private heatmap: Slot | undefined;
  private outside: Slot | undefined;

  /** The three charts' options for this request: a chart whose slot is for the same history, selection, theme and language keeps its options. */
  build(request: ClimateChartsRequest, deps: ClimateChartsDeps): ClimateOptions {
    const {history, selection, name, roomKeys, heatmapRooms} = request;
    const {range} = history;
    const base = `${range}/${deps.dark}/${deps.language}`;
    const own = () => ({fmt: deps.fmt, t: deps.t, tokens: deps.tokens(), now: history.at, compact: deps.compact});
    this.chart = this.slot(this.chart, history, `${base}/${selection}/${name}`, () =>
      roomChartOptions(
        {name, ...selectedSeries(history, selection, roomKeys), outside: history.out, heatPump: selection === 'hp'},
        range,
        own(),
      ),
    );
    this.heatmap = !heatmapRooms?.length
      ? undefined
      : this.slot(
          this.heatmap,
          history,
          `${base}/${deps.compact}/${heatmapRooms.map(room => room.name).join('|')}`,
          () => {
            const rows: HeatRow[] = heatmapRooms.map(room => ({
              name: room.name,
              cells: bucket(history.rooms[room.key] ?? [], range, deps),
            }));
            return heatmapOptions(rows, range, heatScale(deps.dark), own());
          },
        );
    this.outside = heatmapRooms
      ? this.slot(this.outside, history, base, () => outsideChartOptions(history.out, range, own()))
      : undefined;
    return {chart: this.chart.options, heatmap: this.heatmap?.options ?? null, outside: this.outside?.options ?? null};
  }

  // the slot as it was when it is for the same history and key, else a new one made by `make`
  private slot(previous: Slot | undefined, history: ClimateHistoryData, key: string, make: () => ChartOptions): Slot {
    return previous?.history === history && previous.key === key ? previous : {history, key, options: make()};
  }
}
