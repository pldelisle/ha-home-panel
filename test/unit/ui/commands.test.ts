// CommandRunner: a service call that tells the person on success, and on failure undoes only what it held and says so.
import {describe, expect, test, vi} from 'vitest';
import type {PanelApi} from '../../../src/core/api.ts';
import type {Command} from '../../../src/core/commands.ts';
import {createMessages} from '../../../src/core/i18n/messages.ts';
import {CommandRunner} from '../../../src/ui/commands.ts';
import {apiContext} from '../../../src/ui/contexts.ts';
import type {ToastEvent} from '../../../src/ui/events.ts';
import {OverlayStore} from '../../../src/ui/overlay-store.ts';
import {fakeHost} from './support.ts';

const {t} = createMessages({language: 'en', tag: 'en-CA'});

/** An API whose `runService` answers from a list: each call takes the next answer, which rejects (undefined resolves). */
function fakeApi(...answers: unknown[]) {
  const runService = vi.fn<PanelApi['runService']>(() => {
    const answer = answers.shift();
    // Home Assistant's socket rejects with a plain `{code, message}`, so the answer is rejected as it is
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    return answer === undefined ? Promise.resolve() : Promise.reject(answer);
  });
  return {api: {runService} as unknown as PanelApi, runService};
}

/** A connected host with a runner, whose API answers each call from `answers`, and a store the runner releases from. */
function setup(...answers: unknown[]) {
  const {api, runService} = fakeApi(...answers);
  const store = new OverlayStore();
  const host = fakeHost([[apiContext, api]]);
  const runner = new CommandRunner(host, {overlay: store, t: () => t});
  host.connect();
  return {runner, runService, store, host, toasts: () => host.events.map(e => (e as ToastEvent).detail)};
}

const turnOn: Command = {
  domain: 'media_player',
  service: 'turn_on',
  data: {entity_id: 'media_player.tv'},
  done: {key: 'media.tv'},
  holds: ['tv:on'],
};

describe('CommandRunner, on success', () => {
  test('sends the service call and toasts the done message, not sticky', async () => {
    const {runner, runService, store, toasts} = setup();
    store.hold('tv:on', true);

    await expect(runner.run(turnOn)).resolves.toBe(true);

    expect(runService).toHaveBeenCalledExactlyOnceWith('media_player', 'turn_on', {entity_id: 'media_player.tv'});
    expect(toasts()).toEqual([{message: 'TV', sticky: false}]);
    expect(store.read('tv:on', false)).toBe(true); // what it held stays until Home Assistant agrees
  });

  test('fills the done message with its values', async () => {
    const {runner, toasts} = setup();
    await runner.run({domain: 'scene', service: 'turn_on', done: {key: 'common.failed', values: {reason: 'x'}}});
    expect(toasts()).toEqual([{message: "Didn't work: x", sticky: false}]);
  });

  test('says nothing for a silent command', async () => {
    const {runner, toasts} = setup();
    await expect(runner.run({domain: 'media_player', service: 'volume_up'})).resolves.toBe(true);
    expect(toasts()).toEqual([]);
  });
});

describe('CommandRunner, on failure', () => {
  test('releases only its own holds, toasts a sticky failure with the reason, and answers false', async () => {
    const {runner, store, toasts} = setup(new Error('the TV is asleep'));
    store.hold('tv:on', true);
    store.hold('speaker:volume', 0.4); // another command's value, which a failure here must not touch

    await expect(runner.run(turnOn)).resolves.toBe(false);

    expect(store.read('tv:on', false)).toBe(false);
    expect(store.read('speaker:volume', 0)).toBe(0.4);
    expect(toasts()).toEqual([{message: "Didn't work: the TV is asleep", sticky: true}]);
  });

  test('reads the reason the way the legacy panel did: the message, else the code, else the value', async () => {
    const reasons = async (rejection: unknown) => {
      const {runner, toasts} = setup(rejection);
      await runner.run({domain: 'd', service: 's'});
      return toasts()[0].message;
    };
    expect(await reasons({code: 'not_found', message: 'No such entity'})).toBe("Didn't work: No such entity");
    expect(await reasons({code: 'not_found'})).toBe("Didn't work: not_found");
    expect(await reasons('offline')).toBe("Didn't work: offline");
  });

  test('releases nothing when the command held nothing, and still says so', async () => {
    const {runner, store, toasts} = setup(new Error('no'));
    store.hold('other', 1);
    await expect(runner.run({domain: 'd', service: 's'})).resolves.toBe(false);
    expect(store.read('other', 0)).toBe(1);
    expect(toasts()).toEqual([{message: "Didn't work: no", sticky: true}]);
  });
});

describe('CommandRunner, runHolding', () => {
  test('holds the value under every key the command holds, then sends it', async () => {
    const {runner, runService, store} = setup();
    await expect(runner.runHolding({...turnOn, holds: ['tv:on', 'tv:power']}, true)).resolves.toBe(true);
    expect(store.read('tv:on', false)).toBe(true);
    expect(store.read('tv:power', false)).toBe(true);
    expect(runService).toHaveBeenCalledTimes(1);
  });

  test('a failure releases what it held, as run does', async () => {
    const {runner, store} = setup(new Error('no'));
    await expect(runner.runHolding(turnOn, true)).resolves.toBe(false);
    expect(store.read('tv:on', false)).toBe(false);
  });

  test('a command that holds nothing is just sent', async () => {
    const {runner, runService} = setup();
    await expect(runner.runHolding({domain: 'd', service: 's'}, 1)).resolves.toBe(true);
    expect(runService).toHaveBeenCalledTimes(1);
  });
});

describe('CommandRunner, with a fallback', () => {
  const withWake: Command = {
    ...turnOn,
    fallback: {domain: 'button', service: 'press', data: {entity_id: 'button.wake'}},
  };

  test('runs the fallback once after a rejection, and its success is the command: the done toast, the holds kept', async () => {
    const {runner, runService, store, toasts} = setup(new Error('the TV is asleep'));
    store.hold('tv:on', true);

    await expect(runner.run(withWake)).resolves.toBe(true);

    expect(runService.mock.calls).toEqual([
      ['media_player', 'turn_on', {entity_id: 'media_player.tv'}],
      ['button', 'press', {entity_id: 'button.wake'}],
    ]);
    expect(toasts()).toEqual([{message: 'TV', sticky: false}]);
    expect(store.read('tv:on', false)).toBe(true);
  });

  test('does not run the fallback when the first call succeeds', async () => {
    const {runner, runService} = setup();
    await runner.run(withWake);
    expect(runService).toHaveBeenCalledTimes(1);
  });

  test('fails with the fallback reason, once, when the fallback rejects too, releasing only the holds', async () => {
    const {runner, runService, store, toasts} = setup(new Error('the TV is asleep'), new Error('the button is gone'));
    store.hold('tv:on', true);
    store.hold('speaker:volume', 0.4); // not in `holds`: it must survive

    await expect(runner.run(withWake)).resolves.toBe(false);

    expect(runService).toHaveBeenCalledTimes(2);
    expect(store.read('tv:on', false)).toBe(false);
    expect(store.read('speaker:volume', 0)).toBe(0.4);
    expect(toasts()).toEqual([{message: "Didn't work: the button is gone", sticky: true}]);
  });
});

describe('CommandRunner, before its host connects', () => {
  test('has no client yet, and says so', () => {
    const host = fakeHost([[apiContext, fakeApi().api]]);
    const runner = new CommandRunner(host, {overlay: new OverlayStore(), t: () => t});
    expect(() => runner.run(turnOn)).toThrow('CommandRunner: the client arrives when the host connects.');
  });
});

describe('CommandRunner.runAll', () => {
  const step = (n: number, extra: Partial<Command> = {}): Command => ({
    domain: 'light',
    service: 'turn_on',
    data: {entity_id: `light.${n}`},
    ...extra,
  });

  test('runs the list in order, each after the last, and says the last done once', async () => {
    const {runner, runService, toasts} = setup();
    const list = [
      step(1, {done: {key: 'media.tv'}}),
      step(2),
      step(3, {done: {key: 'common.failed', values: {reason: 'x'}}}),
      step(4),
    ];
    expect(await runner.runAll(list)).toBe(true);
    expect(runService.mock.calls.map(c => c[2])).toEqual([1, 2, 3, 4].map(n => ({entity_id: `light.${n}`})));
    expect(toasts()).toEqual([{message: "Didn't work: x", sticky: false}]);
  });

  test('sends a call only once the one before it was accepted, and takes a fallback', async () => {
    const {runner, runService} = setup();
    let accept!: () => void;
    runService.mockImplementationOnce(() => new Promise<void>(resolve => (accept = resolve)));
    runService.mockRejectedValueOnce({message: 'No service'});
    const running = runner.runAll([step(1), step(2, {fallback: {domain: 'light', service: 'toggle', data: {}}})]);
    await Promise.resolve();
    expect(runService).toHaveBeenCalledTimes(1);
    accept();
    expect(await running).toBe(true);
    expect(runService.mock.calls.map(c => `${c[0]}.${c[1]}`)).toEqual([
      'light.turn_on',
      'light.turn_on',
      'light.toggle',
    ]);
  });

  test('stops at a failure, releases the holds of the whole list and says why, sticky', async () => {
    const {runner, runService, store, toasts} = setup(undefined, {message: 'Unavailable'});
    store.hold('a', 1);
    store.hold('c', 1);
    store.hold('other', 1);
    const ok = await runner.runAll([
      step(1, {holds: ['a']}),
      step(2, {done: {key: 'media.tv'}}),
      step(3, {holds: ['c']}),
    ]);
    expect(ok).toBe(false);
    expect(runService).toHaveBeenCalledTimes(2);
    expect(store.read('a', 0)).toBe(0);
    expect(store.read('c', 0)).toBe(0);
    expect(store.read('other', 0)).toBe(1);
    expect(toasts()).toEqual([{message: "Didn't work: Unavailable", sticky: true}]);
  });

  test('an empty list is accepted and says nothing; before the host connects there is no client', async () => {
    const {runner, toasts} = setup();
    expect(await runner.runAll([])).toBe(true);
    expect(toasts()).toEqual([]);
    const lone = new CommandRunner(fakeHost([]), {overlay: new OverlayStore(), t: () => t});
    expect(() => lone.runAll([])).toThrow('the client arrives');
  });
});
