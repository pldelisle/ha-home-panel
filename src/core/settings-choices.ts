// What a tap on a Control Center module asks of the settings: the next appearance, the text size a step names, and what an Auto switch writes.
// Pattern: functional core (Bernhardt, Boundaries): the popup reads the settings and the theme in force, these decide; macOS's Control Center rule is
// the model: a module's round icon toggles it in one tap, its Auto switch hands the choice back to the device (HIG, Toggles).
// Must not: read a setting, the DOM or a media query, or return a value the settings do not already keep (`light`, `dark`, `auto`, a text size).

/** The text sizes a slider can stand on, smallest to largest; `auto` is not a step but the switch beside it, and the stored values are unchanged. */
export const TEXT_STEPS: readonly string[] = ['smaller', 'large', 'larger'];

/** The size a person gets when they turn Auto off and have not chosen one in this session: the first above the device's own. */
export const DEFAULT_TEXT_STEP = 'large';

/**
 * The next appearance for a tap on the round icon: the opposite of what shows. On Auto, what shows is the device's (`dark`), and the tap
 * sets that opposite for good, which turns Auto off; on a fixed theme it is the other fixed theme.
 */
export function toggleAppearance(theme: string, dark: boolean): 'light' | 'dark' {
  const showsDark = theme === 'auto' ? dark : theme === 'dark';
  return showsDark ? 'light' : 'dark';
}

/** What the Auto switch writes for the appearance: `auto` when it turns on, else the theme that shows now, so nothing changes on screen. */
export function appearanceAfterAuto(on: boolean, dark: boolean): 'auto' | 'light' | 'dark' {
  if (on) return 'auto';
  return dark ? 'dark' : 'light';
}

/** The step a text size stands on, or `fallback` for `auto` (or anything else): the slider keeps its last place while Auto holds the size. */
export function fixedTextStep(text: string, fallback: string = DEFAULT_TEXT_STEP): string {
  return TEXT_STEPS.includes(text) ? text : fallback;
}

/** The text size at a slider position, 0 to the last step; a position outside the steps is moved to the nearest. */
export function textAtStep(index: number): string {
  const clamped = Math.min(TEXT_STEPS.length - 1, Math.max(0, Math.round(index)));
  return TEXT_STEPS[clamped];
}

/** The slider position of a text size; the fallback's for `auto`, which the slider does not stand on. */
export function stepOfText(text: string, fallback: string = DEFAULT_TEXT_STEP): number {
  return TEXT_STEPS.indexOf(fixedTextStep(text, fallback));
}

/** What the text-size Auto switch writes: `auto` when it turns on, else the size the slider stood on. */
export function textAfterAuto(on: boolean, remembered: string): string {
  return on ? 'auto' : fixedTextStep(remembered);
}
