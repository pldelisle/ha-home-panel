// The id of the room's sheet Lights asks the shell for, and the reader of what it is asked to show, for the tiles, the sheet, the pane and the descriptor.
// Pattern: a named constant for the `<owner>.<name>` id of ADR 0021, so the sheet is asked for by a name the compiler checks, and a reader
// that turns the sheet host's `unknown` detail back into the room's key.
// Must not: hold anything but the id and the reader, or be imported by the shell.

/** A room's sheet, over the Lights tab: its request says which room (`{key}`). */
export const ROOM_SHEET = 'lights.room';

/** The key of the room the sheet is asked to show, or undefined for any other detail: the descriptor binds it to the pane. */
export const roomKeyOf = (detail: unknown): string | undefined => {
  const key = (detail as {key?: unknown} | null | undefined)?.key;
  return typeof key === 'string' ? key : undefined;
};
