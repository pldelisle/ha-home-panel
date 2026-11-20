// AskWatch: the shell redraws for the AI Task entity only when it appears or goes (the Ask button needs nothing else), and not at each state change: every question changes the entity's state.
import {describe, expect, test, vi} from 'vitest';
import {AskWatch} from '../../../src/shell/ask-watch.ts';

type Change = {ids: ReadonlySet<string>; registries: boolean; locale: boolean; user: boolean};

function setup(entity: string | null, present: boolean) {
  const state = {entity, present, generation: 0};
  const listeners = new Map<string, (change: Change) => void>();
  const unsubscribed: string[][] = [];
  const store = {
    get config() {
      return {ask: state.entity ? {entity: state.entity, exclude: []} : null};
    },
    get generation() {
      return state.generation;
    },
    state: () => (state.present ? {state: 'unknown'} : undefined),
    subscribe: (ids: readonly string[] | '*', cb: (change: Change) => void) => {
      const key = String(ids);
      listeners.set(key, cb);
      return () => {
        listeners.delete(key);
        unsubscribed.push([...ids]);
      };
    },
  };
  const host = {addController: vi.fn(), requestUpdate: vi.fn()};
  const watch = new AskWatch(host as never, store as never);
  const fire = (id: string) => listeners.get(id)?.({ids: new Set([id]), registries: false, locale: false, user: false});
  return {watch, host, state, listeners, unsubscribed, fire};
}

describe('AskWatch', () => {
  test('watches nothing without an ask block', () => {
    const {watch, listeners} = setup(null, false);
    watch.hostConnected();
    watch.hostUpdate();
    expect(listeners.size).toBe(0);
  });

  test('redraws the host when the entity appears, and when it goes', () => {
    const {watch, host, state, fire} = setup('ai_task.local_model', false);
    watch.hostConnected();
    state.present = true;
    fire('ai_task.local_model');
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    state.present = false;
    fire('ai_task.local_model');
    expect(host.requestUpdate).toHaveBeenCalledTimes(2);
  });

  test('does not redraw for the state changes a question makes while the entity is there', () => {
    const {watch, host, fire} = setup('ai_task.local_model', true);
    watch.hostConnected();
    for (let i = 0; i < 5; i++) fire('ai_task.local_model');
    expect(host.requestUpdate).not.toHaveBeenCalled();
  });

  test('listens to the new entity when the config names another, and lets the old one go', () => {
    const {watch, state, listeners, unsubscribed} = setup('ai_task.one', true);
    watch.hostConnected();
    state.entity = 'ai_task.two';
    state.generation++;
    watch.hostUpdate();
    expect([...listeners.keys()]).toEqual(['ai_task.two']);
    expect(unsubscribed).toEqual([['ai_task.one']]);
    watch.hostUpdate(); // nothing changed: it stays subscribed
    expect(unsubscribed).toHaveLength(1);
  });

  test('stops listening when the host leaves', () => {
    const {watch, listeners} = setup('ai_task.one', true);
    watch.hostConnected();
    watch.hostDisconnected();
    expect(listeners.size).toBe(0);
  });
});
