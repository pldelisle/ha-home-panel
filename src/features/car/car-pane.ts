// <hp-car-pane>: the Car pane (the rail's Tab is its button): on a phone the header with the car's name and its summary line, and the card that opens the detail; on a tablet nothing of its own, the detail being the legacy panel's inline until #252.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `carModel` runs in `willUpdate` and the template places what it returns; a store controller on `carIds` (ADR 0012), paused while the pane is not
// the tab, and `CarHistory`, which loads the Car's two windows when the pane is shown (ADR 0028).
// Must not: read an entity itself (`readCarFeature` does), hold a string the household reads, call the API (the history controller asks the cache), or open the sheet (the card asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import './car-card.ts'; // defines <hp-car-card>
import paneOwn from './car-pane.element.css?inline';
import {carIds} from './ids.ts';
import {readCarFeature} from './inputs.ts';
import {CarHistory, type CarHistoryHost} from './loader.ts';
import {carModel, type CarViewModel} from './model.ts';
import type {CarRef} from '../../providers/fordpass.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {statisticsCacheContext} from '../../ui/contexts.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarPane extends LitElement {
  static override properties = {active: {type: Boolean, reflect: true}};
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity, asks for no history and keeps what it drew. */
  declare active: boolean;

  // The element's own rules, its `:host` and the header's place, are in car-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  // the car's entities, found at the first reading and kept: the subscription names them, and a house with no car reads only the charger's
  private ref: CarRef | null = null;
  private readonly storeController = new StoreController(this, {ids: store => carIds(store, this.ref)});
  private readonly appearance = new AppearanceConsumer(this);
  private cache: StatisticsCache | undefined;
  private readonly history: CarHistory;
  private view: CarViewModel | undefined;

  constructor() {
    super();
    this.active = false;
    // the panel's one cache is the shell's (ADR 0028): the legacy panel's shared load asks the Wallbox's year of hours through it, so that window is read once; the
    // consumer is made before the controller, so the cache is there when the controller's first update asks
    new ContextConsumer(this, {
      context: statisticsCacheContext,
      subscribe: false,
      callback: cache => {
        this.cache = cache;
      },
    });
    // The history is wanted while the pane draws from it: it is the tab and the screen is a phone's (a tablet's pane draws nothing until #252), so a tablet asks for no window.
    const drawing = (): boolean => this.active && this.appearance.value?.compact === true;
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

  // The pause and the resume sit in willUpdate: a resume asks for an update, and one asked for here is this one.
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active')) {
      if (this.active) this.storeController.resume();
      else this.storeController.pause();
    }
    if (!this.active) return;
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    const inputs = readCarFeature(hass.states, store.config, store.names);
    this.ref = inputs.ref;
    this.view = carModel(inputs, this.history.data, {
      t: store.t,
      fmt: store.fmt,
      // the detail's toggle is element state: #252
      allSessions: false,
      historyError: this.history.error,
    });
  }

  protected override render() {
    const view = this.view;
    // A tablet has no header and no card here: the tab is the detail, which the legacy panel draws inline in the pane until #252.
    if (!view || this.appearance.value?.compact !== true) return nothing;
    const {summary, card} = view;
    return html`<hp-pane-header .icon=${'car'} .color=${'var(--c-ev)'} .heading=${summary.title}>
        <div slot="sub">${summary.line}</div>
      </hp-pane-header>
      ${card === null ? nothing : html`<hp-car-card .view=${card} .error=${view.error}></hp-car-card>`}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-pane': CarPane;
  }
}

if (!customElements.get('hp-car-pane')) customElements.define('hp-car-pane', CarPane);
