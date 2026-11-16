// The id of the sheet the Car asks the shell for: the card and Home's tile and live pill ask for the detail, which the pane answers.
// Pattern: a named constant for the `<owner>.<name>` id of ADR 0021, so a sheet is asked for by a name the compiler checks.
// Must not: hold anything but the id, or be imported by the shell for more than naming it.

/** The detail: inline in the pane on a tablet, a sheet over the screen on a phone. */
export const DETAIL_SHEET = 'car.detail';
