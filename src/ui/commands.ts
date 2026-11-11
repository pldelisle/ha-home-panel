// CommandRunner: sends one service call, tells the person on success, and on failure undoes what it held and says so.
// Pattern: Command (Gamma et al.): `Command` is the data, this is the invoker, `PanelApi` the receiver; compensating action
// (Richardson): releasing the keys the command set. The legacy `call` empties the whole bag; #263 deletes it, and its wording.
// A known copy: `Didn't work: {reason}` and `message || code || value` are the legacy `call`'s, until #263.
// Must not: read the store, format a string (the catalog does, through the `t` it is handed), or touch another command's state.
import {ContextConsumer} from '@lit/context';
import type {ReactiveControllerHost} from 'lit';
import type {PanelApi} from '../core/api.ts';
import type {MessageKey} from '../core/i18n/en.ts';
import type {Messages, MessageValues} from '../core/i18n/messages.ts';
import {apiContext} from './contexts.ts';
import type {OptimisticController} from './controllers/optimistic.ts';
import {ToastEvent} from './events.ts';

/** One service call: what Home Assistant is asked to run. */
export interface Call {
  domain: string;
  service: string;
  data?: Record<string, unknown>;
}

export interface Command extends Call {
  /** The toast on success, a catalog key with its values; none for a silent command (a volume step). */
  done?: {key: MessageKey; values?: MessageValues};
  /** The optimistic keys this command set: released on failure, and only they. */
  holds?: readonly string[];
  /** A second try when the first rejects (the TV's wake-on-LAN button); its success is the command's, and `done` is said. */
  fallback?: Call;
}

export interface CommandRunnerOptions {
  /** Where `holds` are released: the host's `OptimisticController`. */
  overlay: Pick<OptimisticController, 'release'>;
  /** The catalog's `t`, asked for at each run: the store arrives when the host connects, which is after the runner exists. */
  t: () => Messages['t'];
}

// Home Assistant rejects with `{code, message}`, not an Error; the legacy panel said the message, else the code, else the value
const reasonOf = (e: unknown): string => {
  const rejection = e as {message?: unknown; code?: unknown} | null;
  return String(rejection?.message || rejection?.code || e);
};

const send = (api: PanelApi, {domain, service, data}: Call) => api.runService(domain, service, data);

export class CommandRunner {
  private api: PanelApi | undefined;

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly options: CommandRunnerOptions,
  ) {
    // `subscribe: false`: a client never changes for a given tree, so one answer at connection is enough
    new ContextConsumer(host, {
      context: apiContext,
      subscribe: false,
      callback: api => {
        this.api = api;
      },
    });
  }

  /**
   * Runs `cmd`. True when it, or its fallback, was accepted; false after a failure, which has released the command's own
   * `holds` and dispatched a sticky toast with the reason.
   */
  run(cmd: Command): Promise<boolean> {
    if (!this.api) throw new Error('CommandRunner: the client arrives when the host connects.');
    return this.execute(this.api, cmd);
  }

  private async execute(api: PanelApi, cmd: Command): Promise<boolean> {
    const t = this.options.t();
    try {
      await send(api, cmd).catch(async (first: unknown) => {
        if (!cmd.fallback) throw first;
        await send(api, cmd.fallback);
      });
    } catch (e) {
      this.options.overlay.release(...(cmd.holds ?? []));
      this.host.dispatchEvent(new ToastEvent(t('common.failed', {reason: reasonOf(e)}), true));
      return false;
    }
    if (cmd.done) this.host.dispatchEvent(new ToastEvent(t(cmd.done.key, cmd.done.values)));
    return true;
  }
}
