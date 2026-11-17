// A reactive controller that keeps the width of its host, or of an element the host names, and updates the host when it changes.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers) over one ResizeObserver per host, observing while the host is
// connected; the Automations timeline lays its dots out for its width, and `<hp-chart>` waits for a width before it draws.
// Must not: share an observer between hosts, keep observing after the host disconnects, or touch the host's DOM.
import type {ReactiveController, ReactiveControllerHost} from 'lit';

export class ResizeController implements ReactiveController {
  private observer: ResizeObserver | undefined;
  private observed: Element | undefined;
  /** The observed element's width in pixels, as last seen; 0 before the first measure or while it has no box. */
  width = 0;

  constructor(
    private readonly host: ReactiveControllerHost & Element,
    /** The element to measure, asked after each update: absent means the host itself; undefined while the element is not drawn yet. */
    private readonly target: () => Element | null | undefined = () => host,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this.observer = new ResizeObserver(entries => {
      const width = entries[entries.length - 1]?.contentRect.width ?? 0;
      if (width === this.width) return;
      this.width = width;
      this.host.requestUpdate();
    });
    this.observeTarget();
  }

  // the target may be drawn by the update (a chart's place), so it is looked for again after each one
  hostUpdated(): void {
    this.observeTarget();
  }

  hostDisconnected(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.observed = undefined;
  }

  private observeTarget(): void {
    const target = this.target() ?? undefined;
    if (!this.observer || target === this.observed) return;
    this.observer.disconnect();
    this.observed = target;
    if (target) this.observer.observe(target);
  }
}
