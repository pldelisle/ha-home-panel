// The ids of the sheets Security asks the shell for, and the reader of what they are asked to show, for the cards, the pane and the descriptor.
// Pattern: named constants for the `<owner>.<name>` ids of ADR 0021, so a sheet is asked for by a name the compiler checks, and a
// reader that turns the sheet host's `unknown` detail back into the entity's id.
// Must not: hold anything but the ids and the reader, or be imported by the shell.

/** A camera's live view, over the screen on every tab: its request says which camera (`{id}`). */
export const CAMERA_SHEET = 'security.camera';
/** A sensor's history, over the screen on every tab: its request says which sensor (`{id}`). */
export const HISTORY_SHEET = 'security.history';

/** The id of the camera or sensor a sheet is asked to show, or undefined for any other detail: the descriptor binds it to the pane. */
export const entityIdOf = (detail: unknown): string | undefined => {
  const id = (detail as {id?: unknown} | null | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
};
