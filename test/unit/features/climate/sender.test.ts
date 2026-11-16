// ControlSender at the controller seam (ADR 0005): a fake overlay, a fake runner and Vitest's clock, so "1,100 ms" is a call to advanceTimersByTime and not a wait.
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {ControlSender, SETPOINT_WAIT_MS} from '../../../../src/features/climate/sender.ts';
import type {Command} from '../../../../src/ui/commands.ts';

function setup() {
  const controllers: ControlSender[] = [];
  const host = {
    addController: (controller: ControlSender) => controllers.push(controller),
    removeController: () => undefined,
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
  const overlay = {hold: vi.fn(), release: vi.fn()};
  const commands = {run: vi.fn(() => Promise.resolve(true))};
  return {sender: new ControlSender(host, {overlay, commands}), overlay, commands, controllers};
}

const set = (id: string, temperature: number): Command => ({
  domain: 'climate',
  service: 'set_temperature',
  data: {entity_id: id, temperature},
  holds: [`${id}:sp`],
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ControlSender', () => {
  test('registers with its host, and waits a little over a second', () => {
    const {controllers, sender} = setup();
    expect(controllers).toEqual([sender]);
    expect(SETPOINT_WAIT_MS).toBe(1100);
  });

  test('now shows the value under every key the command holds and sends at once', () => {
    const {sender, overlay, commands} = setup();
    const command: Command = {...set('climate.den', 5), holds: ['climate.den:sp', 'climate.hall:sp']};
    sender.now(command, 5);
    expect(overlay.hold.mock.calls).toEqual([
      ['climate.den:sp', 5],
      ['climate.hall:sp', 5],
    ]);
    expect(commands.run).toHaveBeenCalledWith(command);
  });

  test('a command with nothing to hold is still sent', () => {
    const {sender, overlay, commands} = setup();
    sender.now({domain: 'climate', service: 'turn_off'}, 'off');
    sender.later({domain: 'climate', service: 'turn_on'}, 'on');
    vi.advanceTimersByTime(SETPOINT_WAIT_MS);
    expect(overlay.hold).not.toHaveBeenCalled();
    expect(commands.run).toHaveBeenCalledTimes(2);
  });

  test('show holds and sends nothing, however long it waits', () => {
    const {sender, overlay, commands} = setup();
    sender.show(set('climate.den', 20), 20);
    vi.advanceTimersByTime(SETPOINT_WAIT_MS * 3);
    expect(overlay.hold).toHaveBeenCalledWith('climate.den:sp', 20);
    expect(commands.run).not.toHaveBeenCalled();
  });

  test('five taps are one call, with the last value, 1,100 ms after the last of them', () => {
    const {sender, overlay, commands} = setup();
    for (const value of [21.5, 22, 22.5, 23, 23.5]) {
      sender.later(set('climate.den', value), value);
      vi.advanceTimersByTime(SETPOINT_WAIT_MS - 1);
    }
    expect(overlay.hold, 'every tap shows at once').toHaveBeenCalledTimes(5);
    expect(commands.run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commands.run).toHaveBeenCalledTimes(1);
    expect(commands.run).toHaveBeenCalledWith(set('climate.den', 23.5));
  });

  test('two thermostats wait on their own: a tap on one does not move the other’s call', () => {
    const {sender, commands} = setup();
    sender.later(set('climate.den', 20), 20);
    vi.advanceTimersByTime(600);
    sender.later(set('climate.hall', 19), 19);
    vi.advanceTimersByTime(500);
    expect(commands.run).toHaveBeenCalledTimes(1);
    expect(commands.run).toHaveBeenCalledWith(set('climate.den', 20));
    vi.advanceTimersByTime(600);
    expect(commands.run).toHaveBeenLastCalledWith(set('climate.hall', 19));
  });

  test('a call that was sent is not sent again by a later tap’s wait, and a host that leaves in between sends nothing', () => {
    const {sender, commands, overlay} = setup();
    sender.later(set('climate.den', 20), 20);
    vi.advanceTimersByTime(SETPOINT_WAIT_MS);
    expect(commands.run).toHaveBeenCalledTimes(1);
    // nothing is waiting any more: leaving releases nothing
    sender.hostDisconnected();
    expect(overlay.release).not.toHaveBeenCalled();
    sender.later(set('climate.den', 21), 21);
    sender.later(set('climate.hall', 22), 22);
    sender.hostDisconnected();
    vi.advanceTimersByTime(SETPOINT_WAIT_MS * 2);
    expect(commands.run, 'the waits stopped with the host').toHaveBeenCalledTimes(1);
    expect(overlay.release.mock.calls, 'the values nobody sent are let go').toEqual([
      ['climate.den:sp'],
      ['climate.hall:sp'],
    ]);
  });
});
