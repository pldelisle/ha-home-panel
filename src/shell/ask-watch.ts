// AskWatch: asks the shell to redraw when the Ask sheet's AI Task entity appears in the house or goes, which is all the header's Ask button depends on.
// Pattern: a Lit reactive controller (Lit docs, Reactive Controllers) over the store's observer (ADR 0012) that filters its own notifications: it subscribes to the one entity and updates the host
// only when the entity's existence changed. Every question changes that entity's state, so the shell's own store controller (which redraws the whole panel for each id it lists) must not list it.
// Must not: read a state value, draw anything, mark the shell's tab availability stale, or keep a subscription once the host left.
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import type {PanelStore} from '../core/store.ts';

export class AskWatch implements ReactiveController {
  private off: (() => void) | undefined;
  /** What the subscription was made for: the entity and the config generation it was read under. */
  private watched: string | null = null;
  private generation = -1;
  private present = false;
  private connected = false;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly store: Pick<PanelStore, 'config' | 'generation' | 'state' | 'subscribe'>,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this.connected = true;
    this.watch();
  }

  /** The config may name another entity, or none, after a change: the subscription follows it. */
  hostUpdate(): void {
    if (this.connected && (this.entity !== this.watched || this.store.generation !== this.generation)) this.watch();
  }

  hostDisconnected(): void {
    this.connected = false;
    this.off?.();
    this.off = undefined;
  }

  private get entity(): string | null {
    return this.store.config.ask?.entity ?? null;
  }

  private watch(): void {
    this.off?.();
    this.off = undefined;
    this.watched = this.entity;
    this.generation = this.store.generation;
    if (this.watched === null) return;
    const entity = this.watched;
    this.present = this.store.state(entity) !== undefined;
    this.off = this.store.subscribe([entity], () => {
      const now = this.store.state(entity) !== undefined;
      if (now === this.present) return;
      this.present = now;
      this.host.requestUpdate();
    });
  }
}
