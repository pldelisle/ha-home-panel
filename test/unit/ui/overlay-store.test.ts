// The optimistic overlay: the pure rule (the legacy `pend`) and the store that holds the values the person asked for.
import {describe, expect, test, vi} from 'vitest';
import {overlay, OverlayStore, TTL_MS, type Held} from '../../../src/ui/overlay-store.ts';

const held = (entries: Record<string, Held>) => new Map(Object.entries(entries));

describe('overlay, the rule', () => {
  test('answers what Home Assistant says when nothing is held', () => {
    expect(overlay(held({}), 'a', 'off', 0)).toBe('off');
  });

  test('answers the held value while it differs from the current one and has not expired', () => {
    const map = held({a: {value: 'on', until: 100}});
    expect(overlay(map, 'a', 'off', 99)).toBe('on');
    expect(map.has('a')).toBe(true);
  });

  test('drops the key and answers the current value once Home Assistant agrees', () => {
    const map = held({a: {value: 'on', until: 100}});
    expect(overlay(map, 'a', 'on', 10)).toBe('on');
    expect(map.size).toBe(0);
  });

  test('compares as strings: 0.3 held and 0.30000001 reported differ, 0.3 held and "0.3" reported agree', () => {
    const differs = held({v: {value: 0.3, until: 100}});
    expect(overlay(differs, 'v', 0.30000001, 10)).toBe(0.3);
    const agrees = held({v: {value: 0.3, until: 100}});
    expect(overlay(agrees, 'v', '0.3', 10)).toBe('0.3');
    expect(agrees.size).toBe(0);
  });

  test('has expired at the instant of its time, not one tick later, and the key is dropped', () => {
    const map = held({a: {value: 'on', until: 100}});
    expect(overlay(map, 'a', 'off', 100)).toBe('off');
    expect(map.size).toBe(0);
  });
});

describe('OverlayStore', () => {
  const clock = (start = 1_000) => {
    let t = start;
    return {now: () => t, advance: (ms: number) => (t += ms)};
  };

  test('holds a value for twenty seconds by default', () => {
    const c = clock();
    const store = new OverlayStore({now: c.now});
    store.hold('a', 'on');
    expect(TTL_MS).toBe(20_000);
    c.advance(19_999);
    expect(store.read('a', 'off')).toBe('on');
    c.advance(1);
    expect(store.read('a', 'off')).toBe('off');
    expect(store.size).toBe(0);
  });

  test('holds for a given time instead', () => {
    const c = clock();
    const store = new OverlayStore({now: c.now});
    store.hold('ran', true, 4_000);
    c.advance(4_000);
    expect(store.read('ran', false)).toBe(false);
  });

  test('reads the platform clock when it is given none', () => {
    const store = new OverlayStore();
    store.hold('a', 'on');
    expect(store.read('a', 'off')).toBe('on');
  });

  test('tells its subscribers on a hold and on a release that removed something, and not on a release of nothing', () => {
    const store = new OverlayStore();
    const heard = vi.fn();
    const off = store.subscribe(heard);
    store.hold('a', 1);
    expect(heard).toHaveBeenCalledTimes(1);
    store.release('missing');
    expect(heard).toHaveBeenCalledTimes(1);
    store.release('a', 'missing');
    expect(heard).toHaveBeenCalledTimes(2);
    off();
    store.hold('b', 2);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  test('releases only the keys it is given', () => {
    const store = new OverlayStore();
    store.hold('mine', 1);
    store.hold('theirs', 2);
    store.release('mine');
    expect(store.read('mine', 0)).toBe(0);
    expect(store.read('theirs', 0)).toBe(2);
    expect(store.size).toBe(1);
  });

  test('says when the earliest value expires, and nothing when none is held', () => {
    const c = clock(0);
    const store = new OverlayStore({now: c.now});
    expect(store.nextExpiry()).toBeUndefined();
    store.hold('late', 1, 9_000);
    store.hold('soon', 1, 4_000);
    expect(store.nextExpiry()).toBe(4_000);
  });

  test('sweeps what has expired and keeps the rest, without telling anyone', () => {
    const c = clock(0);
    const store = new OverlayStore({now: c.now});
    const heard = vi.fn();
    store.hold('soon', 1, 1_000);
    store.hold('late', 2, 5_000);
    store.subscribe(heard);
    c.advance(1_000);
    store.sweep();
    expect(store.size).toBe(1);
    expect(store.nextExpiry()).toBe(5_000);
    expect(heard).not.toHaveBeenCalled();
  });
});
