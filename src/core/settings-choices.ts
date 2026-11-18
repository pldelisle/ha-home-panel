// What a tap on a Control Center module asks of the settings: the next appearance, the text size a step names, and what an Auto switch writes.
// Pattern: functional core (Bernhardt, Boundaries): the popup reads the settings and the theme in force, these decide; macOS's Control Center rule is
// the model: a module's round icon toggles it in one tap, its Auto switch hands the choice back to the device (HIG, Toggles).
// Must not: read a setting, the DOM or a media query, or return a value the settings do not already keep (`light`, `dark`, `auto`, a text size).

/** The text sizes a slider can stand on, with the scale (`--tx`) each gives; `auto` is not a step but the switch beside it, and follows the device. */
export const TEXT_SCALES: ReadonlyMap<string, number> = new Map([
  ['smaller', 0.9],
  ['normal', 1],
  ['large', 1.15],
  ['larger', 1.3],
]);

/** The steps, smallest to largest. */
export const TEXT_STEPS: readonly string[] = [...TEXT_SCALES.keys()];

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

/** The step whose scale is nearest `scale`, the smaller one on a tie: where a size that follows the device stands among the steps. */
export function nearestTextStep(scale: number): string {
  let best = TEXT_STEPS[0];
  let gap = Infinity;
  for (const [step, at] of TEXT_SCALES) {
    const away = Math.abs(at - scale);
    if (away < gap - 1e-9) {
      best = step;
      gap = away;
    }
  }
  return best;
}

/** The text size at a slider position, 0 to the last step; a position outside the steps is moved to the nearest. */
export function textAtStep(index: number): string {
  const clamped = Math.min(TEXT_STEPS.length - 1, Math.max(0, Math.round(index)));
  return TEXT_STEPS[clamped];
}

/** The slider position of a text size; for `auto` (which is no step) the step nearest the scale in force, so the slider stands where the text is. */
export function stepOfText(text: string, scale: number): number {
  return TEXT_STEPS.indexOf(TEXT_SCALES.has(text) ? text : nearestTextStep(scale));
}

/** What the text-size Auto switch writes: `auto` when it turns on, else the step nearest the scale in force, so the text does not jump. */
export function textAfterAuto(on: boolean, scale: number): string {
  return on ? 'auto' : nearestTextStep(scale);
}
