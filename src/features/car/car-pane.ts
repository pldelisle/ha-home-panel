// <hp-car-pane>: the Car pane (the rail's Tab is its button): on a phone the header with the car's name and its summary line, the card that opens the detail and the detail's sheet; on a tablet the detail inline.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `carModel` runs in `willUpdate` and the template places what it returns; a store controller on `carIds` (ADR 0012), paused while no part of the pane
// is on screen, and `CarHistory`, which loads the Car's two windows then (ADR 0028). It keeps the sessions table's length for the panel's life and marks, for the legacy controls it forwards until #253, when the detail is shown.
// Must not: read an entity itself (`readCarFeature` does), hold a string the household reads, call the API (the history controller asks the cache), or open the sheet (the card asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import './car-card.ts'; // defines <hp-car-card>
import './car-detail.ts'; // defines <hp-car-detail>
import paneOwn from './car-pane.element.css?inline';
import {carIds} from './ids.ts';
import {readCarFeature} from './inputs.ts';
import {CarHistory, type CarHistoryHost} from './loader.ts';
import {carModel, type CarViewModel} from './model.ts';
import {DETAIL_SHEET} from './sheets.ts';
import type {CarRef} from '../../providers/fordpass.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {statisticsCacheContext} from '../../ui/contexts.ts';
import {SheetDismissEvent} from '../../ui/events.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/sheet.ts'; // defines <hp-sheet>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarPane extends LitElement {
  static override properties = {active: {type: Boolean, reflect: true}, detailOpen: {type: Boolean}};
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity, asks for no history and keeps what it drew. */
  declare active: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('car.detail')`: the phone's sheet is on screen, over this tab or another. */
  declare detailOpen: boolean;

  // The element's own rules, its `:host` and the header's place, are in car-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  // the car's entities, found at the first reading and kept: the subscription names them, and a house with no car reads only the charger's
  private ref: CarRef | null = null;
  private readonly storeController = new StoreController(this, {ids: store => carIds(store, this.ref)});
  private readonly appearance = new AppearanceConsumer(this);
  private cache: StatisticsCache | undefined;
  private readonly history: CarHistory;
  private view: CarViewModel | undefined;
  // the sessions' table shows every session and not the latest ten: the toggle's state, which the model's rows follow
  private allSessions = false;
  // whether the detail was last on screen, which the container of the legacy controls is told (`announce`)
  private told = false;

  constructor() {
    super();
    this.active = false;
    this.detailOpen = false;
    // the panel's one cache is the shell's (ADR 0028): the legacy panel's shared load asks the Wallbox's year of hours through it, so that window is read once; the
    // consumer is made before the controller, so the cache is there when the controller's first update asks
    new ContextConsumer(this, {
      context: statisticsCacheContext,
      subscribe: false,
      callback: cache => {
        this.cache = cache;
      },
    });
    // The history is wanted while the pane draws from it: it is the tab, or the detail's sheet is open over another tab.
    const drawing = (): boolean => this.shown;
    const settled = (): Promise<boolean> => this.updateComplete;
    const host: CarHistoryHost = {
      addController: controller => this.addController(controller),
      removeController: controller => this.removeController(controller),
      requestUpdate: () => this.requestUpdate(),
      get updateComplete() {
        return settled();
      },
      get active() {
        return drawing();
      },
    };
    this.history = new CarHistory(host, () => {
      const {store} = this.storeController;
      if (!this.cache) throw new Error('CarPane: the cache arrives when the pane connects.');
      return {cache: this.cache, store, fmt: store.fmt};
    });
  }

  // some part of the pane is on screen: the tab, or the sheet the Home card, the tile or the pill opened over another tab
  private get shown(): boolean {
    return this.active || this.detailOpen;
  }

  // The pause and the resume sit in willUpdate: a resume asks for an update, and one asked for here is this one.
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active') || changed.has('detailOpen')) {
      if (this.shown) this.storeController.resume();
      else this.storeController.pause();
    }
    if (!this.shown) return;
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    const inputs = readCarFeature(hass.states, store.config, store.names);
    this.ref = inputs.ref;
    this.view = carModel(inputs, this.history.data, {
      t: store.t,
      fmt: store.fmt,
      allSessions: this.allSessions,
      historyError: this.history.error,
    });
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const compact = this.appearance.value?.compact === true;
    // A tablet draws the detail alone, inline, while the pane is the tab; leaving the tab drops it, charts and all.
    if (!compact) return this.active && view.detail ? this.renderDetail(view) : nothing;
    // The sheet over another tab (Home's tile or the live pill opens it): the pane is behind it and draws nothing but it, so the tab stays.
    if (!this.active) return this.renderSheet(view);
    const {summary, card} = view;
    return html`<hp-pane-header .icon=${'car'} .color=${'var(--c-ev)'} .heading=${summary.title}>
        <div slot="sub">${summary.line}</div>
      </hp-pane-header>
      ${card === null ? nothing : html`<hp-car-card .view=${card} .error=${view.error}></hp-car-card>`}${this.renderSheet(view)}`;
  }

  // the detail, with the legacy controls' container forwarded into its `controls` slot until #253
  private renderDetail({detail, error}: CarViewModel) {
    return html`<hp-car-detail .detail=${detail ?? undefined} .error=${error} @sessions-toggle=${this.onSessionsToggle}>
      <slot name="controls" slot="controls"></slot>
    </hp-car-detail>`;
  }

  // a phone shows it in a sheet the host opens; it exists only while open, so a closed sheet holds no chart
  private renderSheet(view: CarViewModel) {
    const {detail} = view;
    const {t} = this.storeController.store;
    return html`<hp-sheet
      .open=${this.detailOpen}
      .icon=${'car'}
      .color=${'var(--c-ev)'}
      .heading=${detail?.title ?? t('car.title')}
      .closeLabel=${t('car.close')}
      @sheet-close=${this.dismissDetail}
    >
      ${
        this.detailOpen && detail
          ? html`<div slot="sub">${detail.sub}</div>
              ${this.renderDetail(view)}`
          : nothing
      }
    </hp-sheet>`;
  }

  // The legacy controls draw only while the detail is on screen, and the guest cannot see inside this element: the container they sit in is marked and told when that changes (#253 deletes this).
  protected override updated(): void {
    const compact = this.appearance.value?.compact === true;
    const shown = this.view?.detail != null && (compact ? this.detailOpen : this.active);
    if (shown === this.told) return;
    this.told = shown;
    const box = this.querySelector('[slot="controls"]');
    box?.toggleAttribute('data-shown', shown);
    box?.dispatchEvent(new Event('car-detail-shown'));
  }

  // arrow fields, so the template hands the same functions at every render
  private readonly onSessionsToggle = (e: Event): void => {
    e.stopPropagation();
    this.allSessions = !this.allSessions;
    this.requestUpdate();
  };

  // the sheet's Close button, its backdrop and its swipe: the host closes it, the pane only says so
  private readonly dismissDetail = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(DETAIL_SHEET));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-pane': CarPane;
  }
}

if (!customElements.get('hp-car-pane')) customElements.define('hp-car-pane', CarPane);
