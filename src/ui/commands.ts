// CommandRunner: sends one service call, tells the person on success, and on failure undoes what it held and says so.
// Pattern: Command (Gamma et al.): `Command` is the data (`src/core/commands.ts`), this is the invoker, `PanelApi` the receiver; compensating action
// (Richardson): releasing the keys the command set. The legacy `call` empties the whole bag; #263 deletes it, and its wording.
// A known copy: `Didn't work: {reason}` is the legacy `call`'s wording, until #263; the reason is read by the API client's `rejectionReason`.
// Must not: read the store, format a string (the catalog does, through the `t` it is handed), or touch another command's state.
import {ContextConsumer} from '@lit/context';
import type {ReactiveControllerHost} from 'lit';
import {rejectionReason, type PanelApi} from '../core/api.ts';
import type {Call, Command} from '../core/commands.ts';
import type {Messages} from '../core/i18n/messages.ts';
import {apiContext} from './contexts.ts';
import type {OptimisticController} from './controllers/optimistic.ts';
import {ToastEvent} from './events.ts';

export interface CommandRunnerOptions {
  /** Where `holds` are held and released: the host's `OptimisticController`. */
  overlay: Pick<OptimisticController, 'hold' | 'release'>;
  /** The catalog's `t`, asked for at each run: the store arrives when the host connects, which is after the runner exists. */
  t: () => Messages['t'];
}

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

  /** Shows `value` under each of the command's `holds`, then runs it: a tap that is sent at once and shows what it asked for until Home Assistant agrees. */
  runHolding(cmd: Command, value: unknown): Promise<boolean> {
    for (const key of cmd.holds ?? []) this.options.overlay.hold(key, value);
    return this.run(cmd);
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
      this.host.dispatchEvent(new ToastEvent(t('common.failed', {reason: rejectionReason(e)}), true));
      return false;
    }
    if (cmd.done) this.host.dispatchEvent(new ToastEvent(t(cmd.done.key, cmd.done.values)));
    return true;
  }
}
