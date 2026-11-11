// A fake host for the kit's controllers: the part of an element they use, with the context protocol answered from a list.
import type {ReactiveController, ReactiveControllerHost} from 'lit';

/** What the context protocol's request event carries (@lit/context does not export the class at runtime). */
interface ContextRequest {
  type: string;
  context: unknown;
  callback: (value: unknown, unsubscribe: () => void) => void;
}

/**
 * A host that lists its controllers, counts its updates, keeps every event that is not a context request, and answers a
 * context request from `answers` (`[key, value]` pairs) when it connects, as the shell's provider would.
 */
export function fakeHost(answers: ReadonlyArray<readonly [unknown, unknown]> = []) {
  const controllers: ReactiveController[] = [];
  const host = {
    isConnected: false,
    updates: 0,
    /** the events the host dispatched, a toast for one, in order */
    events: [] as Event[],
    addController: (c: ReactiveController) => void controllers.push(c),
    requestUpdate() {
      host.updates++;
    },
    dispatchEvent(event: Event) {
      const request = event as unknown as ContextRequest;
      if (request.type !== 'context-request') host.events.push(event);
      else answers.filter(([key]) => key === request.context).forEach(([, value]) => request.callback(value, () => {}));
      return true;
    },
    connect() {
      host.isConnected = true;
      for (const c of controllers) c.hostConnected?.();
    },
    disconnect() {
      host.isConnected = false;
      for (const c of controllers) c.hostDisconnected?.();
    },
  };
  return host as typeof host & ReactiveControllerHost & HTMLElement;
}
