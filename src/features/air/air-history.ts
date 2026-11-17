// <hp-air-history>: one reading's history: a sheet with the range tabs and a chart of that reading in the tapped room, with the outdoor station's PM2.5 beside it.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the pure history.ts: `metricIds`, `metricSeries`, `chartText` and `airChartOptions` make what
// it places; the statistics come through the pane's cache (read-through, spec 15) and the chart through <hp-chart> (ADR 0022). The range is the pane's
// (controlled component): a tap on a tab is told upward as `range-chosen`, and the pane hands the choice back. After Weather's `<hp-weather-history>`.
// It exists only while the sheet is open, so it loads while connected and lets go on disconnect: a reply on its way is dropped, the chart goes.
// Must not: read an entity (the pane's inputs name the sensors), call the API client but through the cache, mutate a cached reply, or open or close a sheet itself.
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {StaleReply} from '../../core/api.ts';
import type {StatisticRow} from '../../core/ha.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import historyOwn from './air-history.element.css?inline';
import {
  airChartOptions,
  airTokensFrom,
  chartText,
  forRoom,
  metricIds,
  metricSeries,
  METRICS,
  rangeTabs,
  statisticsStart,
  type HistoryRequest,
  type Metric,
  type MetricSeries,
} from './history.ts';
import type {AirInputs} from './inputs.ts';
import {HISTORY_SHEET} from './sheets.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import type {ChartOptions} from '../../ui/chart-options.ts';
import {emptyChartText} from '../../ui/chart-notice.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetDismissEvent} from '../../ui/events.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/range-tabs.ts'; // defines <hp-range-tabs>
import type {RangeChangeDetail} from '../../ui/range-tabs.ts';
import {RANGES, type Range} from '../../ui/ranges.ts';
import '../../ui/sheet.ts'; // defines <hp-sheet>
import {chart, common, inner} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** What a request brought back, with what it was asked for and the instant it was asked at (the axis ends there). */
interface Loaded {
  range: Range;
  metric: Metric;
  series: MetricSeries;
  at: number;
}

/** The chart's options, made for one load in one theme and language, so an update for anything else draws nothing again. */
interface Built {
  loaded: Loaded;
  base: string;
  options: ChartOptions;
  legend: {name: string; color: string}[];
}

export class AirHistory extends LitElement {
  static override properties = {
    request: {attribute: false},
    inputs: {attribute: false},
    cache: {attribute: false},
    range: {},
  };
  /** Which reading of which room: what the tile asked for, bound by the pane from the sheet host's detail. */
  declare request: HistoryRequest | undefined;
  /** What the pane read: the room's sensor and the station's, which the statistics are asked for. */
  declare inputs: AirInputs | undefined;
  /** The pane's statistics cache, whose replies are shared: nothing here changes one. */
  declare cache: StatisticsCache | undefined;
  /** The range chosen: the pane keeps the last choice for the panel's life and passes it in. */
  declare range: Range;

  // The element's own rules, its `:host` and the inner card on a phone, are in air-history.element.css.
  static override styles = [common, inner, chart, unsafeCSS(forShadow(historyOwn))];

  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);

  private loaded: Loaded | undefined;
  private built: Built | undefined;
  private failed = false;
  /** What the last request was for, answered, failed or in flight. */
  private asked: string | undefined;

  constructor() {
    super();
    this.request = undefined;
    this.inputs = undefined;
    this.cache = undefined;
    this.range = 'day';
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // a reply on its way finds the sheet gone and is dropped; the chart goes with its element
    this.asked = undefined;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // another reading is a new opening
    if (changed.has('request')) {
      this.loaded = undefined;
      this.built = undefined;
      this.failed = false;
      this.asked = undefined;
    }
    // The options are made again only when a reply, the theme or the language changed: an update for anything else (a room's reading)
    // leaves the chart the object it was, so <hp-chart> is not asked to draw the same lines again.
    const {loaded} = this;
    if (!loaded) return;
    const {store} = this.storeController;
    const base = `${this.appearance.value?.theme ?? 'light'}/${store.language}`;
    if (this.built?.loaded === loaded && this.built.base === base) return;
    const style = getComputedStyle(this);
    const tokens = airTokensFrom(name => style.getPropertyValue(name).trim());
    const options = airChartOptions(loaded.series, loaded.metric, loaded.range, {
      fmt: store.fmt,
      t: store.t,
      tokens,
      now: loaded.at,
    });
    this.built = {
      loaded,
      base,
      options,
      legend: options.series.map(({name}, index) => ({name, color: options.colors[index]})),
    };
  }

  protected override render() {
    const {request, inputs} = this;
    const room = request && inputs?.rooms.find(candidate => candidate.fanId === request.room);
    if (!request || !room) return nothing;
    const {t, fmt} = this.storeController.store;
    const text = chartText(request.metric, this.range, {t, fmt});
    return html`<hp-sheet
        .open=${true}
        .icon=${'aq'}
        .color=${'var(--ok)'}
        .heading=${t(METRICS[request.metric].label)}
        .closeLabel=${t('air.close')}
        @sheet-close=${this.dismiss}
      >
        <div slot="sub">${room.name}</div>
        <hp-range-tabs
          slot="tabs"
          .ranges=${rangeTabs(t)}
          .value=${this.range}
          @range-change=${this.onRange}
        ></hp-range-tabs>
        <div class="inner">
          <h3>${text.title}</h3>
          <p>${text.caption}</p>
          ${this.renderBody(`${text.title}. ${text.caption}`)}
        </div>
      </hp-sheet>
      ${lensLike(this.getRootNode())}`;
  }

  // the chart with its legend, or the line that says why there is none: the failure, the wait, no points at all
  private renderBody(label: string) {
    const {t} = this.storeController.store;
    if (this.failed) return html`<p>${t('air.historyUnavailable')}</p>`;
    const {built} = this;
    if (!built) return html`<p class="loading">${t('air.historyLoading')}</p>`;
    const {series} = built.loaded;
    if (!series.rooms.some(line => line.points.length) && !series.outside?.length)
      return html`<p class="loading">${emptyChartText(t)}</p>`;
    return html`<div class="legend">
        ${built.legend.map(({color, name}) => html`<span><b style=${`background:${color}`}></b>${name}</span>`)}
      </div>
      <hp-chart .height=${280} .label=${label} .options=${built.options}></hp-chart>`;
  }

  // the tabs' choice goes to the pane, which hands it back
  private readonly onRange = (event: CustomEvent<RangeChangeDetail>): void => {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent<RangeChangeDetail>('range-chosen', {detail: event.detail}));
  };

  // the sheet's Close button, its backdrop and its swipe: the host closes it, the element only says so
  private readonly dismiss = (event: Event): void => {
    event.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(HISTORY_SHEET));
  };

  protected override updated(): void {
    const {request, inputs} = this;
    // a purifier Home Assistant no longer lists has no history to show: the host is asked to close the sheet
    if (request && inputs && !inputs.rooms.some(room => room.fanId === request.room)) {
      this.dispatchEvent(new SheetDismissEvent(HISTORY_SHEET));
      return;
    }
    this.loadIfDue();
  }

  // The statistics are asked for when the sheet first shows and when the range, the config or the sensors change; a pair seen before, within
  // the ten minutes the pane's cache keeps, is the cache's hit, the start being the hour's top.
  private loadIfDue(): void {
    const {cache, inputs, request, range} = this;
    if (!cache || !inputs || !request) return;
    const scoped = forRoom(inputs, request.room);
    const ids = metricIds(scoped, request.metric);
    const key = `${this.storeController.store.generation}/${range}/${request.metric}/${request.room}/${ids.join(',')}`;
    if (this.asked === key) return;
    this.asked = key;
    this.failed = false;
    void this.load(cache, key, ids, scoped, request.metric, range);
  }

  // a reply is stale when the sheet left, or another reading, range, config or list of sensors was asked for meanwhile
  private async load(
    cache: StatisticsCache,
    key: string,
    ids: string[],
    scoped: ReturnType<typeof forRoom>,
    metric: Metric,
    range: Range,
  ): Promise<void> {
    const at = Date.now();
    try {
      // no sensor, no request: a room without this one has nothing to chart
      const rows: Readonly<Record<string, readonly StatisticRow[]>> = ids.length
        ? await cache.statistics(ids, RANGES[range].period, statisticsStart(at, range), ['mean'])
        : {};
      if (!this.isConnected || this.asked !== key) return;
      this.loaded = {range, metric, series: metricSeries(rows, scoped, metric, range), at};
    } catch (error) {
      if (!this.isConnected || this.asked !== key || error instanceof StaleReply) return;
      console.error('home-panel air history', error);
      this.failed = true;
    }
    this.requestUpdate();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-air-history': AirHistory;
  }
}

if (!customElements.get('hp-air-history')) customElements.define('hp-air-history', AirHistory);
