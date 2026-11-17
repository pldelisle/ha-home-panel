// <hp-air-pane>: the Air tab: the detail inline, under the header with the summary and the range tabs on a phone (the detail's own header on a tablet, the
// pane's not shown); over another tab on a phone (Home's tile, the live pill) the detail's sheet; and, over either, the history of the reading whose tile was tapped.
// It owns the statistics cache and the range the detail and the history last showed.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `airModel` runs in `willUpdate` and the template places what it
// returns; a store controller on `airIds` (ADR 0012), paused while the pane is off screen, and an optimistic one (ADR 0023) so a tap draws it again.
// Must not: read an entity itself (`readAir` does), hold a string the household reads, or open a sheet (a tile or a card elsewhere asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import './air-detail.ts'; // defines <hp-air-detail>
import {detailIcon} from './air-detail.ts';
import './air-history.ts'; // defines <hp-air-history>
import paneOwn from './air-pane.element.css?inline';
import {DEFAULT_RANGE, rangeTabs, STATISTICS_TTL_MS, type HistoryRequest} from './history.ts';
import {airIds} from './ids.ts';
import {readAir, type AirInputs} from './inputs.ts';
import {airModel, type AirViewModel} from './model.ts';
import {DETAIL_SHEET} from './sheets.ts';
import {registriesOf} from '../../core/registry.ts';
import {createStatisticsCache, type StatisticsCache} from '../../core/statistics-cache.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {apiContext} from '../../ui/contexts.ts';
import {SheetDismissEvent} from '../../ui/events.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/range-tabs.ts'; // defines <hp-range-tabs>
import type {RangeChangeDetail} from '../../ui/range-tabs.ts';
import type {Range} from '../../ui/ranges.ts';
import '../../ui/sheet.ts'; // defines <hp-sheet>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class AirPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    detailOpen: {type: Boolean},
    historyRequest: {attribute: false},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and keeps what it drew. */
  declare active: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('air.detail')`: the phone's sheet is on screen. */
  declare detailOpen: boolean;
  /** Bound by the registry's template to what the sheet host's `air.history` was asked for, or undefined: a sheet over the screen, on any tab. */
  declare historyRequest: HistoryRequest | undefined;

  // The element's own rules, its `:host` and the header's place, are in air-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  private readonly storeController = new StoreController(this, {ids: store => airIds(store)});
  private readonly appearance = new AppearanceConsumer(this);
  private readonly optimistic = new OptimisticController(this);
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);
  private inputs: AirInputs | undefined;
  private view: AirViewModel | undefined;
  private cache: StatisticsCache | undefined;
  private cacheGeneration = -1;
  /** What the detail and the history last showed, kept for the panel's life and handed to each opening, as the legacy sheet kept its own. */
  private range: Range = DEFAULT_RANGE;

  constructor() {
    super();
    this.active = false;
    this.detailOpen = false;
    this.historyRequest = undefined;
    // the cache is the pane's: the detail is drawn and dropped as the pane is shown and left, and a second opening within the ten
    // minutes is the cache's hit; a client never changes for a given tree
    new ContextConsumer(this, {
      context: apiContext,
      subscribe: false,
      callback: api => {
        this.cache = createStatisticsCache(api, {ttlMs: STATISTICS_TTL_MS});
      },
    });
  }

  // The pause and the resume sit in willUpdate: a resume asks for an update, and one asked for here is this one.
  protected override willUpdate(changed: PropertyValues<this>): void {
    // the sheet over another tab (a stack card opens it) shows the pane's tab behind it, but it is the sheet that is on screen
    const shown = this.active || this.detailOpen || this.historyRequest !== undefined;
    if (changed.has('active') || changed.has('detailOpen') || changed.has('historyRequest')) {
      if (shown) this.storeController.resume();
      else this.storeController.pause();
    }
    if (!shown) return;
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    // the cached replies belong to the config they were asked under
    if (store.generation !== this.cacheGeneration) {
      this.cache?.clear();
      this.cacheGeneration = store.generation;
    }
    this.inputs = readAir(hass.states, registriesOf(hass), store.names, store.config);
    this.view = airModel(this.inputs, {
      now: Date.now(),
      t: store.t,
      fmt: store.fmt,
      overlay: this.overlay,
      range: this.range,
    });
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    const compact = this.appearance.value?.compact === true;
    // the sheets over another tab (Home's tile, the stack's card): the pane is behind them and draws nothing but them, so the tab stays
    if (compact && !this.active) return html`${this.renderSheet(view)}${this.renderHistory()}`;
    // The header: on a phone the tab's own, with the range tabs the detail's header has on a tablet; on a tablet it is there and not shown
    // (the detail draws its own), as the old pane's was. The detail is under it, inline, while the pane is the tab; leaving the tab drops it, charts with it.
    return html`<hp-pane-header .icon=${'aq'} .color=${'var(--ok)'} .heading=${t('air.title')}>
        <div slot="sub">${view.summary}</div>
        ${
          compact
            ? html`<hp-range-tabs
                slot="actions"
                .ranges=${rangeTabs(t)}
                .value=${this.range}
                @range-change=${this.onRange}
              ></hp-range-tabs>`
            : nothing
        }
      </hp-pane-header>
      ${this.active ? this.renderDetail(view) : nothing}${this.renderHistory()}`;
  }

  // a reading's history exists only while its sheet is open, so a closed one holds no chart and asks for nothing
  private renderHistory() {
    return this.historyRequest
      ? html`<hp-air-history
          .request=${this.historyRequest}
          .inputs=${this.inputs}
          .cache=${this.cache}
          .range=${this.range}
          @range-chosen=${this.onRange}
        ></hp-air-history>`
      : nothing;
  }

  // the tab shows the detail in the pane while the pane is the tab
  private renderDetail(view: AirViewModel) {
    return html`<hp-air-detail
      .view=${view.detail}
      .inputs=${this.inputs}
      .cache=${this.cache}
      .range=${this.range}
      @range-chosen=${this.onRange}
    ></hp-air-detail>`;
  }

  // over another tab, on a phone, it is in a sheet the host opens; it exists only while open, so a closed sheet holds no chart
  private renderSheet(view: AirViewModel) {
    const {t} = this.storeController.store;
    return html`<hp-sheet
      .open=${this.detailOpen}
      .icon=${'aq'}
      .color=${'var(--ok)'}
      .heading=${view.detail.title}
      .closeLabel=${t('air.close')}
      @sheet-close=${this.dismissDetail}
    >
      ${
        this.detailOpen
          ? html`<span slot="icon" style="display:contents">${detailIcon}</span>
              <div slot="sub">${view.detail.sub}</div>
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

  // the sheet header's tabs, the tablet header's (the detail's `range-chosen`) and the history's both tell here; the model, the detail and the history get the choice back
  private readonly onRange = (e: CustomEvent<RangeChangeDetail>): void => {
    e.stopPropagation();
    this.range = e.detail.range;
    this.requestUpdate();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-air-pane': AirPane;
  }
}

if (!customElements.get('hp-air-pane')) customElements.define('hp-air-pane', AirPane);
