// A controller that reflects the panel's appearance onto its host as attributes, so the element's CSS can test them.
// Pattern: Lit reactive controller over a context consumer (Lit docs, Reactive Controllers and Context; the W3C Community
// Group's Context Protocol): `data-theme`, `compact`, `narrow`, `glass` and `large-text` on the host, `:host([compact]) .x` in its styles.
// Must not: read the settings or a media query (the shell's controller does), style anything, or touch the host's shadow root.
import {ContextConsumer} from '@lit/context';
import type {ReactiveControllerHost} from 'lit';
import {appearanceContext, type Appearance} from '../contexts.ts';

export class AppearanceConsumer {
  private readonly consumer: ContextConsumer<typeof appearanceContext, ReactiveControllerHost & HTMLElement>;

  constructor(private readonly host: ReactiveControllerHost & HTMLElement) {
    // `subscribe: true`: the provider hands over a new object whenever anything in it changes. The consumer asks for the
    // context when the host connects, the provider answers at once, and the consumer asks the host for an update itself.
    this.consumer = new ContextConsumer(host, {
      context: appearanceContext,
      subscribe: true,
      callback: appearance => this.reflect(appearance),
    });
  }

  /** The appearance last received; `undefined` until the host has connected and found the provider. */
  get value(): Appearance | undefined {
    return this.consumer.value;
  }

  private reflect(a: Appearance): void {
    const {host} = this;
    host.setAttribute('data-theme', a.theme);
    host.toggleAttribute('compact', a.compact);
    host.toggleAttribute('narrow', a.narrow);
    host.toggleAttribute('glass', a.glass.on);
    host.toggleAttribute('large-text', a.largeText);
  }
}
