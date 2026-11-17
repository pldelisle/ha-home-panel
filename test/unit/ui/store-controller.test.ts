// StoreController's hold at the controller seam (ADR 0005): a fake host and a fake store; no Lit element is mounted in Node.
import {describe, expect, test} from 'vitest';
import type {HassChange, PanelStore} from '../../../src/core/store.ts';
import {StoreController} from '../../../src/ui/controllers/store-controller.ts';
import {fakeHost} from './support.ts';

/** A store with one listener at a time, which a test calls as a `hass` change would. */
function setup() {
  let listener: ((change: HassChange) => void) | undefined;
  const store = {
    generation: 1,
    subscribe: (_ids: unknown, fn: (change: HassChange) => void) => {
      listener = fn;
      return () => (listener = undefined);
    },
  } as unknown as PanelStore;
  const hold = {on: false};
  const host = fakeHost();
  const controller = new StoreController(host, {ids: () => ['light.office'], store, held: () => hold.on});
  host.connect();
  const change = () => listener?.({} as HassChange);
  return {controller, host, hold, change};
}

describe('StoreController, held', () => {
  test('a change while held draws nothing, and the release draws it once', () => {
    const {controller, host, hold, change} = setup();
    hold.on = true;
    change();
    change();
    expect(host.updates).toBe(0);
    hold.on = false;
    controller.release();
    expect(host.updates).toBe(1);
    controller.release();
    expect(host.updates).toBe(1);
  });

  test('a release with nothing missed draws nothing, and an unheld change draws at once', () => {
    const {controller, host, change} = setup();
    controller.release();
    expect(host.updates).toBe(0);
    change();
    expect(host.updates).toBe(1);
  });
});
