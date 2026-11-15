// The ids of the sheets Security asks the shell for, and the reader of what they are asked to show, for the cards and the shell.
// Pattern: named constants for the `<owner>.<name>` ids of ADR 0021, so a sheet is asked for by a name the compiler checks, and a
// reader that turns the sheet host's `unknown` detail back into the entity's id.
// Must not: hold anything but the ids and the reader, or be imported by the shell for more than naming a sheet and reading its detail.

/** A camera's live view, over the screen on every tab: its request says which camera (`{id}`). The guest's sheet until #225. */
export const CAMERA_SHEET = 'security.camera';
/** A sensor's history, over the screen on every tab: its request says which sensor (`{id}`). The guest's sheet until #225. */
export const HISTORY_SHEET = 'security.history';

/** The id of the camera or sensor a sheet is asked to show, or undefined for any other detail. */
export const entityIdOf = (detail: unknown): string | undefined => {
  const id = (detail as {id?: unknown} | null | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
};
