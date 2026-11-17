// The live feature's sheet id: the Status popup the pill opens, which the shell's sheet host keeps open (ADR 0021).
// Pattern: a named constant, one spelling for the three places that say it (the pill, the activity card, the shell's template).
// Must not: hold state or import anything.

/** The Status checks popup: the pill's tap asks for it, Escape or a tap outside closes it. */
export const STATUS_SHEET = 'live.status';
