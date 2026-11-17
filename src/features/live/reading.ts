// LiveReading: what the pill and the Status popup both read: the store's states at the ids the checks and activities name, the history, the held values and a
// twenty-second tick, folded through `liveModel` at the instant of each update.
// Pattern: a Lit reactive controller composed of the kit's controllers (Lit docs, Reactive Controllers: composition), so the two elements share one recipe;
// the subscription is the store's per-element one (ADR 0012), the history the panel-wide cache's (ADR 0028), the held values the overlay's (ADR 0023).
// Must not: keep the pill's state (the element passes it in and keeps what comes back), draw, or word anything the model does not.
import {ContextConsumer} from '@lit/context';
import type {ReactiveControllerHost} from 'lit';
import {registriesOf} from '../../core/registry.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import {statisticsCacheContext} from '../../ui/contexts.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import type {LiveState} from './done.ts';
import {liveIds} from './ids.ts';
import {readLive} from './inputs.ts';
import {LiveHistory} from './loader.ts';
import {liveModel, type LiveViewModel} from './model.ts';

/** The header's times (a time left, a check's ten minutes) move with the clock, as the legacy header's twenty-second redraw moved them. */
const TICK_MS = 20_000;

export interface LiveReadingOptions {
  /** Read at each update and tick: false while the element shows nothing that changes (a closed popup), so it asks no history and skips the tick. */
  active: () => boolean;
}

export class LiveReading {
  private readonly storeController: StoreController;
  private readonly optimistic: OptimisticController;
  private readonly history: LiveHistory;
  private cache: StatisticsCache | undefined;
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);

  constructor(host: ReactiveControllerHost & HTMLElement, options: LiveReadingOptions) {
    this.storeController = new StoreController(host, {ids: store => liveIds(store)});
    this.optimistic = new OptimisticController(host);
    new TickController(host, TICK_MS, options.active);
    // the consumer is made before the history, so the cache is there when the history's first update asks
    new ContextConsumer(host, {
      context: statisticsCacheContext,
      subscribe: false,
      callback: cache => {
        this.cache = cache;
      },
    });
    const settled = (): Promise<boolean> => host.updateComplete;
    this.history = new LiveHistory(
      {
        addController: controller => host.addController(controller),
        removeController: controller => host.removeController(controller),
        requestUpdate: () => host.requestUpdate(),
        get updateComplete() {
          return settled();
        },
        get active() {
          return options.active();
        },
      },
      () => {
        const {store} = this.storeController;
        if (!this.cache) throw new Error('LiveReading: the cache arrives when the element connects.');
        return {cache: this.cache, store, fmt: store.fmt};
      },
    );
  }

  /** The pill and the popup now, from `state` (what the pill kept); null before the first states. `compact`: a phone's texts. */
  model(state: LiveState, compact: boolean): LiveViewModel | null {
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return null;
    const inputs = readLive(hass.states, registriesOf(hass), store.config, store.names, Date.now());
    return liveModel(inputs, this.history.data, state, {
      t: store.t,
      fmt: store.fmt,
      names: store.names,
      language: store.language,
      compact,
      overlay: this.overlay,
    });
  }
}
