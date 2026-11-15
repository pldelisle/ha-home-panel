// <hp-energy-pane>: the Energy tab: on a phone the header with the summary, the card that opens the detail, two tiles that open the water heater's and
// Hilo's cards in sheets; on a tablet the legacy detail inline (the header and the card are not shown there) and the two cards beside it.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `energyModel` runs in `willUpdate` and the template places what it returns;
// a store controller on `energyIds` (ADR 0012), paused while no part of the pane is on screen, and `EnergyHistory`, which loads the history when the pane is shown (ADR 0028).
// Must not: read an entity itself (`readEnergy` does), hold a string the household reads, call the API (the history controller asks the cache), or open a sheet (it asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult} from 'lit';
import './energy-card.ts'; // defines <hp-energy-card>
import './hilo-card.ts'; // defines <hp-hilo-card>
import './water-card.ts'; // defines <hp-water-card>
import paneOwn from './energy-pane.element.css?inline';
import {energyIds} from './ids.ts';
import {readEnergy} from './inputs.ts';
import {EnergyHistory, type EnergyHistoryHost} from './loader.ts';
import {energyModel, type EnergyViewModel} from './model.ts';
import {HILO_SHEET, WATER_SHEET} from './sheets.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {statisticsCacheContext} from '../../ui/contexts.ts';
import {SheetDismissEvent, SheetRequestEvent} from '../../ui/events.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
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

export class EnergyPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    waterOpen: {type: Boolean},
    hiloOpen: {type: Boolean},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and asks for no history. */
  declare active: boolean;
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

  constructor() {
    super();
    this.active = false;
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

  /** The pane is on screen: it is the tab, or a sheet of its own is open over the page (a tile of Home asks for it). */
  private get shown(): boolean {
    return this.active || this.waterOpen || this.hiloOpen;
  }

  // The pause and the resume sit in willUpdate: a resume asks for an update, and one asked for here is this one.
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active') || changed.has('waterOpen') || changed.has('hiloOpen')) {
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
      error: this.history.error,
    });
  }

  protected override render() {
    const view = this.view;
    const compact = this.appearance.value?.compact === true;
    // a sheet over another tab: the pane is behind it and draws nothing but it, so the tab stays
    if (compact && !this.active) return view && (this.waterOpen || this.hiloOpen) ? this.renderSheets(view) : nothing;
    // On a tablet the pane is the legacy detail's place, and the two cards beside it: the header is there and not shown, as the old
    // pane's was, and the card and the tiles are the phone's. The slot is there before the model is: the sheet host puts the legacy
    // panel in it as the tab opens, and the charts it draws need a box to measure. The parts keep their places as the view arrives.
    return html`${view ? this.renderHeader(view) : nothing}${
      compact ? (view ? this.renderPhone(view) : nothing) : this.renderTablet(view)
    }`;
  }

  private renderHeader({summary}: EnergyViewModel) {
    const {t} = this.storeController.store;
    return html`<hp-pane-header .icon=${'bolt'} .color=${'var(--c-grid)'} .heading=${t('energy.title')}>
      <div slot="sub">${summary}</div>
    </hp-pane-header>`;
  }

  // the card, the two tiles and their sheets
  private renderPhone(view: EnergyViewModel) {
    return html`<hp-energy-card .view=${view.card}></hp-energy-card
      >${this.renderTiles(view)}${this.renderSheets(view)}`;
  }

  // The slot is where the sheet host puts the legacy detail's panel (`#ehost`, the registry's markup), until #240 makes the detail an element's.
  // The cards are drawn while the pane is the tab, and only for the sections the house has; with neither the grid is not drawn.
  private renderTablet(view: EnergyViewModel | undefined) {
    const cards = view !== undefined && this.active && (view.water.present || view.hilo.present);
    return html`<slot name="detail"></slot>${
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

  // The two cards' sheets exist only for the sections the house has and hold their card only while open, so a closed sheet holds no chart.
  private renderSheets({water, hilo}: EnergyViewModel) {
    const {t} = this.storeController.store;
    const sheet = (key: 'water' | 'hilo', open: boolean, heading: string, card: TemplateResult) =>
      html`<hp-sheet
        .open=${open}
        .icon=${SECTIONS[key].icon}
        .color=${SECTIONS[key].color}
        .heading=${heading}
        .closeLabel=${t('energy.close')}
        @sheet-close=${key === 'water' ? this.dismissWater : this.dismissHilo}
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

  // a sheet's Close button, its backdrop and its swipe: the host closes it, the pane only says so
  private readonly dismissWater = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(WATER_SHEET));
  };

  private readonly dismissHilo = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(HILO_SHEET));
  };

  // the tile's event stops here: what it asks for is a sheet, which is the shell's to open
  private readonly onTile = (e: CustomEvent<TileOpenDetail>): void => {
    e.stopPropagation();
    const key = e.detail.key;
    if (key === 'water' || key === 'hilo') this.dispatchEvent(new SheetRequestEvent(SECTIONS[key].sheet));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-energy-pane': EnergyPane;
  }
}

if (!customElements.get('hp-energy-pane')) customElements.define('hp-energy-pane', EnergyPane);
