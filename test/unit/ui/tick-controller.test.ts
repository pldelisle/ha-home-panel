// TickController: one interval per host, started on connect, cleared on disconnect, and silent while the host is not active.
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {TickController} from '../../../src/ui/controllers/tick.ts';
import {fakeHost} from './support.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('TickController', () => {
  test('starts no timer before the host connects, then asks for an update every interval', () => {
    const host = fakeHost();
    new TickController(host, 10_000);
    vi.advanceTimersByTime(30_000);
    expect(host.updates).toBe(0);
    host.connect();
    vi.advanceTimersByTime(25_000);
    expect(host.updates).toBe(2);
  });

  test('stops on disconnect and holds no timer', () => {
    const host = fakeHost();
    new TickController(host, 10_000);
    host.connect();
    host.disconnect();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(host.updates).toBe(0);
  });

  test('a second connection runs one interval, not two', () => {
    const host = fakeHost();
    new TickController(host, 10_000);
    host.connect();
    host.connect();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(host.updates).toBe(1);
  });

  test('is idle while the host is not active, and resumes when it is', () => {
    const host = fakeHost();
    let active = false;
    new TickController(host, 10_000, () => active);
    host.connect();
    vi.advanceTimersByTime(30_000);
    expect(host.updates).toBe(0);
    active = true;
    vi.advanceTimersByTime(10_000);
    expect(host.updates).toBe(1);
  });
});
