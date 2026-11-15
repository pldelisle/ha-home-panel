// The id of the sheet Air asks the shell for, for the card and the descriptor.
// Pattern: a named constant for the sheet's id (ADR 0021), so the sheet is asked for by a name the compiler checks.
// Temporary: the detail is still the legacy panel's `#sh-air`, which the sheet host opens by that id; #233 makes it an element's and gives it `air.detail`.
// Must not: hold anything but the id, or be imported by the shell.

/** The legacy detail panel's sheet: over the screen on a phone, inline in the pane on a tablet. Deleted with the detail's move (#233). */
export const DETAIL_SHEET = 'sh-air';
