// debounce: the call that runs is the last one, after the quiet time. Timers are injected, so no test waits and none is flaky.
import {afterEach, describe, expect, test, vi} from 'vitest';
import {debounce, type Timers} from '../../../src/core/timing.ts';

/** Timers that run when the test says so: `advance(ms)` moves a clock and fires what came due, in order. */
function manualTimers() {
  let now = 0;
  let next = 0;
  const pending = new Map<number, {at: number; run: () => void}>();
  const timers: Timers<number> = {
    set(run, ms) {
      pending.set(++next, {at: now + ms, run});
      return next;
    },
    clear(handle) {
      pending.delete(handle);
    },
  };
  return {
    timers,
    pending: () => pending.size,
    advance(ms: number) {
      now += ms;
      for (const [handle, timer] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now) continue;
        pending.delete(handle);
        timer.run();
      }
    },
  };
}

describe('debounce', () => {
  test('five calls inside the quiet time run once, with the last arguments, 450 ms after the last', () => {
    const clock = manualTimers();
    const calls: number[] = [];
    const send = debounce((level: number) => calls.push(level), 450, clock.timers);
    for (const level of [0.1, 0.15, 0.2, 0.25, 0.3]) {
      send(level);
      clock.advance(100);
    }
    clock.advance(349);
    expect(calls).toEqual([]);
    clock.advance(1);
    expect(calls).toEqual([0.3]);
    clock.advance(1000);
    expect(calls).toEqual([0.3]);
  });

  test('a call after the quiet time is a new burst and runs again', () => {
    const clock = manualTimers();
    const fn = vi.fn();
    const send = debounce(fn, 450, clock.timers);
    send('a');
    clock.advance(450);
    send('b');
    clock.advance(450);
    expect(fn.mock.calls).toEqual([['a'], ['b']]);
  });

  test('cancel drops the call that is waiting, and a cancel with nothing waiting does nothing', () => {
    const clock = manualTimers();
    const fn = vi.fn();
    const send = debounce(fn, 450, clock.timers);
    send(1);
    expect(clock.pending()).toBe(1);
    send.cancel();
    expect(clock.pending()).toBe(0);
    clock.advance(1000);
    expect(fn).not.toHaveBeenCalled();
    expect(() => send.cancel()).not.toThrow();
  });

  test('two debounced functions do not share a timer', () => {
    const clock = manualTimers();
    const a = vi.fn();
    const b = vi.fn();
    debounce(a, 10, clock.timers)(1);
    debounce(b, 10, clock.timers)(2);
    clock.advance(10);
    expect([a.mock.calls, b.mock.calls]).toEqual([[[1]], [[2]]]);
  });
});

describe('the default timers are the platform ones', () => {
  afterEach(() => vi.useRealTimers());

  test('setTimeout and clearTimeout: the call runs after the quiet time, and a later call restarts it', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const send = debounce(fn, 450);
    send('a');
    vi.advanceTimersByTime(300);
    send('b');
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(fn.mock.calls).toEqual([['b']]);
  });
});
