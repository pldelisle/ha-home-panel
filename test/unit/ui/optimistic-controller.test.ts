// OptimisticController: a host's view of the panel's overlay store, with a fake host, a fake clock and fake timers.
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import {describe, expect, test, vi} from 'vitest';
import type {Timers} from '../../../src/core/timing.ts';
import {OptimisticController} from '../../../src/ui/controllers/optimistic.ts';
import {optimisticContext} from '../../../src/ui/contexts.ts';
import {OverlayStore} from '../../../src/ui/overlay-store.ts';

/** What the context protocol's request event carries (@lit/context does not export the class). */
interface ContextRequest {
  type: string;
  context: unknown;
  callback: (value: OverlayStore, unsubscribe: () => void) => void;
}

/** A clock that moves when the test says, with timers that run when it passes them. */
function fakeClock() {
  let t = 0;
  let next = 1;
  const pending = new Map<number, {at: number; run: () => void}>();
  const timers: Timers<number> = {
    set: (run, ms) => {
      pending.set(next, {at: t + ms, run});
      return next++;
    },
    clear: handle => void pending.delete(handle),
  };
  return {
    now: () => t,
    timers,
    pending: () => pending.size,
    advance(ms: number) {
      t += ms;
      for (const [handle, timer] of [...pending]) {
        if (timer.at > t) continue;
        pending.delete(handle);
        timer.run();
      }
    },
  };
}

/** The part of an element a controller uses: it lists its controllers, counts its updates and can answer a context request. */
function fakeHost(answer?: OverlayStore) {
  const controllers: ReactiveController[] = [];
  const host = {
    isConnected: false,
    updates: 0,
    addController: (c: ReactiveController) => void controllers.push(c),
    requestUpdate() {
      host.updates++;
    },
    dispatchEvent(event: Event) {
      // the protocol's request: an event named `context-request` that carries the key and a callback
      const request = event as unknown as ContextRequest;
      if (answer && request.type === 'context-request' && request.context === optimisticContext)
        request.callback(answer, () => {});
      return true;
    },
    connect() {
      host.isConnected = true;
      for (const c of controllers) c.hostConnected?.();
    },
    disconnect() {
      host.isConnected = false;
      for (const c of controllers) c.hostDisconnected?.();
    },
  };
  return host as typeof host & ReactiveControllerHost & HTMLElement;
}

function setup(answerByContext = false) {
  const clock = fakeClock();
  const store = new OverlayStore({now: clock.now});
  const host = fakeHost(answerByContext ? store : undefined);
  const controller = new OptimisticController(host, {store: answerByContext ? undefined : store, timers: clock.timers});
  return {clock, store, host, controller};
}

describe('OptimisticController', () => {
  test('holds, reads and releases through the store, and says how many are held', () => {
    const {controller, host} = setup();
    host.connect();
    controller.hold('tv:on', true);
    expect(controller.size).toBe(1);
    expect(controller.read('tv:on', false)).toBe(true);
    controller.release('tv:on');
    expect(controller.read('tv:on', false)).toBe(false);
    expect(controller.size).toBe(0);
  });

  test('updates its host when another element holds or releases a value of the same store', () => {
    const {store, host} = setup();
    host.connect();
    store.hold('tv:on', true);
    expect(host.updates).toBe(1);
    store.release('tv:on');
    expect(host.updates).toBe(2);
  });

  test('finds the store through the context when it is given none', () => {
    const {store, host, controller} = setup(true);
    host.connect();
    const before = host.updates; // the consumer asks for an update itself when the answer arrives
    store.hold('a', 1);
    expect(host.updates).toBe(before + 1);
    expect(controller.read('a', 0)).toBe(1);
  });

  test('has no store before the host connects, and says so', () => {
    const {controller} = setup(true);
    expect(() => controller.hold('a', 1)).toThrow(/arrives when the host connects/);
  });

  test('does not listen before its host connects or after it disconnects', () => {
    const {store, host} = setup();
    store.hold('a', 1);
    expect(host.updates).toBe(0);
    host.connect();
    host.disconnect();
    store.hold('b', 2);
    expect(host.updates).toBe(0);
  });

  test('updates its host once, at the earliest expiry, so an unconfirmed value visibly reverts', () => {
    const {clock, store, host, controller} = setup();
    host.connect();
    controller.hold('late', 1, 9_000);
    controller.hold('soon', 2, 4_000);
    const before = host.updates;
    clock.advance(3_999);
    expect(host.updates).toBe(before);
    clock.advance(1);
    expect(host.updates).toBe(before + 1);
    expect(store.size).toBe(1); // the expired one was swept, so the next timer is for the later one
    clock.advance(5_000);
    expect(host.updates).toBe(before + 2);
    expect(store.size).toBe(0);
    expect(clock.pending()).toBe(0);
  });

  test('keeps one timer however many values are held', () => {
    const {clock, controller, host} = setup();
    host.connect();
    controller.hold('a', 1);
    controller.hold('b', 2);
    controller.hold('c', 3);
    expect(clock.pending()).toBe(1);
  });

  test('clears its timer when its host disconnects and sets it again when it reconnects with values held', () => {
    const {clock, host, controller} = setup();
    host.connect();
    controller.hold('a', 1);
    host.disconnect();
    expect(clock.pending()).toBe(0);
    host.connect();
    expect(clock.pending()).toBe(1);
    const before = host.updates;
    clock.advance(20_000);
    expect(host.updates).toBe(before + 1);
  });

  test('sets no timer when it connects with nothing held', () => {
    const {clock, host} = setup();
    host.connect();
    expect(clock.pending()).toBe(0);
  });

  test('stops its timer when the last value is released', () => {
    const {clock, host, controller} = setup();
    host.connect();
    controller.hold('a', 1);
    controller.release('a');
    expect(clock.pending()).toBe(0);
  });

  test('uses the platform timers when it is given none', () => {
    vi.useFakeTimers();
    try {
      const store = new OverlayStore();
      const host = fakeHost();
      new OptimisticController(host, {store});
      host.connect();
      store.hold('a', 1, 1_000);
      const before = host.updates;
      vi.advanceTimersByTime(1_000);
      expect(host.updates).toBe(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
