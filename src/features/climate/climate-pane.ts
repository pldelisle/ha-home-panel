// <hp-climate-pane>: the Climate tab: on a phone the header with the summary, a grid of tiles and the detail's sheet (which a room view's tile opens over the room, on a tablet too); on a tablet the header with the range tabs, the list
// beside the selected item's detail, and the heatmap under them. It keeps the selection and the range the person chose; the chart's colours (the line, the heating bars, the setpoint) are read from the page's tokens when one is built.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `climateModel` runs in `willUpdate` and the template places what it returns; a store
// controller on `climateIds` (ADR 0012), paused while no part of the pane is on screen, and `ClimateHistory`, which loads the range shown (ADR 0028). The held values the model reads are the panel's overlay (ADR 0023).
// Must not: read an entity itself (`readClimate` does), hold a string the household reads, call the API (the history controller asks the cache), send a command (the detail's controls do), or open the sheet (a tile asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {ClimateCharts, type ClimateOptions} from './charts.ts';
import './climate-detail.ts'; // defines <hp-climate-detail>
import './climate-list.ts'; // defines <hp-climate-list>
import {chartPlace} from './chart-place.ts';
import tilesOwn from './climate-tiles.css?inline';
import {climateTile} from './climate-tiles.ts';
import {detailIcon} from './climate-detail.ts';
import type {SelectDetail} from './climate-list.ts';
import paneOwn from './climate-pane.element.css?inline';
import './heatmap-legend.ts'; // defines <hp-heat-legend>
import {climateIds} from './ids.ts';
import {readClimate} from './inputs.ts';
import {ClimateHistory} from './loader.ts';
import type {ClimateHistoryData} from './history.ts';
import {climateModel, type ClimateSelection, type ClimateViewModel, type HeatmapBlock} from './model.ts';
import {DETAIL_SHEET} from './sheets.ts';
import {registriesOf} from '../../core/registry.ts';
import type {RoomPower} from '../../providers/power.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {statisticsCacheContext} from '../../ui/contexts.ts';
import {SheetDismissEvent, SheetRequestEvent} from '../../ui/events.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/range-tabs.ts'; // defines <hp-range-tabs>
import type {RangeChangeDetail, RangeTab} from '../../ui/range-tabs.ts';
import {RANGES, type Range} from '../../ui/ranges.ts';
import '../../ui/sheet.ts'; // defines <hp-sheet>
import type {TileOpenDetail} from '../../ui/stat-tile.ts';
import {chart, common, inner} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import type {Translate} from '../../core/i18n/messages.ts';

/** The range the detail starts on, and keeps for the panel's life once another is chosen. */
const DEFAULT_RANGE: Range = 'day';
/** The detail's range tabs, worded by `t`: the tablet's header and the phone sheet's both draw them. */
const rangeTabs = (t: Translate): RangeTab[] =>
  (Object.keys(RANGES) as Range[]).map(range => ({range, label: t(RANGES[range].tabKey)}));

/** What a sheet was asked to show: the room a tile chose, or the house when it was asked with nothing (Home's tile). */
function selectionOf(detail: unknown): ClimateSelection {
  const sel = typeof detail === 'object' && detail !== null && 'sel' in detail ? detail.sel : undefined;
  return typeof sel === 'string' ? sel : 'house';
}

export class ClimatePane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    detailOpen: {type: Boolean},
    detail: {attribute: false},
    over: {type: Boolean},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and keeps what it drew. */
  declare active: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('climate.detail')`: the phone's sheet is on screen. */
  declare detailOpen: boolean;
  /** Bound by the registry's template to what the open sheet was asked to show: `{sel}` from a tile, nothing from Home's. */
  declare detail: unknown;
  /** Bound by the registry's template to whether a room view is shown (ADR 0039): the detail is a sheet over the screen, on a tablet as on a phone. */
  declare over: boolean;

  // The element's own rules, its `:host`, the tablet's grid and the phone's tiles, are in climate-pane.element.css.
  static override styles = [common, inner, chart, unsafeCSS(forShadow(tilesOwn)), unsafeCSS(forShadow(paneOwn))];

  private cache: StatisticsCache | undefined;
  private readonly storeController = new StoreController(this, {ids: store => climateIds(store)});
  private readonly appearance = new AppearanceConsumer(this);
  // what the household asked for and Home Assistant has not confirmed: the dial and the controls hold it, the model reads it, and the pane draws again when it changes
  private readonly optimistic = new OptimisticController(this);
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);
  private readonly charts = new ClimateCharts();
  private view: ClimateViewModel | undefined;
  /** The options of the charts the view's range has the history for: null before the load. */
  private drawn: ClimateOptions | null = null;
  /** What the detail shows, kept for the panel's life: the house and a day until the person chooses. */
  private selection: ClimateSelection = 'house';
  private range: Range = DEFAULT_RANGE;
  private readonly history: ClimateHistory;

  /** The phone's layout, as the appearance context says; false until the context is provided. */
  private get compact(): boolean {
    return this.appearance.value?.compact === true;
  }
  constructor() {
    super();
    this.active = false;
    this.detailOpen = false;
    this.detail = undefined;
    this.over = false;
    // the panel's one cache is the shell's (ADR 0028): Energy's card and the legacy history ask it too, so each window is read once; the consumer
    // is made before the controller, so the cache is there when the controller's first update asks
    new ContextConsumer(this, {
      context: statisticsCacheContext,
      subscribe: false,
      callback: cache => {
        this.cache = cache;
      },
    });
    // the history is wanted while any part of the pane is on screen: the tab, or the sheet a tile (or Home's) opened
    this.history = new ClimateHistory(this, () =>
      this.detailShown ? {cache: this.cache, store: this.storeController.store, range: this.range} : null,
    );
  }

  /** The pane is on screen: it is the tab, or its sheet is open over the page (Home's tile asks for it). */
  private get shown(): boolean {
    return this.active || this.detailOpen;
  }

  /** The detail is a sheet over the screen, not the tablet's own column: on a phone, and while a room view is shown. */
  private get asSheet(): boolean {
    return this.compact || this.over;
  }

  /** The detail is on screen: the tablet's tab, or the sheet. The history is asked for then, not for the phone's tiles, nor on Home. */
  private get detailShown(): boolean {
    return this.asSheet ? this.detailOpen : this.active;
  }

  // The pause and the resume sit in willUpdate: a resume asks for an update, and one asked for here is this one.
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active') || changed.has('detailOpen')) {
      if (this.shown) this.storeController.resume();
      else this.storeController.pause();
    }
    // a sheet opens on what it was asked for: a tile's room, or the house from Home's tile
    if (changed.has('detailOpen') && this.detailOpen) this.selection = selectionOf(this.detail);
    if (!this.shown) return;
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    const inputs = readClimate(hass.states, registriesOf(hass), store.config);
    const {compact, range} = this;
    const history = this.history.data(range, store.generation);
    const view = (this.view = climateModel(inputs, history, this.selection, {
      t: store.t,
      fmt: store.fmt,
      names: store.names,
      language: store.language,
      overlay: this.overlay,
      compact,
      range,
      historyFailed: this.history.failed(range, store.generation),
    }));
    this.drawn = history ? this.drawCharts(history, view, inputs.rooms) : null;
  }

  // The charts' options for the view: the same objects as the last update's unless the history, the selection, the theme or the language changed (ClimateCharts)
  private drawCharts(
    history: ClimateHistoryData,
    {selection, detail}: ClimateViewModel,
    rooms: readonly RoomPower[],
  ): ClimateOptions {
    const {store} = this.storeController;
    const style = getComputedStyle(this);
    const token = (name: string) => style.getPropertyValue(name).trim();
    return this.charts.build(
      {
        history,
        selection,
        name: detail.chart.name,
        roomKeys: rooms.map(({key}) => key),
        heatmapRooms: detail.heatmap?.rooms ?? null,
      },
      {
        fmt: store.fmt,
        t: store.t,
        dark: this.appearance.value?.theme === 'dark',
        language: store.language,
        compact: this.compact,
        tokens: () => ({
          room: token('--c-wh'),
          heating: token('--c-wh'),
          outside: token('--c-home'),
          setpoint: token('--fg2'),
          card: token('--card'),
        }),
      },
    );
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    const {compact} = this;
    // a sheet over another tab or a room view: the pane is behind it and draws nothing but it, so the tab stays
    if (this.asSheet && !this.active) return this.detailOpen ? this.renderSheet(view) : nothing;
    if (compact) return html`${this.renderHeader(view)}${this.renderTiles(view)}${this.renderSheet(view)}`;
    return this.active ? this.renderTablet(view) : nothing;
  }

  // The phone's header: the heading and the summary, as the legacy summary panes' own.
  private renderHeader({summary}: ClimateViewModel) {
    const {t} = this.storeController.store;
    return html`<hp-pane-header .icon=${'therm'} .color=${'var(--c-wh)'} .heading=${t('climate.title')}>
      <div slot="sub">${summary}</div>
    </hp-pane-header>`;
  }

  // The phone's grid: one tile for the house, across the top, each room and the heat pump; a tile asks for the sheet on its room.
  private renderTiles({tiles}: ClimateViewModel) {
    return html`<div class="ctiles2" @tile-open=${this.onTile}>
      ${repeat(
        tiles,
        ({id}) => id,
        tile => climateTile(tile, tile.wide),
      )}
    </div>`;
  }

  // The tablet: the header with the range tabs, the list and the detail, and the heatmap under them.
  private renderTablet(view: ClimateViewModel) {
    const {t} = this.storeController.store;
    return html`<hp-pane-header .icon=${'therm'} .color=${'var(--c-home)'} .heading=${t('climate.homeClimate')}>
        <span slot="icon">${detailIcon}</span>
        <div slot="sub">${view.summary}</div>
        <hp-range-tabs
          slot="actions"
          .ranges=${rangeTabs(t)}
          .value=${this.range}
          @range-change=${this.onRange}
        ></hp-range-tabs>
      </hp-pane-header>
      <div class="clim">
        <hp-climate-list
          .items=${view.items}
          .selection=${view.selection}
          .label=${t('climate.rooms')}
          @select=${this.onSelect}
        ></hp-climate-list>
        ${this.renderDetail(view)}
      </div>
      <div class="cblocks">${this.renderHeatmap(view.detail.heatmap)}</div>`;
  }

  // The heatmap: its title and line, the colour bar, and the chart, or what stands in for it while the range loads
  private renderHeatmap(block: HeatmapBlock | null) {
    if (!block) return nothing;
    return html`<div class="inner">
      <h3>${block.title}</h3>
      <p>${block.hint}</p>
      <hp-heat-legend></hp-heat-legend>
      ${chartPlace(block, this.drawn?.heatmap, 300, `${block.title}. ${block.hint}`)}
    </div>`;
  }

  // The detail is one element on both shapes: the head, the controls, the tiles and the chart.
  private renderDetail(view: ClimateViewModel): TemplateResult {
    return html`<hp-climate-detail
      .view=${view.detail}
      .selection=${view.selection}
      .chart=${this.drawn?.chart ?? null}
      @select=${this.onSelect}
    ></hp-climate-detail>`;
  }

  // The phone's detail in a sheet: it exists only while open, so a closed sheet holds no chart.
  private renderSheet(view: ClimateViewModel) {
    const {t} = this.storeController.store;
    return html`<hp-sheet
      .open=${this.detailOpen}
      .icon=${'therm'}
      .color=${'var(--c-home)'}
      .heading=${t('climate.homeClimate')}
      .closeLabel=${t('climate.close')}
      @sheet-close=${this.dismissDetail}
    >
      ${
        this.detailOpen
          ? html`<span slot="icon" style="display:contents">${detailIcon}</span>
              <div slot="sub">${view.summary}</div>
              <hp-range-tabs
                slot="tabs"
                .ranges=${rangeTabs(t)}
                .value=${this.range}
                @range-change=${this.onRange}
              ></hp-range-tabs>
              ${this.renderDetail(view)}`
          : nothing
      }
    </hp-sheet>`;
  }

  // arrow fields, so the template hands the same functions at every render

  // the sheet's Close button, its backdrop and its swipe: the host closes it, the pane only says so
  private readonly dismissDetail = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(DETAIL_SHEET));
  };

  // the list's tap, or a tile of the detail that leads to a room: the detail shows that item
  private readonly onSelect = (e: CustomEvent<SelectDetail>): void => {
    e.stopPropagation();
    this.selection = e.detail.sel;
    this.requestUpdate();
  };

  // the tablet header's tabs and the sheet header's both tell here; the model and the history get the choice back
  private readonly onRange = (e: CustomEvent<RangeChangeDetail>): void => {
    e.stopPropagation();
    this.range = e.detail.range;
    this.requestUpdate();
  };

  // a tile's tap: the sheet opens on that room, which the pane remembers as the one shown
  private readonly onTile = (e: CustomEvent<TileOpenDetail>): void => {
    e.stopPropagation();
    this.selection = e.detail.key;
    this.dispatchEvent(new SheetRequestEvent(DETAIL_SHEET, {sel: e.detail.key}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-climate-pane': ClimatePane;
  }
}

if (!customElements.get('hp-climate-pane')) customElements.define('hp-climate-pane', ClimatePane);
