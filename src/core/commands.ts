// Call and Command: one service call, and a call with what a person is told and what is held while it runs, as plain data.
// Pattern: Command (Gamma et al.), the data half: the kit's runner is the invoker (`src/ui/commands.ts`), `PanelApi` the receiver. Moved down from the kit (ADR 0011, shared code moves down)
// so a provider can write its commands as data in the shape the runner takes, one definition and no copy to pin.
// Must not: hold logic, send a call, format a string (a message is a catalog key), or import outside the core.
import type {MessageKey} from './i18n/en.ts';
import type {MessageValues} from './i18n/messages.ts';

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
