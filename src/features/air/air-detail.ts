// <hp-air-detail>: the Air detail: a card per purifier (its tiles open their reading's history, which the pane draws), the outside air and its history.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the view model the pane hands down and the pure history.ts, rooms keyed (Lit docs,
// repeat); the statistics come through the pane's cache (read-through, spec 15) and the chart through <hp-chart> (ADR 0022). The range is the
// pane's (controlled component): a tap is told upward as `range-chosen`, and the pane hands the choice back.
// Must not: read an entity (the pane's model did), call the API client for statistics but through the cache, mutate a cached reply, or open a sheet itself.
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {repeat} from 'lit/directives/repeat.js';
import {StaleReply} from '../../core/api.ts';
import type {StatisticRow} from '../../core/ha.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import './room-card.ts'; // defines <hp-air-room>
import detailOwn from './air-detail.element.css?inline';
import airShared from './styles.css?inline';
import {
  airTokensFrom,
  aqhiOptions,
  outdoorAqiOptions,
  outdoorSeries,
  rangeTabs,
  statisticsStart,
  type OutdoorSeries,
} from './history.ts';
import type {AirInputs} from './inputs.ts';
import {toneClass, type AirViewModel, type OutsideDetail} from './model.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import type {ChartOptions} from '../../ui/chart-options.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {lens} from '../../ui/lens.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/range-tabs.ts'; // defines <hp-range-tabs>
import type {RangeChangeDetail} from '../../ui/range-tabs.ts';
import {RANGES, type Range} from '../../ui/ranges.ts';
import {common, inner, status, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

type Detail = AirViewModel['detail'];
type Rows = Readonly<Record<string, readonly StatisticRow[]>>;

/** The outdoor air's statistics as they arrived, with what they were asked for and the instant they were asked at (the axis ends there). */
interface OutdoorLoad {
  range: Range;
  series: OutdoorSeries;
  at: number;
}

/** The two outdoor charts' options, built for one load in one theme and language: a chart with no points has none, and an update for anything else draws nothing again. */
interface Built {
  load: OutdoorLoad;
  base: string;
  aqi: ChartOptions | null;
  aqhi: ChartOptions | null;
}

/** The charts' place: what the last request was for (`generation/range/ids`: answered, failed or in flight), its reply and its options. */
interface ChartSlot {
  asked: string | undefined;
  load: OutdoorLoad | undefined;
  failed: boolean;
  built: Built | undefined;
}

/** The height of each of the two charts. */
const CHART_HEIGHT = 180;

const emptySlot = (): ChartSlot => ({asked: undefined, load: undefined, failed: false, built: undefined});

/** The options are stale when the statistics are not the ones they were built from, or the theme or the language changed. */
const needsBuild = (slot: ChartSlot, base: string): boolean =>
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

export class AirDetail extends LitElement {
  static override properties = {
    view: {attribute: false},
    inputs: {attribute: false},
    cache: {attribute: false},
    range: {},
  };
  /** The pane's view model of the detail: the rooms, the history's words, the outside block. */
  declare view: Detail | undefined;
  /** What the pane read: the rooms' and the station's sensor ids, which the statistics are asked for. */
  declare inputs: AirInputs | undefined;
  /** The pane's statistics cache. */
  declare cache: StatisticsCache | undefined;
  /** The range chosen: the pane keeps the last choice for the panel's life and passes it in, as the legacy sheet kept its own. */
  declare range: Range;

  // The kit's wells, status text, tiles and radios; the feature's `.aqsum` state line (styles.css); the element's own rules last.
  static override styles = [
    common,
    inner,
    status,
    tiles,
    unsafeCSS(forShadow(airShared)),
    unsafeCSS(forShadow(detailOwn)),
  ];

  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);

  // the outdoor air's two charts: their request, reply and options
  private readonly outdoorSlot = emptySlot();

  constructor() {
    super();
    this.view = undefined;
    this.inputs = undefined;
    this.cache = undefined;
    this.range = 'day';
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // a reply on its way finds the detail gone and is dropped; coming back asks again
    this.outdoorSlot.asked = undefined;
  }

  // The options of the charts are rebuilt only when what they are made of changed: new statistics, the theme or the language. An update for
  // anything else (a room's reading) leaves each chart's `options` the object it was, so `<hp-chart>` is not asked to draw the same lines again.
  protected override willUpdate(): void {
    const {outdoorSlot: slot} = this;
    const base = `${this.appearance.value?.theme ?? 'light'}/${this.storeController.store.language}`;
    const {load} = slot;
    if (!load || !needsBuild(slot, base)) return;
    const style = getComputedStyle(this);
    const {fmt, t} = this.storeController.store;
    const deps = {fmt, t, tokens: airTokensFrom(name => style.getPropertyValue(name).trim()), now: load.at};
    const {aqi, aqhi} = load.series;
    slot.built = {
      load,
      base,
      aqi: aqi.length ? outdoorAqiOptions(aqi, load.range, deps) : null,
      aqhi: aqhi.length ? aqhiOptions(aqhi, load.range, deps) : null,
    };
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    const compact = this.appearance.value?.compact === true;
    return html`<div
        class="blocks"
        role=${ifDefined(compact ? undefined : 'region')}
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
        ${this.renderOutside(view)}
      </div>
      ${lens}`;
  }

  // On a tablet the detail opens with its own header, the pane's being the phone's; on a phone the pane's header (inline) or the sheet's (over another tab) draws it, tabs included.
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

  // one chart's block: its name, what its scale means, and the chart
  private renderChart(title: string, caption: string, options: ChartOptions) {
    return html`<section class="outdoor-chart">
      <h4>${title}</h4>
      <p>${caption}</p>
      <hp-chart .height=${CHART_HEIGHT} .label=${`${title}. ${caption}`} .options=${options}></hp-chart>
    </section>`;
  }

  // the outside block's charts: the failure word, the loading word, the empty word when neither series has a point, else a chart for each that has
  private renderCharts({aqi, aqhi, empty}: NonNullable<Detail['outdoorChart']>) {
    const {outdoorSlot: slot} = this;
    const {built} = slot;
    if (slot.failed) return html`<p>${this.storeController.store.t('air.historyUnavailable')}</p>`;
    if (!built) return html`<p class="loading">${this.storeController.store.t('air.historyLoading')}</p>`;
    if (!built.aqi && !built.aqhi) return html`<p class="loading">${empty}</p>`;
    return html`${built.aqi ? this.renderChart(aqi.title, aqi.caption, built.aqi) : nothing}
    ${built.aqhi ? this.renderChart(aqhi.title, aqhi.caption, built.aqhi) : nothing}`;
  }

  // the station's reading and the pollen, then the outdoor charts, each a block of the column: either is left out of a house that has no source for it
  private renderOutside({outside, outdoorChart}: Detail) {
    return html`${outside ? html`<div class="inner">${this.renderStation(outside)}</div>` : nothing}
    ${
      outdoorChart
        ? html`<div class="inner">
            <h3>${outdoorChart.title}</h3>
            ${this.renderCharts(outdoorChart)}
          </div>`
        : nothing
    }`;
  }

  private renderStation({title, hint, tone, state, reading, more, pollen, pollenHint}: OutsideDetail) {
    return html`<h3>${title}</h3>
      <p>${hint}</p>
      <div class="aqsum">
        <span class=${`status ${toneClass(tone)}`}><i aria-hidden="true"></i>${state}</span
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

  protected override updated(): void {
    this.loadIfDue();
  }

  // The statistics are asked for when the detail first shows and when the range chosen, the config or the sensors listed change;
  // a pair seen before, within the ten minutes the pane's cache keeps, is the cache's hit, the start being the hour's top.
  private loadIfDue(): void {
    const {cache, inputs, view, range} = this;
    if (!cache || !inputs || !view) return;
    const {generation} = this.storeController.store;
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

  // a reply is stale when the detail left, or another range, config or list of sensors was asked for meanwhile
  private isStale(slot: ChartSlot, key: string): boolean {
    return !this.isConnected || slot.asked !== key;
  }

  // One request for the charts: the slot forgets a failure and remembers the key, a stale reply is dropped, a `StaleReply` (the cache's
  // own word for a request it superseded) is no failure, and any other error is logged with the chart's name and shown as unavailable.
  private async load(slot: ChartSlot, key: string, what: string, fetch: () => Promise<OutdoorLoad>): Promise<void> {
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
