// The live feature's popup id: the Status checks the pill opens, asked for with the sheet events (ADR 0021) and kept open by the shell as a popup, as the settings are.
// Pattern: a named constant, one spelling for the three places that say it (the pill, the activity card, the shell's template).
// Must not: hold state or import anything.

/** The Status checks popup: the pill's tap asks for it, Escape or a tap outside closes it. */
export const STATUS_SHEET = 'live.status';
