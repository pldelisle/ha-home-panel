// The id of the sheet the Car asks the shell for: the card asks for the detail, which is still the legacy panel's sheet until #252.
// Pattern: a named constant for the id of ADR 0021, so a sheet is asked for by a name the compiler checks; a legacy sheet is its element's id (`sh-car`), which the host opens as it did.
// Must not: hold anything but the id, or be imported by the shell for more than naming it. #252 makes it `car.detail`, the element sheet the pane answers.

/** The detail: the legacy panel's `sh-car`, inline in the pane on a tablet and a sheet over the screen on a phone. */
export const DETAIL_SHEET = 'sh-car';
