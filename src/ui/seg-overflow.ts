// Which of a group's options Material draws as buttons and which sit behind its "More" button.
// Pattern: a pure function beside its element (ADR 0005), after Material's ButtonGroup overflow: a connected group holds at most five buttons, so a longer list shows its
// first four and a fifth, the overflow button, that opens a menu with the rest (ADR 0037). Must not: read an element, the design or the DOM (the element does), or reorder options.

/** The most buttons a Material connected group draws, the overflow button among them. */
export const GROUP_MAX = 5;

/** What a group draws: `shown` as buttons in the group, `more` in the overflow menu (empty when every option fits). */
export interface Split<T> {
  shown: readonly T[];
  more: readonly T[];
}

/** `options` as the group draws them: all of them up to `max`, else the first `max - 1` and the rest behind the overflow button. */
export function splitGroup<T>(options: readonly T[], max = GROUP_MAX): Split<T> {
  if (options.length <= max) return {shown: options, more: []};
  return {shown: options.slice(0, max - 1), more: options.slice(max - 1)};
}
