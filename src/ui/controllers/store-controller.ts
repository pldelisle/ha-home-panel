// A reactive controller that subscribes its host to the entity ids it reads and updates it when one of them changes.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers) over the store's observer (ADR 0012); the store
// arrives by context (ADR 0018). A hidden pane calls pause(), so a wall tablet does no work for what it does not show.
// Must not: read an entity itself, keep a store past its host's disconnection, or be the only way to reach the store.
import {ContextConsumer} from '@lit/context';
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import type {HassChange, PanelStore} from '../../core/store.ts';
import {storeContext} from '../contexts.ts';

export interface StoreControllerOptions {
  /** The entity ids the host reads, or `'*'` for every change; asked again before each update, and the host listens to the new answer when the generation or the ids changed. */
  ids: (store: PanelStore) => readonly string[] | '*';
  /** Called before the host's update with what changed; most hosts need nothing here and just render again. */
  onChange?: (change: HassChange) => void;
  /**
   * The store itself, for the host that provides it: a context provider never answers a request from its own element,
   * so the shell has nothing to ask for. Every other host leaves this out and receives the store from context.
   */
  store?: PanelStore;
}

export class StoreController implements ReactiveController {
  private resolved: PanelStore | undefined;
  private unsubscribe: (() => void) | undefined;
  private generation = -1;
  private idsKey = '';
  private paused = false;

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly options: StoreControllerOptions,
  ) {
    host.addController(this);
    this.resolved = options.store;
    if (this.resolved) return;
    // `subscribe: false`: a store never changes for a given tree, so one answer at connection is enough
    new ContextConsumer(host, {
      context: storeContext,
      subscribe: false,
      callback: store => {
        this.resolved = store;
        this.subscribeNow();
      },
    });
  }

  /** The host's store, resolved through the context when the host connected. */
  get store(): PanelStore {
    if (!this.resolved) throw new Error('StoreController: the store arrives when the host connects.');
    return this.resolved;
  }

  hostConnected(): void {
    this.subscribeNow();
  }

  hostDisconnected(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  // The store's index is keyed by the ids a subscriber gave, so they are asked for again when the config generation moved and
  // when the answer changed: the first hass resolves the config again without a new generation (the house's entities are found).
  hostUpdate(): void {
    const store = this.resolved;
    if (!this.unsubscribe || !store) return;
    if (store.generation !== this.generation || this.keyOf(this.options.ids(store)) !== this.idsKey)
      this.subscribeNow();
  }

  /** A hidden pane stops listening: no change reaches the host until `resume`. */
  pause(): void {
    this.paused = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /** Listens again and asks the host for one update, since changes were missed while paused. */
  resume(): void {
    this.paused = false;
    this.subscribeNow();
    this.host.requestUpdate();
  }

  private keyOf(ids: readonly string[] | '*'): string {
    return ids === '*' ? '*' : ids.join('\n');
  }

  private subscribeNow(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    const store = this.resolved;
    if (!store || this.paused || !this.host.isConnected) return;
    this.generation = store.generation;
    const ids = this.options.ids(store);
    this.idsKey = this.keyOf(ids);
    this.unsubscribe = store.subscribe(ids, change => {
      this.options.onChange?.(change);
      this.host.requestUpdate();
    });
  }
}
