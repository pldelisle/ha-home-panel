// A reactive controller that asks its host to redraw every `ms` while the host is connected and says it is active.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers); one interval per host, started in hostConnected and cleared
// in hostDisconnected, so a disconnected host holds no timer. The interval keeps running while the host is not active and each
// tick is skipped: `active` is a getter the controller polls, it cannot announce a change back, and a skipped tick costs one call
// where a paused one would need the host to restart it. Its three users: the camera snapshots' stamp, the "ago" lines, the idle clock.
// Must not: start a timer before the host connects, keep one after it disconnects, or redraw a host that says it is not active.
import type {ReactiveController, ReactiveControllerHost} from 'lit';

export class TickController implements ReactiveController {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly ms: number,
    /** Read on every tick: false while the host is hidden (a pane that is not the shown one), and the tick is skipped. */
    private readonly active: () => boolean = () => true,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.active()) this.host.requestUpdate();
    }, this.ms);
  }

  hostDisconnected(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
