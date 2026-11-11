// runCommand: sends one service call, tells the person on success, and on failure undoes what it held and says so.
// Pattern: Command (Gamma et al., Design Patterns) with a compensating action (Richardson, Microservices Patterns): the
// compensation is releasing the optimistic keys this command set. The legacy `call` does this too, but empties the whole bag.
// A known copy: `Didn't work: {reason}` and `message || code || value` are the legacy `call`'s; #263 deletes that one.
// Must not: read the store, format a string (the catalog does), or touch another command's state or keys.
import type {PanelApi} from '../core/api.ts';
import type {MessageKey} from '../core/i18n/en.ts';
import type {Messages, MessageValues} from '../core/i18n/messages.ts';
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

// Home Assistant rejects with `{code, message}`, not an Error; the legacy panel said the message, else the code, else the value
const reasonOf = (e: unknown): string => {
  const rejection = e as {message?: unknown; code?: unknown} | null;
  return String(rejection?.message || rejection?.code || e);
};

const send = (api: PanelApi, {domain, service, data}: Call) => api.runService(domain, service, data);

/**
 * Runs `cmd`. True when it, or its fallback, was accepted; false after a failure, which has released the command's own
 * `holds` from `overlay` and dispatched a sticky toast with the reason.
 */
export async function runCommand(
  api: PanelApi,
  host: HTMLElement,
  overlay: Pick<OptimisticController, 'release'>,
  cmd: Command,
  t: Messages['t'],
): Promise<boolean> {
  try {
    await send(api, cmd).catch(async (first: unknown) => {
      if (!cmd.fallback) throw first;
      await send(api, cmd.fallback);
    });
  } catch (e) {
    overlay.release(...(cmd.holds ?? []));
    host.dispatchEvent(new ToastEvent(t('common.failed', {reason: reasonOf(e)}), true));
    return false;
  }
  if (cmd.done) host.dispatchEvent(new ToastEvent(t(cmd.done.key, cmd.done.values)));
  return true;
}
