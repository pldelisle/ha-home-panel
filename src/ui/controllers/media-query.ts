// A reactive controller for one media query: `matches` is always its current answer, and the host updates when it changes.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers), an observer of window.matchMedia in the form
// Lit's own examples give it; one list per instance, listened to only while the host is connected.
// Must not: share a list between controllers, be read before the host exists, or touch the host's DOM.
import type {ReactiveController, ReactiveControllerHost} from 'lit';

export class MediaQueryController implements ReactiveController {
  private readonly list: MediaQueryList;
  // the answer the host was last told, so a connection can tell whether a change came while it was away
  private seen: boolean;

  constructor(
    private readonly host: ReactiveControllerHost,
    query: string,
  ) {
    this.list = matchMedia(query);
    this.seen = this.list.matches;
    host.addController(this);
  }

  /** The query's answer now, read from the browser each time: right even before the host has heard of a change. */
  get matches(): boolean {
    return this.list.matches;
  }

  private readonly onChange = (): void => {
    this.seen = this.list.matches;
    this.host.requestUpdate();
  };

  hostConnected(): void {
    this.list.addEventListener('change', this.onChange);
    // the answer may have changed while the host was off the page, and no event came
    if (this.seen !== this.list.matches) this.onChange();
  }

  hostDisconnected(): void {
    this.list.removeEventListener('change', this.onChange);
  }
}
