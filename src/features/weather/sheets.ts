// The ids of the sheets Weather asks the shell for, in one place for the pane, the detail and the registry.
// Pattern: named constants for the `<owner>.<name>` ids of ADR 0021, so a sheet is asked for by a name the compiler checks.
// Must not: hold anything but ids, or be imported by the shell for more than naming a sheet.

/** The detail: inline in the pane on a tablet, a sheet over the screen on a phone. */
export const DETAIL_SHEET = 'weather.detail';
/** A tile's history; the shell opens the legacy sheet for it until the history is an element (#159). */
export const HISTORY_SHEET = 'weather.history';
