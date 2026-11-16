// ArmedController at the controller seam (ADR 0005): a fake host and Vitest's clock, so "four seconds" is a call to advanceTimersByTime and not a wait.
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {ARMED_MS, ArmedController} from '../../../src/ui/controllers/armed.ts';

function setup() {
  const controllers: ArmedController[] = [];
  const host = {
    addController: (controller: ArmedController) => controllers.push(controller),
    removeController: () => undefined,
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
  return {armed: new ArmedController(host), host, controllers};
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ArmedController', () => {
  test('registers with its host, and a key is not armed until it is armed', () => {
    const {armed, controllers} = setup();
    expect(controllers).toEqual([armed]);
    expect(armed.isArmed('alloff')).toBe(false);
    expect(armed.confirm('alloff')).toBe(false);
  });

  test('the second tap within four seconds confirms, once, and the arming is spent', () => {
    const {armed, host} = setup();
    armed.arm('alloff');
    expect(armed.isArmed('alloff')).toBe(true);
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ARMED_MS - 1);
    host.requestUpdate.mockClear();
    expect(armed.confirm('alloff')).toBe(true);
    expect(host.requestUpdate, 'the button stops saying "Tap again"').toHaveBeenCalledTimes(1);
    expect(armed.isArmed('alloff')).toBe(false);
    expect(armed.confirm('alloff')).toBe(false);
    // the lapse that was waiting is gone with it: nothing redraws four seconds on
    host.requestUpdate.mockClear();
    vi.advanceTimersByTime(ARMED_MS);
    expect(host.requestUpdate).not.toHaveBeenCalled();
  });

  test('the arming lapses after four seconds and the host redraws, so the button stops saying "Tap again"', () => {
    const {armed, host} = setup();
    armed.arm('alloff');
    host.requestUpdate.mockClear();
    vi.advanceTimersByTime(ARMED_MS);
    expect(armed.isArmed('alloff')).toBe(false);
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    expect(armed.confirm('alloff')).toBe(false);
  });

  test('arming a key again starts its four seconds over', () => {
    const {armed} = setup();
    armed.arm('alloff');
    vi.advanceTimersByTime(3000);
    armed.arm('alloff');
    vi.advanceTimersByTime(3000);
    expect(armed.isArmed('alloff')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(armed.isArmed('alloff')).toBe(false);
  });

  test('two keys are independent: each lapses on its own and confirming one leaves the other', () => {
    const {armed} = setup();
    armed.arm('allset');
    vi.advanceTimersByTime(2000);
    armed.arm('alloff');
    expect(armed.confirm('alloff')).toBe(true);
    expect(armed.isArmed('allset')).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(armed.isArmed('allset')).toBe(false);
  });

  test('a host that leaves keeps no arming, and no timer fires for it', () => {
    const {armed, host} = setup();
    armed.arm('allset');
    armed.arm('alloff');
    host.requestUpdate.mockClear();
    armed.hostDisconnected();
    expect(armed.isArmed('allset') || armed.isArmed('alloff')).toBe(false);
    vi.advanceTimersByTime(ARMED_MS);
    expect(host.requestUpdate).not.toHaveBeenCalled();
  });

  test('the wait is the host’s own when it says one', () => {
    const host = {
      addController: () => undefined,
      removeController: () => undefined,
      requestUpdate: vi.fn(),
      updateComplete: Promise.resolve(true),
    };
    const armed = new ArmedController(host, {ms: 500});
    armed.arm('x');
    vi.advanceTimersByTime(499);
    expect(armed.isArmed('x')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(armed.isArmed('x')).toBe(false);
  });
});
