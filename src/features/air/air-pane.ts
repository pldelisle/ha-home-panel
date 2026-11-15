// <hp-air-pane>: the Air tab: on a phone the header with the summary, the card and the detail's sheet; on a tablet the detail inline (the header is
// there and not shown, and the card is not drawn). It owns the statistics cache and the range and metric the detail last showed.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `airModel` runs in `willUpdate` and the template places what it
// returns; a store controller on `airIds` (ADR 0012), paused while the pane is off screen, and an optimistic one (ADR 0023) so a tap draws it again.
// Must not: read an entity itself (`readAir` does), hold a string the household reads, or open the sheet (the card asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import './air-card.ts'; // defines <hp-air-card>
import './air-detail.ts'; // defines <hp-air-detail>
import {detailIcon, type MetricChosenDetail} from './air-detail.ts';
import paneOwn from './air-pane.element.css?inline';
import {DEFAULT_METRIC, DEFAULT_RANGE, rangeTabs, STATISTICS_TTL_MS, type ChartMetric} from './history.ts';
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
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and keeps what it drew. */
  declare active: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('air.detail')`: the phone's sheet is on screen. */
  declare detailOpen: boolean;

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
  /** What the detail last showed, kept for the panel's life and handed to each opening, as the legacy sheet kept its own. */
  private range: Range = DEFAULT_RANGE;
  private metric: ChartMetric = DEFAULT_METRIC;

  constructor() {
    super();
    this.active = false;
    this.detailOpen = false;
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
    const shown = this.active || this.detailOpen;
    if (changed.has('active') || changed.has('detailOpen')) {
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
      metric: this.metric,
      range: this.range,
    });
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    const compact = this.appearance.value?.compact === true;
    // the sheet over another tab: the pane is behind it and draws nothing but it, so the tab stays
    if (!this.active && this.detailOpen && compact) return this.renderSheet(view);
    // On a tablet the pane is the detail's place alone: the header is there and not shown, as the old pane's was, and the card and the sheet are the phone's.
    return html`<hp-pane-header .icon=${'aq'} .color=${'var(--ok)'} .heading=${t('air.title')}>
        <div slot="sub">${view.summary}</div>
      </hp-pane-header>
      ${
        compact
          ? html`<hp-air-card .view=${view.card} .openLabel=${t('air.open')}></hp-air-card>${this.renderSheet(view)}`
          : this.active
            ? this.renderDetail(view)
            : nothing
      }`;
  }

  // a tablet shows the detail in the pane while the pane is the tab; leaving the tab drops it, charts with it
  private renderDetail(view: AirViewModel) {
    return html`<hp-air-detail
      .view=${view.detail}
      .inputs=${this.inputs}
      .cache=${this.cache}
      .range=${this.range}
      .metric=${this.metric}
      @range-chosen=${this.onRange}
      @metric-chosen=${this.onMetric}
    ></hp-air-detail>`;
  }

  // a phone shows it in a sheet the host opens; it exists only while open, so a closed sheet holds no chart
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

  // the sheet header's tabs and the tablet header's (the detail's `range-chosen`) both tell here; the model and the detail get the choice back
  private readonly onRange = (e: CustomEvent<RangeChangeDetail>): void => {
    e.stopPropagation();
    this.range = e.detail.range;
    this.requestUpdate();
  };

  private readonly onMetric = (e: CustomEvent<MetricChosenDetail>): void => {
    e.stopPropagation();
    this.metric = e.detail.metric;
    this.requestUpdate();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-air-pane': AirPane;
  }
}

if (!customElements.get('hp-air-pane')) customElements.define('hp-air-pane', AirPane);
