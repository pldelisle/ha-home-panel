// CommandRunner: sends one service call (or a list, in order), tells the person on success, and on failure undoes what it held and says so.
// Pattern: Command (Gamma et al.): `Command` is the data (`src/core/commands.ts`), this is the invoker, `PanelApi` the receiver; compensating action
// (Richardson): releasing the keys the command set. The legacy `call`, which emptied the whole bag, is gone (#262).
// `Didn't work: {reason}` is its wording, kept; the reason is read by the API client's `rejectionReason`.
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
/** One command: its call, else its fallback when there is one. */
const attempt = (api: PanelApi, cmd: Command) =>
  send(api, cmd).catch(async (first: unknown) => {
    if (!cmd.fallback) throw first;
    await send(api, cmd.fallback);
  });

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
    return this.runAll([cmd]);
  }

  /** Shows `value` under each of the command's `holds`, then runs it: a tap that is sent at once and shows what it asked for until Home Assistant agrees. */
  runHolding(cmd: Command, value: unknown): Promise<boolean> {
    for (const key of cmd.holds ?? []) this.options.overlay.hold(key, value);
    return this.run(cmd);
  }

  /**
   * Runs `cmds` in order, each (or its fallback) after the last was accepted (one intent that takes several calls: Lights' leave-Auto rule,
   * then the level). True when all were; after a failure the rest are not sent, the holds of the whole list are released and one sticky toast
   * says why. On success the last `done` of the list is said, once. An empty list is accepted and says nothing.
   */
  runAll(cmds: readonly Command[]): Promise<boolean> {
    if (!this.api) throw new Error('CommandRunner: the client arrives when the host connects.');
    return this.execute(this.api, cmds);
  }

  /** The one failure path of `run` and `runAll`. */
  private async execute(api: PanelApi, cmds: readonly Command[]): Promise<boolean> {
    const t = this.options.t();
    try {
      for (const cmd of cmds) await attempt(api, cmd);
    } catch (e) {
      this.options.overlay.release(...cmds.flatMap(cmd => cmd.holds ?? []));
      this.host.dispatchEvent(new ToastEvent(t('common.failed', {reason: rejectionReason(e)}), true));
      return false;
    }
    const done = [...cmds].reverse().find(cmd => cmd.done)?.done;
    if (done) this.host.dispatchEvent(new ToastEvent(t(done.key, done.values)));
    return true;
  }
}
