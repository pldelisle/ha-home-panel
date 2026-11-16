// The toast's schedule: which message shows and until when. A done toast goes after 3.5 seconds, a sticky one (a failure)
// stays until it is dismissed, and a new toast replaces the one showing, whatever it was.
// Pattern: a reducer over a clock passed in (Redux docs, Reducers; "functional core, imperative shell", G. Bernhardt):
// the shell owns the one timer and asks `expiry` when to send `expire`.
// Must not: read the clock, run a timer, word a message, or know who asked for the toast.

/** How long a done toast shows, as the legacy panel's `toast()` did. */
export const DONE_MS = 3500;

/** The toast showing: its message, already in the panel's language, whether it stays, and when it goes (`null`: when dismissed). */
export interface Toast {
  readonly message: string;
  readonly sticky: boolean;
  readonly until: number | null;
}

/** No toast showing is `null`. */
export type ToastState = Toast | null;

/** `show` is a `ToastEvent`'s detail; `dismiss` a tap on the toast or its Dismiss button; `expire` the shell's timer running out. */
export type ToastAction = {type: 'show'; message: string; sticky: boolean} | {type: 'dismiss'} | {type: 'expire'};

/** The toast after `action` at the instant `now` (milliseconds). An `expire` that comes early, or for a sticky toast, changes nothing. */
export function nextToast(state: ToastState, action: ToastAction, now: number): ToastState {
  switch (action.type) {
    case 'show':
      return {message: action.message, sticky: action.sticky, until: action.sticky ? null : now + DONE_MS};
    case 'dismiss':
      return null;
    case 'expire':
      return state?.until != null && now >= state.until ? null : state;
  }
}

/** When the shell's timer must send `expire`; `null` when nothing is due (no toast, or a sticky one). */
export function expiry(state: ToastState): number | null {
  return state?.until ?? null;
}
