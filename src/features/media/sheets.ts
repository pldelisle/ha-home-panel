// The id of the sheet a phone's Media tile asks the shell for, and the reader of what it asks to show, for the tile, the pane and the registry.
// Pattern: a named constant for the `<owner>.<name>` id of ADR 0021, so the sheet is asked for by a name the compiler checks, and
// a reader that turns the sheet host's `unknown` detail back into a tile's key.
// Must not: hold anything but the id and its reader, or be imported by the shell for more than naming the sheet.

/** A tile's controls, over the screen on a phone: its request says which tile (`{key}`), and the pane draws the card it opens. */
export const CONTROLS_SHEET = 'media.controls';

/** The key of the tile whose controls the sheet shows (`tv`, or a speaker's id), or undefined for any other detail. */
export const controlsKeyOf = (detail: unknown): string | undefined => {
  const key = (detail as {key?: unknown} | null | undefined)?.key;
  return typeof key === 'string' ? key : undefined;
};
