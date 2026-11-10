// The ids of the sheets Weather asks the shell for, in one place for the pane, the detail and the registry.
// Pattern: named constants for the `<owner>.<name>` ids of ADR 0021, so a sheet is asked for by a name the compiler checks.
// Must not: hold anything but ids, or be imported by the shell for more than naming a sheet.

/** The detail: inline in the pane on a tablet, a sheet over the screen on a phone. */
export const DETAIL_SHEET = 'weather.detail';
/** A tile's history, over the screen on every tab: its request says which tile (`{key}`), and the pane draws it. */
export const HISTORY_SHEET = 'weather.history';
