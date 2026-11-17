// ControlSender: shows what a tap asked for at once and sends its command: now, or once the asking stops.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers) over the panel's overlay and the kit's `CommandRunner` (ADR 0023), with one wait per target, as the legacy `later(key)`:
// five taps on a setpoint, or a dial dragged about, are one `set_temperature` 1,100 ms after the last, and a wait on its way never outlives its host.
// A host that leaves the document sends nothing and releases the values it was holding for a send, so it never comes back showing a value nobody asked Home Assistant for.
// It does not build on `core/timing`'s `debounce`, which is one wait for one function: this keeps one per target and lets each host release the holds of the waits it leaves.
// Must not: read an entity, word a string, or decide what a command is (the caller builds it, `holds` says which keys show the value).
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import {PLATFORM_TIMERS, type Timers} from '../../core/timing.ts';
import type {Command} from '../../core/commands.ts';
import type {CommandRunner} from '../../ui/commands.ts';
import type {OptimisticController} from '../../ui/controllers/optimistic.ts';

/** How long a setpoint waits for the asking to stop: the legacy panel's 1,100 ms, a little over a second. */
export const SETPOINT_WAIT_MS = 1100;

export interface ControlSenderOptions {
  overlay: Pick<OptimisticController, 'hold' | 'release'>;
  commands: Pick<CommandRunner, 'run' | 'runHolding'>;
  ms?: number;
  /** The clock of the wait; the platform's unless a test gives its own. */
  timers?: Timers;
}

interface Waiting {
  handle: unknown;
  keys: readonly string[];
}

export class ControlSender implements ReactiveController {
  private readonly waiting = new Map<string, Waiting>();
  private readonly ms: number;
  private readonly timers: Timers;

  constructor(
    host: ReactiveControllerHost,
    private readonly options: ControlSenderOptions,
  ) {
    this.ms = options.ms ?? SETPOINT_WAIT_MS;
    this.timers = options.timers ?? PLATFORM_TIMERS;
    host.addController(this);
  }

  /** Shows `value` under each of the command's `holds` and sends it now: a mode, a fan, a louver position, or a second tap. */
  now(command: Command, value: unknown): void {
    void this.options.commands.runHolding(command, value);
  }

  /** Shows `value` and sends nothing: a dial being dragged shows where the finger is, and `later` sends where it rests. */
  show(command: Command, value: unknown): void {
    this.hold(command, value);
  }

  /** Shows `value` at once and sends the command once no other for the same keys follows within the wait: the last one of a burst is the one sent. */
  later(command: Command, value: unknown): void {
    this.hold(command, value);
    const keys = command.holds ?? [];
    const target = keys.join('|');
    this.cancel(target);
    this.waiting.set(target, {
      keys,
      handle: this.timers.set(() => {
        this.waiting.delete(target);
        void this.options.commands.run(command);
      }, this.ms),
    });
  }

  /** A host that leaves the document sends nothing: the waits stop and the values they were holding are let go. */
  hostDisconnected(): void {
    for (const [target, {keys}] of this.waiting) {
      this.cancel(target);
      this.options.overlay.release(...keys);
    }
  }

  private hold({holds = []}: Command, value: unknown): void {
    for (const key of holds) this.options.overlay.hold(key, value);
  }

  private cancel(target: string): void {
    const waiting = this.waiting.get(target);
    if (!waiting) return;
    this.timers.clear(waiting.handle);
    this.waiting.delete(target);
  }
}
