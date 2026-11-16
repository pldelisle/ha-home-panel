// The keys of a radio group: which option an arrow, Home or End moves to, and which option holds the group's one tab stop.
// Pattern: a pure function beside its element (ADR 0005), after the WAI-ARIA Authoring Practices' radio group: Left and Up go back, Right and Down forward, both
// wrapping, Home and End to the ends, and a disabled option is passed over. Must not: read an element, an event or the DOM's focus (the element does).

/** What a group needs of an option here: whether it can be chosen. */
export interface Choosable {
  disabled?: boolean;
}

const BACK = new Set(['ArrowLeft', 'ArrowUp']);
const FORWARD = new Set(['ArrowRight', 'ArrowDown']);

/** The index of the option `key` moves to from `from`, passing over disabled ones; null for a key the group does not handle, or when no option can be chosen. */
export function moveTo(options: readonly Choosable[], from: number, key: string): number | null {
  const enabled = (index: number) => options[index] !== undefined && !options[index].disabled;
  const count = options.length;
  if (key === 'Home' || key === 'End') {
    const order = Array.from({length: count}, (_, index) => (key === 'Home' ? index : count - 1 - index));
    return order.find(enabled) ?? null;
  }
  const step = BACK.has(key) ? -1 : FORWARD.has(key) ? 1 : 0;
  if (step === 0) return null;
  for (let tried = 1; tried <= count; tried++) {
    const index = (((from + step * tried) % count) + count) % count;
    if (enabled(index)) return index;
  }
  return null;
}

/** The option that holds the tab stop: the chosen one, else the first that can be chosen; null when none can. */
export function tabStop(options: readonly (Choosable & {checked: boolean})[]): number | null {
  const chosen = options.findIndex(option => option.checked && !option.disabled);
  if (chosen >= 0) return chosen;
  const first = options.findIndex(option => !option.disabled);
  return first >= 0 ? first : null;
}
