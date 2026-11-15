// <hp-air-detail>: the Air detail: a card per purifier, the metric's history over a range, the outside air and its history.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the view model the pane hands down and the pure history.ts, rooms keyed (Lit docs,
// repeat); the statistics come through the pane's cache (read-through, spec 15) and the charts through <hp-chart> (ADR 0022). The range and the
// metric are the pane's (controlled component): a tap is told upward as `range-chosen` and `metric-chosen`, and the pane hands the choice back.
// Must not: read an entity (the pane's model did), call the API client for statistics but through the cache, mutate a cached reply, or open a sheet itself.
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import {repeat} from 'lit/directives/repeat.js';
import {StaleReply} from '../../core/api.ts';
import type {StatisticRow} from '../../core/ha.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import './room-card.ts'; // defines <hp-air-room>
import detailOwn from './air-detail.element.css?inline';
import airShared from './styles.css?inline';
import {
  airChartOptions,
  metricIds,
  metricSeries,
  outdoorChartOptions,
  outdoorSeries,
  rangeTabs,
  statisticsStart,
  type AirChartDeps,
  type AirTokens,
  type ChartMetric,
  type MetricSeries,
  type OutdoorSeries,
} from './history.ts';
import type {AirInputs} from './inputs.ts';
import type {AirViewModel, OutsideDetail} from './model.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import type {ChartOptions} from '../../ui/chart-options.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/range-tabs.ts'; // defines <hp-range-tabs>
import type {RangeChangeDetail} from '../../ui/range-tabs.ts';
import {RANGES, type Range} from '../../ui/ranges.ts';
import {chart, common, inner, seg, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

type Detail = AirViewModel['detail'];
type Rows = Readonly<Record<string, readonly StatisticRow[]>>;

/** What a tap on a metric says: the metric now chosen. */
export interface MetricChosenDetail {
  metric: ChartMetric;
}

/** The metric's statistics as they arrived, with what they were asked for and the instant they were asked at (the axis ends there). */
interface MetricLoad {
  range: Range;
  metric: ChartMetric;
  series: MetricSeries;
  at: number;
}

interface OutdoorLoad {
  range: Range;
  series: OutdoorSeries;
  at: number;
}

/** A line of a chart's legend: its swatch and its name. */
interface LegendItem {
  color: string;
  name: string;
}

/** A chart's options and legend, made for one load in one theme and language, so an update for anything else draws nothing again. */
interface Built<L> {
  load: L;
  base: string;
  options: ChartOptions;
  legend: LegendItem[];
}

/** One chart's place: what the last request was for (`generation/range/metric/ids`: answered, failed or in flight), its reply and its options. */
interface ChartSlot<L extends {at: number}> {
  asked: string | undefined;
  load: L | undefined;
  failed: boolean;
  built: Built<L> | undefined;
}

/** The words and the size of a chart's place; `empty` is shown instead of a chart with no line, where the house has no source. */
interface ChartPlace {
  height: number;
  label: string;
  unavailable: string;
  empty?: string;
}

/** What a chart's `make` returns, `airChartOptions` or `outdoorChartOptions`: `<hp-chart>`'s options, with the legend's names and colours. */
type MadeOptions = ChartOptions & Parameters<typeof legendOf>[0];

const emptySlot = <L extends {at: number}>(): ChartSlot<L> => ({
  asked: undefined,
  load: undefined,
  failed: false,
  built: undefined,
});

/** A chart's options are stale when its statistics are not the ones they were built from, or the theme or the language changed. */
const needsBuild = (slot: ChartSlot<{at: number}>, base: string): boolean =>
  !!slot.load && (slot.built?.load !== slot.load || slot.built.base !== base);

/** The mean of each sensor over the range, through the cache; no sensor, no request (a house with none has nothing to chart). */
const rowsOf = (cache: StatisticsCache, ids: readonly string[], range: Range, now: number): Promise<Rows> =>
  ids.length
    ? cache.statistics([...ids], RANGES[range].period, statisticsStart(now, range), ['mean'])
    : Promise.resolve({});

/** The detail's badge, the legacy sheet's own art (the wind's three lines), where the rail and the phone's header draw the `aq` icon. */
export const detailIcon = svg`<svg
  width="26"
  height="26"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  aria-hidden="true"
>
  <path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" />
</svg>`;

/** The names and colours of the lines of options built by `airChartOptions` or `outdoorChartOptions`: the colours list may run one over. */
function legendOf(options: {series: {name: string}[]; colors: string[]}): LegendItem[] {
  return options.series.map(({name}, index) => ({name, color: options.colors[index]}));
}

export class AirDetail extends LitElement {
  static override properties = {
    view: {attribute: false},
    inputs: {attribute: false},
    cache: {attribute: false},
    range: {},
    metric: {},
  };
  /** The pane's view model of the detail: the rooms, the history's words, the outside block. */
  declare view: Detail | undefined;
  /** What the pane read: the rooms' and the station's sensor ids, which the statistics are asked for. */
  declare inputs: AirInputs | undefined;
  /** The pane's statistics cache. */
  declare cache: StatisticsCache | undefined;
  /** The range and the metric chosen: the pane keeps the last choice for the panel's life and passes it in, as the legacy sheet kept its own. */
  declare range: Range;
  declare metric: ChartMetric;

  // The kit's wells, tiles, radios and legend; the feature's `.aqsum` state line (styles.css, shared with the card); the element's own rules last.
  static override styles = [
    common,
    inner,
    tiles,
    seg,
    chart,
    unsafeCSS(forShadow(airShared)),
    unsafeCSS(forShadow(detailOwn)),
  ];

  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);

  // the two charts, the metric's and the outdoor index's: each its own request, reply and options
  private readonly metricSlot = emptySlot<MetricLoad>();
  private readonly outdoorSlot = emptySlot<OutdoorLoad>();

  constructor() {
    super();
    this.view = undefined;
    this.inputs = undefined;
    this.cache = undefined;
    this.range = 'day';
    this.metric = 'pm2_5';
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // a reply on its way finds the detail gone and is dropped; coming back asks again
    this.metricSlot.asked = undefined;
    this.outdoorSlot.asked = undefined;
  }

  // The options of a chart are rebuilt only when what they are made of changed: new statistics, the theme or the language. An update for
  // anything else (a room's reading) leaves the charts' `options` the objects they were, so `<hp-chart>` is not asked to draw the same lines again.
  protected override willUpdate(): void {
    const {metricSlot, outdoorSlot} = this;
    const base = `${this.appearance.value?.theme ?? 'light'}/${this.storeController.store.language}`;
    if (!needsBuild(metricSlot, base) && !needsBuild(outdoorSlot, base)) return;
    const style = getComputedStyle(this);
    const token = (name: string) => style.getPropertyValue(name).trim();
    const tokens: AirTokens = {
      rooms: [token('--c-home'), token('--c-wh'), token('--c-heat'), token('--c-ev')],
      station: token('--c-rest'),
      ok: token('--ok'),
      warn: token('--warn'),
      muted: token('--fg3'),
      aqi: token('--m-orange'),
      aqhi: token('--m-purple'),
    };
    this.rebuild(metricSlot, base, tokens, (load, deps) => airChartOptions(load.series, load.metric, load.range, deps));
    this.rebuild(outdoorSlot, base, tokens, (load, deps) => outdoorChartOptions(load.series, load.range, deps));
  }

  // one chart's options, built again only when `needsBuild` says so; the other chart's stay the objects they were
  private rebuild<L extends {at: number}>(
    slot: ChartSlot<L>,
    base: string,
    tokens: AirTokens,
    make: (load: L, deps: AirChartDeps) => MadeOptions,
  ): void {
    const {load} = slot;
    if (!load || !needsBuild(slot, base)) return;
    const {fmt, t} = this.storeController.store;
    const options = make(load, {fmt, t, tokens, now: load.at});
    slot.built = {load, base, options, legend: legendOf(options)};
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    const compact = this.appearance.value?.compact === true;
    return html`<div
        class="blocks"
        role=${ifDefined(compact ? undefined : 'dialog')}
        aria-label=${ifDefined(compact ? undefined : view.title)}
      >
        ${compact ? nothing : this.renderHeader(view)}
        <div class="aqrooms">
          ${repeat(
            view.rooms,
            room => room.id,
            room => html`<hp-air-room .room=${room}></hp-air-room>`,
          )}
        </div>
        ${this.renderHistory(view.history)} ${this.renderOutside(view)}
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  // On a tablet the detail opens with its own header, the pane's being the phone's; on a phone the sheet draws it, tabs included.
  private renderHeader({title, sub}: Detail) {
    const {t} = this.storeController.store;
    return html`<hp-pane-header .icon=${'aq'} .color=${'var(--ok)'} .heading=${title}>
      <span slot="icon">${detailIcon}</span>
      <div slot="sub">${sub}</div>
      <hp-range-tabs
        slot="actions"
        .ranges=${rangeTabs(t)}
        .value=${this.range}
        @range-change=${this.onRange}
      ></hp-range-tabs>
    </hp-pane-header>`;
  }

  private renderLegend(items: readonly LegendItem[] | undefined) {
    return html`<div class="legend">
      ${items?.map(({color, name}) => html`<span><b style=${`background:${color}`}></b>${name}</span>`)}
    </div>`;
  }

  // a chart's place: the failure word, the loading word, the empty word when a built chart has no line, else the chart
  private renderChart<L extends {at: number}>(slot: ChartSlot<L>, {height, label, unavailable, empty}: ChartPlace) {
    const {built} = slot;
    if (slot.failed) return html`<p>${unavailable}</p>`;
    if (!built) return html`<p class="loading">${this.storeController.store.t('air.historyLoading')}</p>`;
    if (empty !== undefined && !built.legend.length) return html`<p class="loading">${empty}</p>`;
    return html`<hp-chart .height=${height} .label=${label} .options=${built.options}></hp-chart>`;
  }

  private renderHistory(history: Detail['history']) {
    const {metricSlot} = this;
    return html`<div class="inner">
      <h3>${history.title}</h3>
      <p>${history.caption}</p>
      <div class="seg aqmetric" role="radiogroup" aria-label=${history.label}>
        ${repeat(
          history.metrics,
          ({metric}) => metric,
          ({metric, label}) =>
            html`<button
              type="button"
              role="radio"
              aria-checked=${metric === history.metric ? 'true' : 'false'}
              @click=${() => this.onMetric(metric)}
            >
              <b>${label}</b>
            </button>`,
        )}
      </div>
      ${this.renderLegend(metricSlot.built?.legend)}
      ${this.renderChart(metricSlot, {
        height: 280,
        label: `${history.title}. ${history.caption}`,
        unavailable: history.unavailable,
      })}
    </div>`;
  }

  // the station's reading and the pollen, then the outdoor chart: either part is left out of a house that has no source for it
  private renderOutside({outside, outdoorChart, history}: Detail) {
    if (!outside && !outdoorChart) return nothing;
    const {outdoorSlot} = this;
    return html`<div class="inner">
      ${outside ? this.renderStation(outside) : nothing}
      ${
        outdoorChart
          ? html`<h3 class=${classMap({again: !!outside})}>${outdoorChart.title}</h3>
              <p>${outdoorChart.hint}</p>
              ${this.renderLegend(outdoorSlot.built?.legend)}
              ${this.renderChart(outdoorSlot, {
                height: 240,
                label: `${outdoorChart.title}. ${outdoorChart.hint}`,
                unavailable: history.unavailable,
                empty: outdoorChart.empty,
              })}`
          : nothing
      }
    </div>`;
  }

  private renderStation({title, hint, tone, state, reading, more, pollen, pollenHint}: OutsideDetail) {
    return html`<h3>${title}</h3>
      <p>${hint}</p>
      <div class=${`aqsum lv${tone}`}>
        <span class="state"><i></i>${state}</span
        ><span class="why">${reading.label} <b class="num">${reading.value}</b>${more ? ` · ${more}` : ''}</span>
      </div>
      ${
        pollen
          ? html`<div class="tiles pollen">
              ${repeat(
                pollen,
                tile => tile.label,
                tile =>
                  html`<div class="tile">
                    <div class="k">${tile.label}</div>
                    <div class="v num">${tile.value}</div>
                  </div>`,
              )}
            </div>`
          : html`<p class="hint">${pollenHint}</p>`
      }`;
  }

  private readonly onRange = (event: CustomEvent<RangeChangeDetail>): void => {
    this.dispatchEvent(new CustomEvent<RangeChangeDetail>('range-chosen', {detail: event.detail}));
  };

  private onMetric(metric: ChartMetric): void {
    if (metric !== this.metric)
      this.dispatchEvent(new CustomEvent<MetricChosenDetail>('metric-chosen', {detail: {metric}}));
  }

  protected override updated(): void {
    this.loadIfDue();
  }

  // The statistics are asked for when the detail first shows and when the range or the metric chosen, the config or the sensors listed change;
  // a pair seen before, within the ten minutes the pane's cache keeps, is the cache's hit, the start being the hour's top.
  private loadIfDue(): void {
    const {cache, inputs, view, range, metric} = this;
    if (!cache || !inputs || !view) return;
    const {generation} = this.storeController.store;
    const ids = metricIds(inputs, metric);
    const metricKey = `${generation}/${range}/${metric}/${ids.join(',')}`;
    if (this.metricSlot.asked !== metricKey) {
      const now = Date.now();
      void this.load(this.metricSlot, metricKey, 'air history', async () => {
        const rows = await rowsOf(cache, ids, range, now);
        return {range, metric, series: metricSeries(rows, inputs, metric, range), at: now};
      });
    }
    const outdoor = {aqi: inputs.outside?.aqi ?? null, aqhi: inputs.aqhiId};
    const outdoorIds = [outdoor.aqi, outdoor.aqhi].filter((id): id is string => !!id);
    const outdoorKey = `${generation}/${range}/${outdoorIds.join(',')}`;
    if (view.outdoorChart && this.outdoorSlot.asked !== outdoorKey) {
      const now = Date.now();
      void this.load(this.outdoorSlot, outdoorKey, 'outdoor air history', async () => {
        const rows = await rowsOf(cache, outdoorIds, range, now);
        return {range, series: outdoorSeries(rows, outdoor, range), at: now};
      });
    }
  }

  // a reply is stale when the detail left, or another range, metric, config or list of sensors was asked for meanwhile
  private isStale(slot: ChartSlot<{at: number}>, key: string): boolean {
    return !this.isConnected || slot.asked !== key;
  }

  // One request for one chart: the slot forgets a failure and remembers the key, a stale reply is dropped, a `StaleReply` (the cache's
  // own word for a request it superseded) is no failure, and any other error is logged with the chart's name and shown as unavailable.
  private async load<L extends {at: number}>(
    slot: ChartSlot<L>,
    key: string,
    what: string,
    fetch: () => Promise<L>,
  ): Promise<void> {
    slot.asked = key;
    slot.failed = false;
    try {
      const load = await fetch();
      if (this.isStale(slot, key)) return;
      slot.load = load;
    } catch (error) {
      if (this.isStale(slot, key) || error instanceof StaleReply) return;
      console.error(`home-panel ${what}`, error);
      slot.failed = true;
    }
    this.requestUpdate();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-air-detail': AirDetail;
  }
}

if (!customElements.get('hp-air-detail')) customElements.define('hp-air-detail', AirDetail);
