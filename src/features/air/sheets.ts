// The id of the sheet Air asks the shell for: the card asks for it, the registry's descriptor and the pane answer to it.
// Pattern: a named constant for the `<owner>.<name>` id of ADR 0021, so the sheet is asked for by a name the compiler checks.
// Must not: hold anything but the id, or be imported by the shell.

/** The detail: inline in the pane on a tablet, a sheet over the screen on a phone. */
export const DETAIL_SHEET = 'air.detail';
