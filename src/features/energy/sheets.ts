// The ids of the sheets Energy asks the shell for: the card asks for the detail, the phone's two tiles for the cards, and the registry and the pane answer to them.
// Pattern: a named constant for the `<owner>.<name>` id of ADR 0021, so a sheet is asked for by a name the compiler checks.
// Temporary: the detail is still the legacy panel's `#sh-energy`, which the sheet host opens by that id; #240 makes it an element's and gives it `energy.detail`.
// Must not: hold anything but the ids, or be imported by the shell for more than naming them.

/** The legacy detail panel's sheet: over the screen on a phone, inline in the pane on a tablet. Deleted with the detail's move (#240). */
export const DETAIL_SHEET = 'sh-energy';

/** The water heater's card in a sheet, on a phone: its tile asks for it, and so does Home's Water heater tile. */
export const WATER_SHEET = 'energy.water';

/** Hilo's card in a sheet, on a phone. */
export const HILO_SHEET = 'energy.hilo';
