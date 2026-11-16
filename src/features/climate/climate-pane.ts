// <hp-climate-pane>: the Climate tab: on a phone the header with the summary, a grid of tiles and the detail's sheet; on a tablet the header with the range tabs, the list
// beside the selected item's detail, and the heatmap and the outside chart under them. It keeps the selection and the range the person chose.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `climateModel` runs in `willUpdate` and the template places what it returns; a store
// controller on `climateIds` (ADR 0012), paused while no part of the pane is on screen, and `ClimateHistory`, which loads the range shown (ADR 0028). The legacy controls come through a slot until #248.
// Must not: read an entity itself (`readClimate` does), hold a string the household reads, call the API (the history controller asks the cache), send a command, or open the sheet (a tile asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {ClimateCharts, type ClimateOptions} from './charts.ts';
import './climate-detail.ts'; // defines <hp-climate-detail>
import './climate-list.ts'; // defines <hp-climate-list>
import {detailIcon, legendItems, noticeLine} from './climate-detail.ts';
import type {SelectDetail} from './climate-list.ts';
import paneOwn from './climate-pane.element.css?inline';
import {ClimateDetailEvent} from './events.ts';
import './heatmap-legend.ts'; // defines <hp-heat-legend>
import {climateIds} from './ids.ts';
import {readClimate} from './inputs.ts';
import {ClimateHistory} from './loader.ts';
import type {ClimateHistoryData} from './history.ts';
import {
  climateModel,
  type ClimateSelection,
  type ClimateViewModel,
  type HeatmapBlock,
  type OutsideBlock,
} from './model.ts';
import {DETAIL_SHEET} from './sheets.ts';
import {registriesOf} from '../../core/registry.ts';
import type {RoomPower} from '../../providers/power.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {statisticsCacheContext} from '../../ui/contexts.ts';
import {SheetDismissEvent, SheetRequestEvent} from '../../ui/events.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/range-tabs.ts'; // defines <hp-range-tabs>
import type {RangeChangeDetail, RangeTab} from '../../ui/range-tabs.ts';
import {RANGES, type Range} from '../../ui/ranges.ts';
import '../../ui/sheet.ts'; // defines <hp-sheet>
import '../../ui/stat-tile.ts'; // defines <hp-stat-tile>
import type {TileOpenDetail} from '../../ui/stat-tile.ts';
import {chart, common, inner} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import type {Translate} from '../../core/i18n/messages.ts';

/** The range the detail starts on, and keeps for the panel's life once another is chosen. */
const DEFAULT_RANGE: Range = 'day';
/** Nothing holds a climate value until the commands of #248, which hold them in the overlay: the legacy panel's own held values draw in its controls. */
const unheld: Overlay = (_key, current) => current;

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
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and keeps what it drew. */
  declare active: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('climate.detail')`: the phone's sheet is on screen. */
  declare detailOpen: boolean;
  /** Bound by the registry's template to what the open sheet was asked to show: `{sel}` from a tile, nothing from Home's. */
  declare detail: unknown;

  // The element's own rules, its `:host`, the tablet's grid and the phone's tiles, are in climate-pane.element.css.
  static override styles = [common, inner, chart, unsafeCSS(forShadow(paneOwn))];

  private cache: StatisticsCache | undefined;
  private readonly storeController = new StoreController(this, {ids: store => climateIds(store)});
  private readonly appearance = new AppearanceConsumer(this);
  private readonly charts = new ClimateCharts();
  private view: ClimateViewModel | undefined;
  /** The options of the charts the view's range has the history for: null before the load. */
  private drawn: ClimateOptions | null = null;
  /** What the detail shows, kept for the panel's life: the house and a day until the person chooses. */
  private selection: ClimateSelection = 'house';
  private range: Range = DEFAULT_RANGE;
  /** What the shell was last told the detail shows (`room/range`), empty for nothing: it is told again only when this changes. */
  private told = '';
  private readonly history: ClimateHistory;

  /** The phone's layout, as the appearance context says; false until the context is provided. */
  private get compact(): boolean {
    return this.appearance.value?.compact === true;
  }
  /** Where the pane sits while connected, for the event it sends as it leaves. */
  private parent: HTMLElement | null = null;

  constructor() {
    super();
    this.active = false;
    this.detailOpen = false;
    this.detail = undefined;
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

  override connectedCallback(): void {
    super.connectedCallback();
    this.told = ''; // a pane drawn again tells the shell again
    this.parent = this.parentElement;
  }

  // The shell is told the detail left, from the parent the pane had: an event from a detached element reaches no one. The legacy controls stop with it.
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.told !== '') this.parent?.dispatchEvent(new ClimateDetailEvent(null));
    this.told = '';
    this.parent = null;
  }

  /** The pane is on screen: it is the tab, or its sheet is open over the page (Home's tile asks for it). */
  private get shown(): boolean {
    return this.active || this.detailOpen;
  }

  /** The detail is on screen: the tablet's tab, or the phone's sheet. The history is asked for then, not for the phone's tiles, nor on Home. */
  private get detailShown(): boolean {
    return this.compact ? this.detailOpen : this.active;
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
      overlay: unheld,
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
    // a sheet over another tab: the pane is behind it and draws nothing but it, so the tab stays
    if (compact && !this.active) return this.detailOpen ? this.renderSheet(view) : nothing;
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
        ({id, icon, name, sub, value, tone, wide}) =>
          html`<hp-stat-tile
            .key=${id}
            .icon=${icon}
            .label=${name}
            .sub=${sub}
            .value=${value}
            .tone=${wide ? `${tone} wide trail` : tone}
          ></hp-stat-tile>`,
      )}
    </div>`;
  }

  // The tablet: the header with the range tabs, the list and the detail, and the heatmap and the outside chart under them.
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
      <div class="cblocks">
        ${this.renderHeatmap(view.detail.heatmap)}${this.renderOutside(view.detail.outsideChart)}
      </div>`;
  }

  // The heatmap: its title and line, the colour bar, and the chart, or what stands in for it while the range loads
  private renderHeatmap(block: HeatmapBlock | null) {
    if (!block) return nothing;
    const options = this.drawn?.heatmap;
    return html`<div class="inner">
      <h3>${block.title}</h3>
      <p>${block.hint}</p>
      <hp-heat-legend></hp-heat-legend>
      ${
        block.notice
          ? noticeLine(block.notice)
          : options
            ? html`<hp-chart .height=${300} .label=${`${block.title}. ${block.hint}`} .options=${options}></hp-chart>`
            : nothing
      }
    </div>`;
  }

  // the outside chart: a band from each bucket's low to its high, and the mean's line over it
  private renderOutside(block: OutsideBlock | null) {
    if (!block) return nothing;
    const options = this.drawn?.outside;
    return html`<div class="inner">
      <h3>${block.title}</h3>
      <p>${block.note}</p>
      <div class="legend">${legendItems(block.legend)}</div>
      ${
        block.notice
          ? noticeLine(block.notice)
          : options
            ? html`<hp-chart .height=${260} .label=${`${block.title}. ${block.note}`} .options=${options}></hp-chart>`
            : nothing
      }
    </div>`;
  }

  // The detail is one element on both shapes: the controls are the legacy panel's, which fills the slot the pane forwards (#248).
  private renderDetail(view: ClimateViewModel): TemplateResult {
    return html`<hp-climate-detail
      .view=${view.detail}
      .selection=${view.selection}
      .chart=${this.drawn?.chart ?? null}
    >
      <slot name="controls" slot="controls"></slot>
    </hp-climate-detail>`;
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

  // The shell is told what the detail shows when it comes on screen, when the room or the range changes and when it leaves; the legacy controls follow it.
  protected override updated(): void {
    const {view} = this;
    if (!view) return;
    const on = this.detailShown;
    const key = on ? `${view.selection}/${this.range}` : '';
    if (key === this.told) return;
    this.told = key;
    this.dispatchEvent(new ClimateDetailEvent(on ? {sel: view.selection, range: this.range} : null));
  }

  // arrow fields, so the template hands the same functions at every render

  // the sheet's Close button, its backdrop and its swipe: the host closes it, the pane only says so
  private readonly dismissDetail = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(DETAIL_SHEET));
  };

  // the list's tap: the detail shows that item
  private readonly onSelect = (e: CustomEvent<SelectDetail>): void => {
    e.stopPropagation();
    this.selection = e.detail.sel;
    this.requestUpdate();
  };

  // the tablet header's tabs and the sheet header's both tell here; the model, the history and the legacy controls get the choice back
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
