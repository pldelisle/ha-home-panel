// runCommand: a service call that tells the person on success, and on failure undoes only what it held and says so.
import {describe, expect, test, vi} from 'vitest';
import type {PanelApi} from '../../../src/core/api.ts';
import {createMessages} from '../../../src/core/i18n/messages.ts';
import {runCommand, type Command} from '../../../src/ui/commands.ts';
import {ToastEvent} from '../../../src/ui/events.ts';
import {OverlayStore} from '../../../src/ui/overlay-store.ts';

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

/** What the host heard: the toasts the command dispatched, in order. */
function fakeHost() {
  const toasts: ToastEvent[] = [];
  const host = {
    dispatchEvent(event: Event) {
      toasts.push(event as ToastEvent);
      return true;
    },
  } as unknown as HTMLElement;
  return {host, details: () => toasts.map(e => e.detail)};
}

const turnOn: Command = {
  domain: 'media_player',
  service: 'turn_on',
  data: {entity_id: 'media_player.tv'},
  done: {key: 'media.tv'},
  holds: ['tv:on'],
};

describe('runCommand, on success', () => {
  test('sends the service call and toasts the done message, not sticky', async () => {
    const {api, runService} = fakeApi();
    const {host, details} = fakeHost();
    const store = new OverlayStore();
    store.hold('tv:on', true);

    await expect(runCommand(api, host, store, turnOn, t)).resolves.toBe(true);

    expect(runService).toHaveBeenCalledExactlyOnceWith('media_player', 'turn_on', {entity_id: 'media_player.tv'});
    expect(details()).toEqual([{message: 'TV', sticky: false}]);
    expect(store.read('tv:on', false)).toBe(true); // what it held stays until Home Assistant agrees
  });

  test('fills the done message with its values', async () => {
    const {api} = fakeApi();
    const {host, details} = fakeHost();
    const cmd: Command = {domain: 'scene', service: 'turn_on', done: {key: 'common.failed', values: {reason: 'x'}}};
    await runCommand(api, host, new OverlayStore(), cmd, t);
    expect(details()).toEqual([{message: "Didn't work: x", sticky: false}]);
  });

  test('says nothing for a silent command', async () => {
    const {api} = fakeApi();
    const {host, details} = fakeHost();
    await expect(
      runCommand(api, host, new OverlayStore(), {domain: 'media_player', service: 'volume_up'}, t),
    ).resolves.toBe(true);
    expect(details()).toEqual([]);
  });
});

describe('runCommand, on failure', () => {
  test('releases only its own holds, toasts a sticky failure with the reason, and answers false', async () => {
    const {api} = fakeApi(new Error('the TV is asleep'));
    const {host, details} = fakeHost();
    const store = new OverlayStore();
    store.hold('tv:on', true);
    store.hold('speaker:volume', 0.4); // another command's value, which a failure here must not touch

    await expect(runCommand(api, host, store, turnOn, t)).resolves.toBe(false);

    expect(store.read('tv:on', false)).toBe(false);
    expect(store.read('speaker:volume', 0)).toBe(0.4);
    expect(details()).toEqual([{message: "Didn't work: the TV is asleep", sticky: true}]);
  });

  test('reads the reason the way the legacy panel did: the message, else the code, else the value', async () => {
    const reasons = async (rejection: unknown) => {
      const {api} = fakeApi(rejection);
      const {host, details} = fakeHost();
      await runCommand(api, host, new OverlayStore(), {domain: 'd', service: 's'}, t);
      return details()[0].message;
    };
    expect(await reasons({code: 'not_found', message: 'No such entity'})).toBe("Didn't work: No such entity");
    expect(await reasons({code: 'not_found'})).toBe("Didn't work: not_found");
    expect(await reasons('offline')).toBe("Didn't work: offline");
  });

  test('releases nothing when the command held nothing, and still says so', async () => {
    const {api} = fakeApi(new Error('no'));
    const {host, details} = fakeHost();
    const store = new OverlayStore();
    store.hold('other', 1);
    await expect(runCommand(api, host, store, {domain: 'd', service: 's'}, t)).resolves.toBe(false);
    expect(store.read('other', 0)).toBe(1);
    expect(details()).toEqual([{message: "Didn't work: no", sticky: true}]);
  });
});

describe('runCommand, with a fallback', () => {
  const withWake: Command = {
    ...turnOn,
    fallback: {domain: 'button', service: 'press', data: {entity_id: 'button.wake'}},
  };

  test('runs the fallback once after a rejection, and its success is the command: the done toast, the holds kept', async () => {
    const {api, runService} = fakeApi(new Error('the TV is asleep'));
    const {host, details} = fakeHost();
    const store = new OverlayStore();
    store.hold('tv:on', true);

    await expect(runCommand(api, host, store, withWake, t)).resolves.toBe(true);

    expect(runService.mock.calls).toEqual([
      ['media_player', 'turn_on', {entity_id: 'media_player.tv'}],
      ['button', 'press', {entity_id: 'button.wake'}],
    ]);
    expect(details()).toEqual([{message: 'TV', sticky: false}]);
    expect(store.read('tv:on', false)).toBe(true);
  });

  test('does not run the fallback when the first call succeeds', async () => {
    const {api, runService} = fakeApi();
    const {host} = fakeHost();
    await runCommand(api, host, new OverlayStore(), withWake, t);
    expect(runService).toHaveBeenCalledTimes(1);
  });

  test('fails with the fallback reason, once, when the fallback rejects too, and releases the holds', async () => {
    const {api, runService} = fakeApi(new Error('the TV is asleep'), new Error('the button is gone'));
    const {host, details} = fakeHost();
    const store = new OverlayStore();
    store.hold('tv:on', true);

    await expect(runCommand(api, host, store, withWake, t)).resolves.toBe(false);

    expect(runService).toHaveBeenCalledTimes(2);
    expect(store.read('tv:on', false)).toBe(false);
    expect(details()).toEqual([{message: "Didn't work: the button is gone", sticky: true}]);
  });
});
