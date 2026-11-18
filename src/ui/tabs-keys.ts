// The keys of the section tabs: which tab an arrow, Home or End moves focus to, and which tab holds the list's one tab stop.
// Pattern: a pure function beside its element (ADR 0005), after the WAI-ARIA Authoring Practices' tabs with manual activation: Up and Down always move, Left and Right
// only where the list lies horizontally (the phone's bar), both wrap, Home and End go to the ends, and a tab that is not on screen is passed over. The moving itself is
// seg-keys.ts's (a radio group moves the same way); this adds the orientation. Must not: read an element, an event or the DOM's focus, and must not choose a tab: focus
// moves, and Enter or Space (the button's own click) is what selects, since a tab change mounts a pane.
import {moveTo, tabStop, type Choosable} from './seg-keys.ts';

/** A section tab as the keys see it: `disabled` when it is not on screen (hidden by the house, or not in the phone's bar), `checked` when it is the one chosen. */
export type RovingTab = Choosable & {checked: boolean};

const SIDEWAYS = new Set(['ArrowLeft', 'ArrowRight']);

/** The index of the tab `key` moves focus to from `from`; null for a key the list does not handle (Left and Right in a vertical list included), or when no tab is on screen. */
export function focusTo(
  tabs: readonly Choosable[],
  from: number,
  key: string,
  orientation: 'vertical' | 'horizontal',
): number | null {
  if (orientation === 'vertical' && SIDEWAYS.has(key)) return null;
  return moveTo(tabs, from, key);
}

/** The tab that holds the list's one tab stop (roving tabindex): the chosen one, else the first on screen; null when none is. */
export function stopAt(tabs: readonly RovingTab[]): number | null {
  return tabStop(tabs);
}
