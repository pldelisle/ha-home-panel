// The id of the Ask sheet: the one the header's button asks the shell for (`ask-toggle`) and the shell opens through the sheet host (ADR 0021).
// Pattern: a named constant for the `<owner>.<name>` id, so the shell names the sheet without loading the feature's code: it imports this file alone and the feature's index only when the button is first tapped.
// Must not: hold anything but the id, or import anything (it is in the entry chunk, the rest of the folder is not).

/** The Ask sheet, a sheet over the screen on every tab and every screen size. */
export const ASK_SHEET = 'ask.sheet';
