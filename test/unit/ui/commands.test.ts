// CommandRunner: a service call that tells the person on success, and on failure undoes only what it held and says so.
import {describe, expect, test, vi} from 'vitest';
import type {PanelApi} from '../../../src/core/api.ts';
import {createMessages} from '../../../src/core/i18n/messages.ts';
import {CommandRunner, type Command} from '../../../src/ui/commands.ts';
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
