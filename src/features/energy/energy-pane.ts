// <hp-energy-pane>: the Energy tab: on a phone the header with the summary, the range and the detail inline, then two tiles that open the water heater's and
// Hilo's cards in sheets (the detail's own sheet is Home's tile's); on a tablet the detail inline (the header and the tiles are not shown there) and the two cards after it. It keeps the one range, which every card of the detail follows.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `energyModel` runs in `willUpdate` and the template places what it returns;
// a store controller on `energyIds` (ADR 0012), paused while no part of the pane is on screen, and `EnergyHistory`, which loads the history when the pane is shown (ADR 0028).
// Must not: read an entity itself (`readEnergy` does), hold a string the household reads, call the API (the history controller asks the cache), or open a sheet (it asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult} from 'lit';
import './energy-detail.ts'; // defines <hp-energy-detail>
import {isEnergyRange, type EnergyRange} from './charts.ts';
import {detailIcon} from './energy-detail.ts';
import './hilo-card.ts'; // defines <hp-hilo-card>
import './water-card.ts'; // defines <hp-water-card>
import paneOwn from './energy-pane.element.css?inline';
import {energyIds} from './ids.ts';
import {readEnergy} from './inputs.ts';
import {EnergyHistory, type EnergyHistoryHost} from './loader.ts';
import {energyModel, type EnergyViewModel} from './model.ts';
import {DETAIL_SHEET, HILO_SHEET, WATER_SHEET} from './sheets.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {statisticsCacheContext} from '../../ui/contexts.ts';
import {SheetDismissEvent, SheetRequestEvent} from '../../ui/events.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/range-tabs.ts'; // defines <hp-range-tabs>
import type {RangeChangeDetail} from '../../ui/range-tabs.ts';
import '../../ui/sheet.ts'; // defines <hp-sheet>
import '../../ui/stat-tile.ts'; // defines <hp-stat-tile>
import type {TileOpenDetail} from '../../ui/stat-tile.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import type {IconName} from '../../ui/icons.ts';

/** The phone's two tiles: the sheet each opens, the icon and the badge's colour (the legacy card sheet's). */
const SECTIONS = {
  water: {sheet: WATER_SHEET, icon: 'drop', color: 'var(--c-wh)', tone: 'wide'},
  hilo: {sheet: HILO_SHEET, icon: 'bolt', color: 'var(--c-grid)', tone: 'wide grid'},
} as const satisfies Record<string, {sheet: string; icon: IconName; color: string; tone: string}>;
type SectionKey = keyof typeof SECTIONS;
/** A tile's or a sheet's key names one of the two sections (a stale tile of Home may name another). */
const isSection = (key: string | undefined): key is SectionKey => key !== undefined && Object.hasOwn(SECTIONS, key);

export class EnergyPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    detailOpen: {type: Boolean},
    waterOpen: {type: Boolean},
    hiloOpen: {type: Boolean},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and asks for no history. */
  declare active: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('energy.detail')`: the phone's detail sheet is on screen. */
  declare detailOpen: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('energy.water')`: the phone's water heater sheet is on screen. */
  declare waterOpen: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('energy.hilo')`: the phone's Hilo sheet is on screen. */
  declare hiloOpen: boolean;

  // The element's own rules, its `:host`, the header's place, the cards' grid and the tiles' column, are in energy-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  private readonly storeController = new StoreController(this, {ids: store => energyIds(store)});
  private readonly appearance = new AppearanceConsumer(this);
  private cache: StatisticsCache | undefined;
  private readonly history: EnergyHistory;
  private view: EnergyViewModel | undefined;
  /** What the detail last showed, kept for the panel's life and handed to each opening, as the legacy sheet kept its own. */
  private range: EnergyRange = 'now';

  constructor() {
    super();
    this.active = false;
    this.detailOpen = false;
    this.waterOpen = false;
    this.hiloOpen = false;
    // the panel's one cache is the shell's (ADR 0028): the card and the legacy history ask it, so each window is read once; the
    // consumer is made before the controller, so the cache is there when the controller's first update asks
    new ContextConsumer(this, {
      context: statisticsCacheContext,
      subscribe: false,
      callback: cache => {
        this.cache = cache;
      },
    });
    // The history is wanted while any part of the pane is on screen: the tab, or a sheet over another tab (Home's Water heater tile
    // opens its card), so the controller's host says `active` for that, and the rest is the pane's own.
    const shown = (): boolean => this.shown;
    const settled = (): Promise<boolean> => this.updateComplete;
    const host: EnergyHistoryHost = {
      addController: controller => this.addController(controller),
      removeController: controller => this.removeController(controller),
      requestUpdate: () => this.requestUpdate(),
      get updateComplete() {
        return settled();
      },
      get active() {
        return shown();
      },
    };
    this.history = new EnergyHistory(host, () => {
      const {store} = this.storeController;
      if (!this.cache) throw new Error('EnergyPane: the cache arrives when the pane connects.');
      return {cache: this.cache, store, fmt: store.fmt};
    });
  }

  /** One of the pane's sheets is on screen over the page. */
  private get sheetOpen(): boolean {
    return this.detailOpen || this.waterOpen || this.hiloOpen;
  }

  /** The pane is on screen: it is the tab, or a sheet of its own is open over the page (a stack card or a tile of Home asks for it). */
  private get shown(): boolean {
    return this.active || this.sheetOpen;
  }

  // The pause and the resume sit in willUpdate: a resume asks for an update, and one asked for here is this one.
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active') || changed.has('detailOpen') || changed.has('waterOpen') || changed.has('hiloOpen')) {
      if (this.shown) this.storeController.resume();
      else this.storeController.pause();
    }
    if (!this.shown) return;
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    this.view = energyModel(readEnergy(hass.states, store.config, store.names), this.history.data, {
      now: Date.now(),
      t: store.t,
      fmt: store.fmt,
      names: store.names,
      language: store.language,
      error: this.history.error,
      range: this.range,
    });
  }

  protected override render() {
    const view = this.view;
    const compact = this.appearance.value?.compact === true;
    // a sheet over another tab (Home's tile asks for the detail's, a tile of Home or the stack for a card's): the pane is behind it and
    // draws nothing but it, so the tab stays
    if (compact && !this.active) {
      return view && this.sheetOpen ? html`${this.renderDetailSheet(view)}${this.renderSheets(view)}` : nothing;
    }
    // On a phone the tab is the header, the range and the detail inline, then the two tiles that open the cards in sheets; the detail's own
    // sheet is Home's. On a tablet the pane is the detail's place, and the two cards after it: the header and the tiles are the phone's, and
    // the header is not drawn, so its sub-line costs nothing.
    return compact ? (view ? this.renderPhone(view) : nothing) : this.renderTablet(view);
  }

  // the phone's tab: the header with the summary, the range, the detail, the two tiles and their sheets
  private renderPhone(view: EnergyViewModel) {
    const {t} = this.storeController.store;
    return html`<hp-pane-header .icon=${'bolt'} .color=${'var(--c-grid)'} .heading=${t('energy.title')}>
        <div slot="sub">${view.summary}</div>
      </hp-pane-header>
      <hp-range-tabs .ranges=${view.detail.ranges} .value=${this.range} @range-change=${this.onRange}></hp-range-tabs>
      ${this.renderDetail(view)}${this.renderTiles(view)}${this.renderSheets(view)}`;
  }

  // The detail is drawn while the pane is the tab, so leaving the tab drops its charts. The cards are drawn while the pane is the tab, and only
  // for the sections the house has; with neither the grid is not drawn.
  private renderTablet(view: EnergyViewModel | undefined) {
    const cards = view !== undefined && this.active && (view.water.present || view.hilo.present);
    return html`${view !== undefined && this.active ? this.renderDetail(view) : nothing}${
      cards
        ? html`<div class="eside">
            ${view.water.present ? html`<hp-water-card .view=${view.water}></hp-water-card>` : nothing}
            ${view.hilo.present ? html`<hp-hilo-card .view=${view.hilo}></hp-hilo-card>` : nothing}
          </div>`
        : nothing
    }`;
  }

  // the phone's two tiles, for the sections the house has: each opens its card in a sheet
  private renderTiles({tiles}: EnergyViewModel) {
    return html`<div class="etiles" @tile-open=${this.onTile}>
      ${tiles.map(({key, label, sub, value, unit, on}) => {
        const section = SECTIONS[key];
        return html`<hp-stat-tile
          .key=${key}
          .icon=${section.icon}
          .label=${label}
          .sub=${sub}
          .value=${value}
          .unit=${unit}
          .tone=${on ? `${section.tone} on` : section.tone}
        ></hp-stat-tile>`;
      })}
    </div>`;
  }

  // the detail: the history's charts, the Sankey and the totals, from the model, and the range the pane keeps
  private renderDetail({detail}: EnergyViewModel) {
    return html`<hp-energy-detail
      .view=${detail}
      .history=${this.history.data}
      .range=${this.range}
      @range-chosen=${this.onRange}
    ></hp-energy-detail>`;
  }

  // The phone's detail in a sheet: it exists only while open, so a closed sheet holds no chart.
  private renderDetailSheet(view: EnergyViewModel) {
    const {t} = this.storeController.store;
    const {detail} = view;
    return html`<hp-sheet
      .open=${this.detailOpen}
      .icon=${'bolt'}
      .color=${'var(--c-grid)'}
      .heading=${detail.title}
      .closeLabel=${t('energy.close')}
      @sheet-close=${this.dismissDetail}
    >
      ${
        this.detailOpen
          ? html`<span slot="icon" style="display:contents">${detailIcon}</span>
              <div slot="sub">${detail.sub}</div>
              <hp-range-tabs
                slot="tabs"
                .ranges=${detail.ranges}
                .value=${this.range}
                @range-change=${this.onRange}
              ></hp-range-tabs>
              ${this.renderDetail(view)}`
          : nothing
      }
    </hp-sheet>`;
  }

  // The cards' sheets exist only for the sections the house has and hold their card only while open, so a closed sheet holds no chart.
  private renderSheets(view: EnergyViewModel) {
    const {water, hilo} = view;
    const {t} = this.storeController.store;
    const sheet = (key: SectionKey, open: boolean, heading: string, card: TemplateResult) =>
      html`<hp-sheet
        data-key=${key}
        .open=${open}
        .icon=${SECTIONS[key].icon}
        .color=${SECTIONS[key].color}
        .heading=${heading}
        .closeLabel=${t('energy.close')}
        @sheet-close=${this.dismiss}
      >
        ${open ? card : nothing}
      </hp-sheet>`;
    return html`${
      water.present
        ? sheet(
            'water',
            this.waterOpen,
            water.title,
            html`<hp-water-card .view=${water} .framed=${true}></hp-water-card>`,
          )
        : nothing
    }${
      hilo.present
        ? sheet('hilo', this.hiloOpen, hilo.title, html`<hp-hilo-card .view=${hilo} .framed=${true}></hp-hilo-card>`)
        : nothing
    }`;
  }

  // a sheet asked for a section this house does not have (a stale tile of Home) has nothing to show: the host is asked to close it
  protected override updated(): void {
    const view = this.view;
    if (!view || !this.storeController.store.hass) return;
    if (this.waterOpen && !view.water.present) this.dispatchEvent(new SheetDismissEvent(WATER_SHEET));
    if (this.hiloOpen && !view.hilo.present) this.dispatchEvent(new SheetDismissEvent(HILO_SHEET));
  }

  // arrow fields, so the template hands the same functions at every render

  // the detail sheet's Close button, its backdrop and its swipe: the host closes it, the pane only says so
  private readonly dismissDetail = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(DETAIL_SHEET));
  };

  // the sheet header's tabs and the tablet header's (the detail's `range-chosen`) both tell here; the detail gets the choice back
  private readonly onRange = (e: CustomEvent<RangeChangeDetail<string>>): void => {
    e.stopPropagation();
    if (!isEnergyRange(e.detail.range)) return;
    this.range = e.detail.range;
    this.requestUpdate();
  };

  // a sheet's Close button, its backdrop and its swipe: the host closes it, the pane only says so; the sheet's `data-key` names its section
  private readonly dismiss = (e: Event): void => {
    e.stopPropagation();
    const key = (e.currentTarget as HTMLElement).dataset.key;
    if (isSection(key)) this.dispatchEvent(new SheetDismissEvent(SECTIONS[key].sheet));
  };

  // the tile's event stops here: what it asks for is a sheet, which is the shell's to open
  private readonly onTile = (e: CustomEvent<TileOpenDetail>): void => {
    e.stopPropagation();
    const {key} = e.detail;
    if (isSection(key)) this.dispatchEvent(new SheetRequestEvent(SECTIONS[key].sheet));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-energy-pane': EnergyPane;
  }
}

if (!customElements.get('hp-energy-pane')) customElements.define('hp-energy-pane', EnergyPane);
