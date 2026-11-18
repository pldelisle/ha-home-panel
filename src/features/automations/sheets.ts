// The id of the sheet the Automations pane asks the shell for: an automation's flow and last run, which a phone's list row opens.
// Pattern: a named constant for the `<owner>.<name>` id of ADR 0021, so a sheet is asked for by a name the compiler checks.
// Must not: hold anything but the id, or be imported by the shell for more than naming it.

/** An automation's flow and last run, over the screen on a phone; a tablet draws the card inline above the list. */
export const FLOW_SHEET = 'automations.flow';
