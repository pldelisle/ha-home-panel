// The idle timer (src/shell/idle-timer.ts): the transition table row by row, then the controller around it with timers
// and targets handed in, so no clock is faked and no element is mounted. Prior art: guest.test.ts, features.test.ts.
import {describe, expect, test} from 'vitest';
import {
  IdleTimer,
  nextIdle,
  type IdleEvent,
  type IdleHost,
  type IdleState,
  type IdleStep,
  type Timers,
} from '../../src/shell/idle-timer.ts';

const touch: IdleEvent = {type: 'touch'};
const timeout: IdleEvent = {type: 'timeout'};
const sleepNow: IdleEvent = {type: 'sleepNow'};
const phone: IdleEvent = {type: 'compactChanged', compact: true};
const tablet: IdleEvent = {type: 'compactChanged', compact: false};
const wakeDone: IdleEvent = {type: 'wakeDone'};

const step = (state: IdleState, timer: IdleStep['timer']): IdleStep => ({state, timer});

describe('nextIdle, the table of docs/specs/14-lit-shell.md', () => {
  // [state, event, compact, expected]: every cell of the table in the module's header
  const rows: Array<[IdleState, string, IdleEvent, boolean, IdleStep]> = [
    ['active', 'touch', touch, false, step('active', 'start')],
    ['active', 'touch', touch, true, step('active', 'stop')],
    ['active', 'timeout', timeout, false, step('idle', 'stop')],
    ['active', 'sleepNow', sleepNow, false, step('idle', 'stop')],
    ['active', 'sleepNow (a phone)', sleepNow, true, step('idle', 'stop')],
    ['active', 'compact: true', phone, true, step('active', 'stop')],
    ['active', 'compact: false', tablet, false, step('active', 'start')],
    ['active', 'wakeDone', wakeDone, false, step('active', null)],
    ['idle', 'touch', touch, false, step('waking', 'wake')],
    ['idle', 'touch (a phone)', touch, true, step('waking', 'wake')],
    ['idle', 'timeout', timeout, false, step('idle', null)],
    ['idle', 'sleepNow', sleepNow, false, step('idle', null)],
    ['idle', 'compact: true', phone, true, step('active', 'stop')],
    ['idle', 'compact: false', tablet, false, step('idle', null)],
    ['idle', 'wakeDone', wakeDone, false, step('idle', null)],
    ['waking', 'touch', touch, false, step('waking', null)],
    ['waking', 'timeout', timeout, false, step('waking', null)],
    ['waking', 'sleepNow', sleepNow, false, step('waking', null)],
    ['waking', 'compact: true', phone, true, step('waking', null)],
    ['waking', 'compact: false', tablet, false, step('waking', null)],
    ['waking', 'wakeDone', wakeDone, false, step('active', 'start')],
    ['waking', 'wakeDone (a phone)', wakeDone, true, step('active', 'stop')],
  ];

  test.each(rows)('%s + %s (compact %s)', (state, _name, event, compact, expected) => {
    expect(nextIdle(state, event, {compact})).toEqual(expected);
  });
});

// A scripted clock: timers wait in a list until the test runs them, so "five minutes" is a call, not a wait.
function clock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, {at: number; run: () => void}>();
  const timers: Timers = {
    setTimeout: (run, ms) => {
      pending.set(nextId, {at: now + ms, run});
      return nextId++;
    },
    clearTimeout: id => void pending.delete(id as number),
  };
  return {
    timers,
    get waiting() {
      return pending.size;
    },
    advance(ms: number) {
      const to = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = to;
    },
  };
}

const MIN = 60_000;

function setup(initial: {compact?: boolean; ready?: boolean} = {}) {
  const c = clock();
  const root = new EventTarget();
  const scroll = new EventTarget();
  const controllers: Array<{hostConnected?(): void; hostDisconnected?(): void}> = [];
  const host: IdleHost = {
    renderRoot: root,
    addController: controller => void controllers.push(controller),
    removeController: () => {},
    requestUpdate: () => {},
    updateComplete: Promise.resolve(true),
  };
  const env = {compact: initial.compact ?? false, ready: initial.ready ?? true};
  const changes: IdleState[] = [];
  const timer = new IdleTimer(host, {
    delayMs: 5 * MIN,
    wakeMs: 400,
    compact: () => env.compact,
    ready: () => env.ready,
    onChange: state => changes.push(state),
    scrollTarget: scroll,
    timers: c.timers,
  });
  return {
    c,
    root,
    scroll,
    env,
    changes,
    timer,
    connect: () => controllers.forEach(x => x.hostConnected?.()),
    disconnect: () => controllers.forEach(x => x.hostDisconnected?.()),
  };
}

describe('IdleTimer', () => {
  test('a tablet goes idle after five minutes, and a tap wakes it 400 ms later', () => {
    const t = setup();
    t.connect();
    t.c.advance(5 * MIN - 1);
    expect(t.timer.state).toBe('active');
    t.c.advance(1);
    expect(t.timer.state).toBe('idle');
    t.root.dispatchEvent(new Event('pointerdown'));
    expect(t.timer.state).toBe('waking');
    t.c.advance(399);
    expect(t.timer.state).toBe('waking');
    t.c.advance(1);
    expect(t.timer.state).toBe('active');
    expect(t.changes).toEqual(['idle', 'waking', 'active']);
    t.c.advance(5 * MIN);
    expect(t.timer.state).toBe('idle'); // the five minutes run again from the wake
  });

  test('each touch starts the five minutes over: pointer, wheel and key on the root, a scroll on the window', () => {
    const t = setup();
    t.connect();
    for (const [target, type] of [
      [t.root, 'pointerdown'],
      [t.root, 'wheel'],
      [t.root, 'keydown'],
      [t.scroll, 'scroll'],
    ] as const) {
      t.c.advance(4 * MIN);
      target.dispatchEvent(new Event(type));
      expect(t.c.waiting).toBe(1); // one idle timer, never two
    }
    t.c.advance(4 * MIN);
    expect(t.timer.state).toBe('active');
    t.c.advance(MIN);
    expect(t.timer.state).toBe('idle');
  });

  test('the listeners are passive; the scroll is heard while capturing', () => {
    const seen: Array<[string, unknown]> = [];
    const spy = (target: EventTarget) => {
      const add = target.addEventListener.bind(target);
      target.addEventListener = (type: string, listener: EventListener, options: unknown) => {
        seen.push([type, options]);
        add(type, listener, options as AddEventListenerOptions);
      };
    };
    const t = setup();
    spy(t.root);
    spy(t.scroll);
    t.connect();
    expect(seen).toEqual([
      ['pointerdown', {passive: true}],
      ['wheel', {passive: true}],
      ['keydown', {passive: true}],
      ['scroll', {passive: true, capture: true}],
    ]);
  });

  test('a phone never goes idle by itself, and Sleep now still shows the clock', () => {
    const t = setup({compact: true});
    t.connect();
    expect(t.c.waiting).toBe(0);
    t.c.advance(60 * MIN);
    expect(t.timer.state).toBe('active');
    t.timer.sleepNow();
    expect(t.timer.state).toBe('idle');
    t.root.dispatchEvent(new Event('pointerdown'));
    t.c.advance(400);
    expect(t.timer.state).toBe('active');
    expect(t.c.waiting).toBe(0); // and no timer is left running
  });

  test('Sleep now on a tablet goes idle at once and stops the five minutes', () => {
    const t = setup();
    t.connect();
    t.timer.sleepNow();
    expect(t.timer.state).toBe('idle');
    expect(t.c.waiting).toBe(0);
    expect(t.changes).toEqual(['idle']);
  });

  test('touches while waking change nothing, so the wake is told once', () => {
    const t = setup();
    t.connect();
    t.timer.sleepNow();
    t.root.dispatchEvent(new Event('pointerdown'));
    t.root.dispatchEvent(new Event('pointerdown'));
    t.root.dispatchEvent(new Event('wheel'));
    t.timer.arm();
    t.c.advance(400);
    expect(t.changes).toEqual(['idle', 'waking', 'active']);
    expect(t.c.waiting).toBe(1); // the five minutes, once
  });

  test('before the first hass the idle moment is a touch: no clock, and the timer runs again', () => {
    const t = setup({ready: false});
    t.connect();
    t.c.advance(5 * MIN);
    expect(t.timer.state).toBe('active');
    expect(t.c.waiting).toBe(1);
    t.timer.sleepNow();
    expect(t.timer.state).toBe('active');
    t.env.ready = true;
    t.c.advance(5 * MIN);
    expect(t.timer.state).toBe('idle');
  });

  test('becoming a phone stops the timer and wakes an idle panel; becoming a tablet starts it', () => {
    const t = setup();
    t.connect();
    t.env.compact = true;
    t.timer.compactChanged(true);
    expect(t.c.waiting).toBe(0);
    t.env.compact = false;
    t.timer.compactChanged(false);
    expect(t.c.waiting).toBe(1);
    t.timer.sleepNow();
    t.env.compact = true;
    t.timer.compactChanged(true);
    expect(t.timer.state).toBe('active');
    expect(t.c.waiting).toBe(0);
    expect(t.changes).toEqual(['idle', 'active']);
  });

  test('a phone reached while waking has no idle timer when the wake ends', () => {
    const t = setup();
    t.connect();
    t.timer.sleepNow();
    t.root.dispatchEvent(new Event('pointerdown'));
    t.env.compact = true;
    t.timer.compactChanged(true);
    expect(t.timer.state).toBe('waking');
    t.c.advance(400);
    expect(t.timer.state).toBe('active');
    expect(t.c.waiting).toBe(0);
  });

  test('onTouch hears each touch, and stops when asked; arm is not a touch', () => {
    const t = setup();
    t.connect();
    let heard = 0;
    const stop = t.timer.onTouch(() => heard++);
    t.root.dispatchEvent(new Event('keydown'));
    t.scroll.dispatchEvent(new Event('scroll'));
    t.timer.arm();
    expect(heard).toBe(2);
    stop();
    t.root.dispatchEvent(new Event('keydown'));
    expect(heard).toBe(2);
  });

  test('disconnecting removes every listener and timer, and a wake that was running is over', () => {
    const t = setup();
    t.connect();
    t.timer.sleepNow();
    t.root.dispatchEvent(new Event('pointerdown'));
    expect(t.timer.state).toBe('waking');
    t.disconnect();
    expect(t.c.waiting).toBe(0);
    expect(t.timer.state).toBe('active');
    expect(t.changes).toEqual(['idle', 'waking', 'active']);
    t.root.dispatchEvent(new Event('pointerdown'));
    t.scroll.dispatchEvent(new Event('scroll'));
    expect(t.c.waiting).toBe(0); // nothing hears a touch now
    t.connect();
    expect(t.c.waiting).toBe(1); // and the next connection arms again
    t.disconnect();
    expect(t.changes).toEqual(['idle', 'waking', 'active']); // an active panel has nothing to tell
  });

  test('without a scroll target it listens to the window', () => {
    const added: string[] = [];
    const removed: string[] = [];
    const fake = {
      addEventListener: (type: string) => added.push(type),
      removeEventListener: (type: string) => removed.push(type),
    };
    const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {value: fake, configurable: true});
    try {
      const host: IdleHost = {
        renderRoot: new EventTarget(),
        addController: c => c.hostConnected?.(),
        removeController: () => {},
        requestUpdate: () => {},
        updateComplete: Promise.resolve(true),
      };
      const controller = new IdleTimer(host, {
        delayMs: 1,
        wakeMs: 1,
        compact: () => true,
        ready: () => true,
        onChange: () => {},
      });
      controller.hostDisconnected();
      expect([added, removed]).toEqual([['scroll'], ['scroll']]);
    } finally {
      if (original) Object.defineProperty(globalThis, 'window', original);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });

  test('without timers handed in it uses the page globals, read when called', () => {
    const calls: string[] = [];
    const set = globalThis.setTimeout;
    const clear = globalThis.clearTimeout;
    globalThis.setTimeout = ((run: () => void, ms: number) => {
      calls.push(`set ${ms}`);
      return 7 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = (id: unknown) => void calls.push(`clear ${String(id)}`);
    try {
      const host: IdleHost = {
        renderRoot: new EventTarget(),
        addController: () => {},
        removeController: () => {},
        requestUpdate: () => {},
        updateComplete: Promise.resolve(true),
      };
      const controller = new IdleTimer(host, {
        delayMs: 300_000,
        wakeMs: 400,
        compact: () => false,
        ready: () => true,
        onChange: () => {},
        scrollTarget: new EventTarget(),
      });
      controller.arm();
      controller.arm();
    } finally {
      globalThis.setTimeout = set;
      globalThis.clearTimeout = clear;
    }
    expect(calls).toEqual(['set 300000', 'clear 7', 'set 300000']);
  });
});
