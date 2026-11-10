// ForecastController: holds the weather entity's daily and hourly forecast for its host, subscribed through the API client.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers) owning a subscription: it subscribes when the host connects and
// the house is known, unsubscribes when the host leaves, and subscribes again when the entity or the config generation changed.
// Weather talks to the API client for live data nowhere else. It watches the store for the entity only, so a hidden pane keeps it.
// Must not: format or fold a forecast (the model does), read the clock, or keep a subscription against an entity the config dropped.
import {ContextConsumer} from '@lit/context';
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import type {ForecastType, PanelApi} from '../../core/api.ts';
import type {PanelStore} from '../../core/store.ts';
import {apiContext, storeContext} from '../../ui/contexts.ts';
import type {ForecastEntry} from '../../providers/weather-source.ts';

const TYPES = ['daily', 'hourly'] as const satisfies readonly ForecastType[];
type Kept = (typeof TYPES)[number];

export interface ForecastDetail {
  type: Kept;
  forecast: ForecastEntry[];
}

/**
 * A forecast message arrived. The guest's detail panel and Home's card still read the forecast until their moves, so the shell
 * hears this and tells it. Temporary: deleted with the guest's last reader of the forecast (#158 and the Home move).
 */
export class ForecastEvent extends CustomEvent<ForecastDetail> {
  constructor(detail: ForecastDetail) {
    super('weather-forecast', {bubbles: true, composed: true, detail});
  }
}

declare global {
  interface HTMLElementEventMap {
    'weather-forecast': ForecastEvent;
  }
}

export class ForecastController implements ReactiveController {
  daily: ForecastEntry[] = [];
  hourly: ForecastEntry[] = [];

  private store: PanelStore | undefined;
  private api: PanelApi | undefined;
  /** The entity and config generation the live subscriptions were made for; empty when there are none. */
  private key = '';
  private ends: Promise<(() => void) | null>[] = [];
  private unwatch: (() => void) | undefined;
  private watched = '';

  constructor(private readonly host: ReactiveControllerHost & HTMLElement) {
    host.addController(this);
    // a store and a client never change for a given tree: one answer each, at connection
    new ContextConsumer(host, {
      context: storeContext,
      subscribe: false,
      callback: store => {
        this.store = store;
        this.sync();
      },
    });
    new ContextConsumer(host, {
      context: apiContext,
      subscribe: false,
      callback: api => {
        this.api = api;
        this.sync();
      },
    });
  }

  hostConnected(): void {
    this.sync();
  }

  hostUpdate(): void {
    this.sync();
  }

  hostDisconnected(): void {
    this.stop();
    this.unwatch?.();
    this.unwatch = undefined;
    this.watched = '';
  }

  // what the subscriptions should be: the weather entity when the house is connected and has it, in this config generation
  private wanted(): {id: string; key: string} | null {
    const {store} = this;
    const id = store?.hass?.connection ? store.config.entities.weather : null;
    return store && id && store.state(id) ? {id, key: `${id}@${store.generation}`} : null;
  }

  private sync(): void {
    const {store, api} = this;
    if (!store || !api || !this.host.isConnected) return;
    this.watch(store);
    const want = this.wanted();
    if ((want?.key ?? '') === this.key) return;
    this.stop();
    if (!want) return;
    const {key, id} = want;
    this.key = key;
    this.ends = TYPES.map(type =>
      api
        .subscribeForecast(id, type, forecast => {
          // a message of a subscription that was let go of, on its way
          if (this.key !== key) return;
          this[type] = forecast;
          this.host.requestUpdate();
          this.host.dispatchEvent(new ForecastEvent({type, forecast}));
        })
        .catch((error: unknown) => {
          console.warn('home-panel forecast', type, error);
          return null;
        }),
    );
  }

  // Told when the house's entity for the forecast changes or appears (the first hass finds it), and when a registry or the user
  // does, which the first hass also changes. Not told of any other entity: a hidden pane's controller costs nothing.
  private watch(store: PanelStore): void {
    const id = store.config.entities.weather ?? '';
    if (this.unwatch && id === this.watched) return;
    this.unwatch?.();
    this.watched = id;
    this.unwatch = store.subscribe(id ? [id] : [], () => this.sync());
  }

  private stop(): void {
    for (const end of this.ends) void end.then(unsubscribe => unsubscribe?.());
    this.ends = [];
    this.key = '';
    // the forecast of an entity the host no longer follows is not another entity's
    this.daily = [];
    this.hourly = [];
  }
}
