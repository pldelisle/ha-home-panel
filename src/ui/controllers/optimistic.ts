// A reactive controller that gives its host the panel's optimistic values and updates it when any of them changes.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers) over the shared OverlayStore the shell provides by
// context (ADR 0023): the store holds, this subscribes, and one timer updates the host at the earliest expiry.
// A host that is off the page has no subscription and no timer: both are set again in hostConnected.
// Must not: keep a value itself (the store does), format a string, or be the only way to reach the store.
import {ContextConsumer} from '@lit/context';
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import {PLATFORM_TIMERS, type Timers} from '../../core/timing.ts';
import {optimisticContext} from '../contexts.ts';
import type {OverlayStore} from '../overlay-store.ts';

export interface OptimisticOptions {
  /** The store itself, for a host that has no provider above it (a test); every other host receives it from context. */
  store?: OverlayStore;
  /** The clock of the expiry timer; the platform's unless a test gives its own. The store's `now` decides what is expired. */
  timers?: Timers;
}

export class OptimisticController implements ReactiveController {
  private resolved: OverlayStore | undefined;
  private unsubscribe: (() => void) | undefined;
  private handle: unknown;
  private armed = false;
  private readonly timers: Timers;

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    options: OptimisticOptions = {},
  ) {
    host.addController(this);
    this.timers = options.timers ?? PLATFORM_TIMERS;
    this.resolved = options.store;
    if (this.resolved) return;
    // `subscribe: false`: a panel's store never changes, so one answer at connection is enough
    new ContextConsumer(host, {
      context: optimisticContext,
      subscribe: false,
      callback: store => {
        this.resolved = store;
        this.listen();
      },
    });
  }

  private get store(): OverlayStore {
    if (!this.resolved) throw new Error('OptimisticController: the store arrives when the host connects.');
    return this.resolved;
  }

  /** How many values are held, by any element of the panel. */
  get size(): number {
    return this.store.size;
  }

  /** Holds `value` under `key` for `ttlMs` (twenty seconds by default); every host of the panel updates. */
  hold(key: string, value: unknown, ttlMs?: number): void {
    this.store.hold(key, value, ttlMs);
  }

  /** The held value while it differs from `current` and has not expired; otherwise `current`. */
  read<T>(key: string, current: T): T {
    return this.store.read(key, current);
  }

  /** Drops the keys; every host of the panel updates. */
  release(...keys: string[]): void {
    this.store.release(...keys);
  }

  hostConnected(): void {
    this.listen();
  }

  hostDisconnected(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.disarm();
  }

  private listen(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (!this.resolved || !this.host.isConnected) return;
    this.unsubscribe = this.resolved.subscribe(() => {
      this.host.requestUpdate();
      this.arm();
    });
    this.arm();
  }

  // One timer at the earliest expiry: it sweeps what ran out and updates the host, whose render reads the current values
  // again, then looks for the next. Setting it afresh each time is how a hold, a release or a sweep moves it.
  private arm(): void {
    this.disarm();
    const store = this.resolved;
    const at = store?.nextExpiry();
    if (!store || at === undefined) return;
    this.armed = true;
    this.handle = this.timers.set(
      () => {
        this.armed = false;
        store.sweep();
        this.host.requestUpdate();
        this.arm();
      },
      Math.max(0, at - store.now()),
    );
  }

  private disarm(): void {
    if (this.armed) this.timers.clear(this.handle);
    this.armed = false;
  }
}
