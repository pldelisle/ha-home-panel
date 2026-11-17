// The ids of the sheets Air asks the shell for: the card and a tile ask for them, the registry's descriptor and the pane answer to them.
// Pattern: named constants for the `<owner>.<name>` ids of ADR 0021, so a sheet is asked for by a name the compiler checks.
// Must not: hold anything but ids, or be imported by the shell.

/** The detail: inline in the pane on a tablet, a sheet over the screen on a phone. */
export const DETAIL_SHEET = 'air.detail';
/** A reading's history, over the screen on every tab: its request says which reading of which room (`{metric, room}`), and the pane draws it. */
export const HISTORY_SHEET = 'air.history';
