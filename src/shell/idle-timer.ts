// The idle timer: after five minutes without a touch the tablet shows its clock; a touch wakes it. A state machine
// (`nextIdle`, a pure transition table) inside a Lit reactive controller that owns the timers and the four listeners.
// Pattern: State, in its table form (Gamma et al., Design Patterns); reactive controller (Lit docs, Reactive Controllers).
// The table below is the specification and the code; the shell draws the state, the guest still draws the clock.
// Must not: touch the DOM beyond its listeners, know what the shell draws, or call the guest (the shell does, on change).

import type {ReactiveController, ReactiveControllerHost} from 'lit';

export type IdleState = 'active' | 'idle' | 'waking';

/** `wakeDone` is internal: the controller sends it when the wake timer runs out. */
export type IdleEvent =
  | {type: 'touch'}
  | {type: 'timeout'}
  | {type: 'sleepNow'}
  | {type: 'compactChanged'; compact: boolean}
  | {type: 'wakeDone'};

/** What the controller does with its timers: run the idle timer, stop it, or run the wake timer; null leaves both alone. */
export type TimerCommand = 'start' | 'stop' | 'wake' | null;

export interface IdleStep {
  state: IdleState;
  timer: TimerCommand;
}

const stay = (state: IdleState): IdleStep => ({state, timer: null});
// a tablet runs the idle timer, a phone never does
const arming = (compact: boolean): TimerCommand => (compact ? 'stop' : 'start');

/**
 * The transition table. `compact` is whether the screen is a phone's; for `compactChanged` it is the event's.
 *
 * | State    | touch                      | timeout      | sleepNow     | compact: true  | compact: false  | wakeDone                  |
 * | -------- | -------------------------- | ------------ | ------------ | -------------- | --------------- | ------------------------- |
 * | `active` | `active`, start or stop \*  | `idle`, stop | `idle`, stop | `active`, stop | `active`, start | `active`, nothing         |
 * | `idle`   | `waking`, wake             | nothing      | nothing      | `active`, stop | nothing         | nothing                   |
 * | `waking` | nothing                    | nothing      | nothing      | nothing        | nothing         | `active`, start or stop \* |
 *
 * \* Start on a tablet, stop on a phone, which never goes idle by itself. "Nothing" is the same state and no timer
 * command. `compact: true` and `compact: false` are the event `compactChanged`. Start runs the 5-minute timer again,
 * stop clears it, wake runs the 400 ms timer whose end is `wakeDone`. A tap that wakes the panel is swallowed because
 * the overlay stays on screen, faded out, until the wake ends.
 */
export function nextIdle(state: IdleState, event: IdleEvent, env: {compact: boolean}): IdleStep {
  if (state === 'waking') {
    return event.type === 'wakeDone' ? {state: 'active', timer: arming(env.compact)} : stay('waking');
  }
  if (state === 'idle') {
    if (event.type === 'touch') return {state: 'waking', timer: 'wake'};
    if (event.type === 'compactChanged' && event.compact) return {state: 'active', timer: 'stop'};
    return stay('idle');
  }
  switch (event.type) {
    case 'touch':
      return {state: 'active', timer: arming(env.compact)};
    case 'timeout':
    case 'sleepNow':
      return {state: 'idle', timer: 'stop'};
    case 'compactChanged':
      return {state: 'active', timer: arming(event.compact)};
    case 'wakeDone':
      return stay('active');
  }
}

/** Timers behind a seam so a test needs no fake clock; at runtime the page's globals, read when called, so a faked clock applies. */
export interface Timers {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const pageTimers: Timers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: id => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface IdleTimerOptions {
  /** Without a touch for this long, a tablet goes idle (5 minutes). */
  delayMs: number;
  /** How long the wake lasts, the overlay's fade-out (400 ms). */
  wakeMs: number;
  /** Whether the screen is a phone's; asked at each event, never kept. */
  compact: () => boolean;
  /** Whether Home Assistant has handed over `hass`: before it there is no clock to show, so the idle moment is a touch. */
  ready: () => boolean;
  /** The state changed (never called for a stay); the shell draws it and tells the guest. */
  onChange: (state: IdleState) => void;
  /** Where `scroll` is heard, capturing, so a scroll inside a pane counts; the window. A test hands its own. */
  scrollTarget?: EventTarget;
  timers?: Timers;
}

/** The host: a Lit element, whose render root hears the touches. */
export type IdleHost = ReactiveControllerHost & {readonly renderRoot: EventTarget};

export class IdleTimer implements ReactiveController {
  private current: IdleState = 'active';
  private idleId: unknown;
  private wakeId: unknown;
  private readonly touchListeners = new Set<() => void>();
  private readonly timers: Timers;

  constructor(
    private readonly host: IdleHost,
    private readonly options: IdleTimerOptions,
  ) {
    this.timers = options.timers ?? pageTimers;
    host.addController(this);
  }

  get state(): IdleState {
    return this.current;
  }

  // The same four touches as the class heard: three on the root, the scroll on the window; all passive.
  private readonly touched = (): void => {
    for (const listener of this.touchListeners) listener();
    this.send({type: 'touch'});
  };

  /** Hears every touch the controller hears, so the appearance controller registers no listeners of its own; returns the way out. */
  onTouch(listener: () => void): () => void {
    this.touchListeners.add(listener);
    return () => this.touchListeners.delete(listener);
  }

  /** A touch that did not come from the pointer, such as the guest drawing again or a tab shown by code. */
  arm(): void {
    this.send({type: 'touch'});
  }

  /** "Sleep now": the clock at once, on a phone too. */
  sleepNow(): void {
    this.sendWhenReady({type: 'sleepNow'});
  }

  compactChanged(compact: boolean): void {
    this.send({type: 'compactChanged', compact});
  }

  hostConnected(): void {
    const {renderRoot} = this.host;
    for (const type of ['pointerdown', 'wheel', 'keydown'])
      renderRoot.addEventListener(type, this.touched, {passive: true});
    this.scrollTarget().addEventListener('scroll', this.touched, {passive: true, capture: true});
    this.arm(); // the first arm
  }

  hostDisconnected(): void {
    const {renderRoot} = this.host;
    for (const type of ['pointerdown', 'wheel', 'keydown']) renderRoot.removeEventListener(type, this.touched);
    this.scrollTarget().removeEventListener('scroll', this.touched, {capture: true});
    this.clearIdle();
    this.clearWake();
    // nothing would end a wake or a sleep now: the next connection starts from a clock that is not showing
    if (this.current !== 'active') this.move('active');
  }

  private scrollTarget(): EventTarget {
    return this.options.scrollTarget ?? window;
  }

  private send(event: IdleEvent): void {
    const step = nextIdle(this.current, event, {compact: this.options.compact()});
    switch (step.timer) {
      case 'start':
        this.clearIdle();
        this.idleId = this.timers.setTimeout(() => {
          this.idleId = undefined;
          this.sendWhenReady({type: 'timeout'});
        }, this.options.delayMs);
        break;
      case 'stop':
        this.clearIdle();
        break;
      case 'wake':
        this.clearIdle();
        this.clearWake();
        this.wakeId = this.timers.setTimeout(() => {
          this.wakeId = undefined;
          this.send({type: 'wakeDone'});
        }, this.options.wakeMs);
        break;
      case null:
        break;
    }
    this.move(step.state);
  }

  // Before the first hass there is no clock to draw: the moment passes as a touch and the timer runs again.
  private sendWhenReady(event: IdleEvent): void {
    this.send(this.options.ready() ? event : {type: 'touch'});
  }

  private move(next: IdleState): void {
    if (next === this.current) return;
    this.current = next;
    this.options.onChange(next);
  }

  private clearIdle(): void {
    if (this.idleId !== undefined) this.timers.clearTimeout(this.idleId);
    this.idleId = undefined;
  }

  private clearWake(): void {
    if (this.wakeId !== undefined) this.timers.clearTimeout(this.wakeId);
    this.wakeId = undefined;
  }
}
