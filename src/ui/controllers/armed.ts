// ArmedController: the second tap that confirms what a stray touch must not do: the first tap arms a key, a second within four seconds confirms it, and the arming lapses.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers) holding a small state machine per key; the host redraws when a key is armed or lapses, and the timers go with the host.
// Climate's controls ("Set all" and "All off", #248) and Car's remote start and unlock (#250) will use it; nothing does yet. Must not: send a command (the owner does, on `confirm`), word the "Tap again" text, or outlive its host.
import type {ReactiveController, ReactiveControllerHost} from 'lit';

/** How long an armed key waits for its second tap: the legacy panel's four seconds. */
export const ARMED_MS = 4000;

export class ArmedController implements ReactiveController {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly ms: number;

  constructor(
    private readonly host: ReactiveControllerHost,
    {ms = ARMED_MS}: {ms?: number} = {},
  ) {
    this.ms = ms;
    host.addController(this);
  }

  /** The first tap: the key waits for a second, for `ms` from now (an armed key armed again starts its wait over). */
  arm(key: string): void {
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.host.requestUpdate();
      }, this.ms),
    );
    this.host.requestUpdate();
  }

  /** The key is waiting for its second tap: the button shows "Tap again". */
  isArmed(key: string): boolean {
    return this.timers.has(key);
  }

  /** The second tap: true when the key was armed, and the arming is spent; false when it was not (the owner arms it). */
  confirm(key: string): boolean {
    if (!this.isArmed(key)) return false;
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    this.host.requestUpdate();
    return true;
  }

  /** A host that leaves the document keeps no arming: coming back, no button says "Tap again". */
  hostDisconnected(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
