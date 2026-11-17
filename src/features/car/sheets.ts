// The ids of the sheets the Car asks the shell for: Home's tile and the live pill ask for the detail, the history row for the history; the pane answers both.
// Pattern: a named constant for the `<owner>.<name>` id of ADR 0021, so a sheet is asked for by a name the compiler checks.
// Must not: hold anything but the ids, or be imported by the shell for more than naming it.

/** The detail: inline in the pane on a tablet, a sheet over the screen on a phone. */
export const DETAIL_SHEET = 'car.detail';

/** The charging history: the 30 days' bars, the sessions and the last plug-in, over the screen on a tablet and a phone alike. */
export const HISTORY_SHEET = 'car.history';
