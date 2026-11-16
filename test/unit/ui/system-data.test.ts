// SystemDataController at the controller seam (ADR 0005): a fake API, a fake store and a fake host; no Lit element is mounted in Node.
import {describe, expect, test, vi} from 'vitest';
import type {PanelSystemData} from '../../../src/core/ha.ts';
import {SystemDataController} from '../../../src/ui/controllers/system-data.ts';

/** An API whose reads are held until a test answers them, and whose writes succeed unless `refuse` is set. */
function setup(initial: PanelSystemData | null = {light_order: ['office']}) {
  const reads: {resolve: (v: PanelSystemData | null) => void; reject: (e: unknown) => void}[] = [];
  const writes: [string, PanelSystemData][] = [];
  const state = {refuse: null as Error | null, generation: 1, deps: true};
  const api = {
    getSystemData: vi.fn(() => new Promise<PanelSystemData | null>((resolve, reject) => reads.push({resolve, reject}))),
    setSystemData: vi.fn((key: string, value: PanelSystemData) => {
      writes.push([key, value]);
      return state.refuse ? Promise.reject(state.refuse) : Promise.resolve();
    }),
  };
  const host = {
    active: false,
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
  const store = {
    get generation() {
      return state.generation;
    },
  };
  const controller = new SystemDataController(host, () => (state.deps ? {api, store} : null), 'home_panel');
  const answer = async (value: PanelSystemData | null = initial) => {
    reads.at(-1)!.resolve(value);
    await Promise.resolve();
  };
  return {controller, api, host, state, reads, writes, answer};
}

describe('SystemDataController', () => {
  test('registers with its host and reads once per generation, the same under every config', async () => {
    const {controller, api, host, state, answer} = setup();
    expect(host.addController).toHaveBeenCalledWith(controller);
    controller.hostConnected();
    controller.hostUpdate();
    expect(api.getSystemData).toHaveBeenCalledTimes(1);
    expect(api.getSystemData).toHaveBeenCalledWith('home_panel', {stale: false});
    await answer();
    expect(controller.value).toEqual({light_order: ['office']});
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    controller.hostUpdate();
    expect(api.getSystemData).toHaveBeenCalledTimes(1);
    state.generation = 2;
    controller.hostUpdate();
    expect(api.getSystemData).toHaveBeenCalledTimes(2);
    await answer(); // the same value tells the host nothing
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
  });

  test('reads again when its pane is shown, since another screen may have rearranged meanwhile', () => {
    const {controller, api, host} = setup();
    controller.hostConnected();
    host.active = true;
    controller.hostUpdate();
    controller.hostUpdate();
    expect(api.getSystemData).toHaveBeenCalledTimes(2);
    host.active = false;
    controller.hostUpdate();
    host.active = true;
    controller.hostUpdate();
    expect(api.getSystemData).toHaveBeenCalledTimes(3);
  });

  test('drops a reply that arrives after its host left, and a failed read leaves the value as it was', async () => {
    const {controller, reads, answer} = setup();
    controller.hostConnected();
    controller.hostDisconnected();
    await answer();
    expect(controller.value).toBeNull();
    controller.hostConnected(); // connected again under the same generation and hidden: no read
    expect(reads).toHaveLength(1);
  });

  test('a failed read is quiet', async () => {
    const {controller, reads, state} = setup();
    controller.hostConnected();
    reads[0].reject(new Error('no connection'));
    await Promise.resolve();
    expect(controller.value).toBeNull();
    state.deps = false;
    controller.hostUpdate(); // no store yet: nothing is asked
    expect(reads).toHaveLength(1);
  });

  test('set writes through: the value changes at once, the host is told, and a read in flight cannot undo it', async () => {
    const {controller, host, writes, answer} = setup();
    controller.hostConnected();
    await controller.set({light_links: [['a', 'b']]});
    expect(controller.value).toEqual({light_links: [['a', 'b']]});
    expect(writes).toEqual([['home_panel', {light_links: [['a', 'b']]}]]);
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    await answer({light_order: ['stale']});
    expect(controller.value).toEqual({light_links: [['a', 'b']]});
  });

  test('a refused write keeps the old value and rejects with the reason, for the caller to say', async () => {
    const {controller, state, answer} = setup();
    controller.hostConnected();
    await answer();
    state.refuse = new Error('Unauthorized');
    await expect(controller.set({light_order: null})).rejects.toEqual(state.refuse);
    expect(controller.value).toEqual({light_order: ['office']});
  });

  test('a refused write that a later write overtook leaves the later value; with no store yet nothing is written and the caller is told', async () => {
    const {controller, api, state} = setup(null);
    state.refuse = new Error('Unauthorized');
    const first = controller.set({light_order: ['a']});
    state.refuse = null;
    await controller.set({light_order: ['b']});
    await expect(first).rejects.toThrow('Unauthorized');
    expect(controller.value).toEqual({light_order: ['b']});
    state.deps = false;
    await expect(controller.set({light_order: ['c']})).rejects.toThrow('not connected');
    expect(controller.value).toEqual({light_order: ['b']});
    expect(api.setSystemData).toHaveBeenCalledTimes(2);
  });
});
