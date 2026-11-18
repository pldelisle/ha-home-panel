// The ids of the shell's own sheet and popup: the phone's More sheet, which the host opens by id, and the settings popup, which the
// host only registers (a popup has no id, so the id is the name the accessibility spec and its coverage test scan it by).
// Pattern: a named constant for the `<owner>.<name>` id of ADR 0021, as each feature's `sheets.ts` does for its own, so a sheet is
// asked for by a name the compiler checks and a test can import the list instead of parsing the shell's text.
// Must not: hold anything but ids, or import anything.

/** The phone's More sheet, the first element sheet of the host. */
export const MORE_SHEET = 'shell.more';

/** The settings popup behind the gear: Escape or a tap outside closes it. */
export const SETTINGS_POPUP = 'shell.settings';

/** The popups the shell keeps open itself (the Status checks' id is the live feature's, `STATUS_SHEET`). */
export const SHELL_POPUPS: readonly string[] = [SETTINGS_POPUP];
