// The toast's schedule (src/ui/toast-schedule.ts): the 3.5-second rule, sticky, replacement and dismissal at a clock the test
// passes in, so no timer runs and no element is mounted (ADR 0005's pure-function seam).
import {describe, expect, test} from 'vitest';
import {DONE_MS, expiry, nextToast, type ToastState} from '../../../src/ui/toast-schedule.ts';

const show = (message: string, sticky = false) => ({type: 'show', message, sticky}) as const;
const T = 1_000_000;

describe('nextToast and expiry', () => {
  test('a done toast is due 3.5 seconds after it shows, and goes then, not before', () => {
    const s = nextToast(null, show('Saved'), T);
    expect(s).toEqual({message: 'Saved', sticky: false, until: T + 3500});
    expect(DONE_MS).toBe(3500);
    expect(expiry(s)).toBe(T + 3500);
    expect(nextToast(s, {type: 'expire'}, T + 3499)).toBe(s);
    expect(nextToast(s, {type: 'expire'}, T + 3500)).toBeNull();
  });

  test('a sticky toast has nothing due and outlives any expire; a tap dismisses it', () => {
    const s = nextToast(null, show('It did not work', true), T);
    expect(s).toEqual({message: 'It did not work', sticky: true, until: null});
    expect(expiry(s)).toBeNull();
    expect(nextToast(s, {type: 'expire'}, T + 60_000)).toBe(s);
    expect(nextToast(s, {type: 'dismiss'}, T + 1)).toBeNull();
  });

  test("a new toast replaces the one showing: a done one ends a sticky one, and restarts a done one's 3.5 seconds", () => {
    const sticky = nextToast(null, show('Failed', true), T);
    expect(nextToast(sticky, show('Saved'), T + 10)).toEqual({message: 'Saved', sticky: false, until: T + 10 + 3500});
    const done = nextToast(null, show('Saved'), T);
    const again = nextToast(done, show('Saved'), T + 3000);
    expect(expiry(again)).toBe(T + 6500);
    // the first one's timer, had it run, would not end the second
    expect(nextToast(again, {type: 'expire'}, T + 3500)).toBe(again);
    expect(nextToast(done, show('Failed', true), T + 1)?.until).toBeNull();
  });

  test('with no toast, nothing is due and an expire or a dismiss leaves none', () => {
    const none: ToastState = null;
    expect(expiry(none)).toBeNull();
    expect(nextToast(none, {type: 'expire'}, T)).toBeNull();
    expect(nextToast(none, {type: 'dismiss'}, T)).toBeNull();
  });
});
