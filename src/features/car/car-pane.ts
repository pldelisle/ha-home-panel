// <hp-car-pane>: the Car pane (the rail's Tab is its button): the detail inline, on a phone under the header with the car's name and its summary line; on a phone the detail's sheet too, which the Home
// tile and the live pill open over another tab; and the charging history's sheet, which the history row asks for.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `carModel` runs in `willUpdate` and the template places what it returns; a store controller on `carIds` (ADR 0012), paused while no part of the pane
// is on screen, and `CarHistory`, which loads the Car's two windows then (ADR 0028). It keeps the sessions table's length for the panel's life and hands the inputs down to the detail's controls.
// Must not: read an entity itself (`readCarFeature` does), hold a string the household reads, call the API (the history controller asks the cache), or open a sheet (the tile, the pill or the row asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import './car-detail.ts'; // defines <hp-car-detail>
import './car-history-sheet.ts'; // defines <hp-car-history-sheet>
import paneOwn from './car-pane.element.css?inline';
import {carIds} from './ids.ts';
import {readCarFeature, type CarFeatureInputs} from './inputs.ts';
import {CarHistory, type CarHistoryHost} from './loader.ts';
import {carModel, type CarViewModel} from './model.ts';
import {DETAIL_SHEET, HISTORY_SHEET} from './sheets.ts';
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
  static override properties = {
    active: {type: Boolean, reflect: true},
    detailOpen: {type: Boolean},
    historyOpen: {type: Boolean},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity, asks for no history and keeps what it drew. */
  declare active: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('car.detail')`: the phone's sheet is on screen, over this tab or another. */
  declare detailOpen: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('car.history')`: the charging history's sheet is on screen. */
  declare historyOpen: boolean;

  // The element's own rules, its `:host` and the header's place, are in car-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  // the car's entities, found at the first reading and kept: the subscription names them, and a house with no car reads only the charger's
  private ref: CarRef | null = null;
  private readonly storeController = new StoreController(this, {ids: store => carIds(store, this.ref)});
  private readonly appearance = new AppearanceConsumer(this);
  private cache: StatisticsCache | undefined;
  private readonly history: CarHistory;
  private view: CarViewModel | undefined;
  // what the controls are drawn from: the same reading the view was made of
  private inputs: CarFeatureInputs | undefined;
  // the sessions' table shows every session and not the latest ten: the toggle's state, which the model's rows follow
  private allSessions = false;
  // Ford's photo did not load: the drawn car stands in for it until the pane goes, on the card and in the battery block alike (the legacy panel's `imgFail`, per session), so a broken photo is asked for once
  private imageFailed = false;

  constructor() {
    super();
    this.active = false;
    this.detailOpen = false;
    this.historyOpen = false;
    // the panel's one cache is the shell's (ADR 0028): a window another element asked for is read once; the
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

  // some part of the pane is on screen: the tab, the detail's sheet the tile or the pill opened over another tab, or the history's
  private get shown(): boolean {
    return this.active || this.detailOpen || this.historyOpen;
  }

  // The pause and the resume sit in willUpdate: a resume asks for an update, and one asked for here is this one.
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active') || changed.has('detailOpen') || changed.has('historyOpen')) {
      if (this.shown) this.storeController.resume();
      else this.storeController.pause();
    }
    if (!this.shown) return;
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    const inputs = readCarFeature(hass.states, store.config, store.names);
    this.inputs = inputs;
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
    if (!compact)
      return html`${this.active && view.detail ? this.renderDetail(view) : nothing}${this.renderHistory(view)}`;
    // The sheet over another tab (Home's tile or the live pill opens it): the pane is behind it and draws nothing but its sheets, so the tab stays.
    if (!this.active) return html`${this.renderSheet(view)}${this.renderHistory(view)}`;
    // The tab itself shows the content, as a tablet's does (HIG, Sheets: "Avoid using a sheet to help people navigate your app's content"); the sheet is only for the Home tile and the pill.
    const {summary} = view;
    return html`<hp-pane-header .icon=${'car'} .color=${'var(--c-ev)'} .heading=${summary.title}>
        <div slot="sub">${summary.line}</div>
      </hp-pane-header>
      ${view.detail ? this.renderDetail(view) : html`<p class="none">${view.none}</p>`}${this.renderHistory(view)}`;
  }

  private renderDetail({detail, error}: CarViewModel) {
    return html`<hp-car-detail
      .detail=${detail ?? undefined}
      .inputs=${this.inputs}
      .error=${error}
      .imageFailed=${this.imageFailed}
      @sessions-toggle=${this.onSessionsToggle}
      @car-image-failed=${this.onImageFailed}
    ></hp-car-detail>`;
  }

  // a phone shows it in a sheet the host opens; it exists only while open, so a closed sheet holds no chart
  private renderSheet(view: CarViewModel) {
    const {detail} = view;
    const {t} = this.storeController.store;
    return html`<hp-sheet
      class="detail"
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

  // the charging history's sheet, over the screen on both shapes; what it holds exists only while it is open, so a closed sheet holds no chart
  private renderHistory({detail, error}: CarViewModel) {
    if (!detail) return nothing;
    const {history} = detail;
    return html`<hp-sheet
      class="history"
      .open=${this.historyOpen}
      .icon=${'cal'}
      .color=${'var(--c-ev)'}
      .heading=${history.title}
      .closeLabel=${history.done}
      @sheet-close=${this.dismissHistory}
    >
      ${
        this.historyOpen
          ? html`<hp-car-history-sheet
              .view=${history}
              .sessions=${detail.sessions}
              .last=${detail.last}
              .error=${error}
              @sessions-toggle=${this.onSessionsToggle}
            ></hp-car-history-sheet>`
          : nothing
      }
    </hp-sheet>`;
  }

  // arrow fields, so the template hands the same functions at every render
  private readonly onSessionsToggle = (e: Event): void => {
    e.stopPropagation();
    this.allSessions = !this.allSessions;
    this.requestUpdate();
  };

  // a photo failed, wherever it drew: the pane keeps it and tells the others
  private readonly onImageFailed = (e: Event): void => {
    e.stopPropagation();
    this.imageFailed = true;
    this.requestUpdate();
  };

  // the sheet's Close button, its backdrop and its swipe: the host closes it, the pane only says so
  private readonly dismissDetail = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(DETAIL_SHEET));
  };

  private readonly dismissHistory = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(HISTORY_SHEET));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-pane': CarPane;
  }
}

if (!customElements.get('hp-car-pane')) customElements.define('hp-car-pane', CarPane);
