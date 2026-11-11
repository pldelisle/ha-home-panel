// debounce: a function that runs once, with the last call's arguments, after the calls stop for `ms`.
// Pattern: a factory over injected timers (Meszaros, test doubles by injection; the debounce of every UI toolkit), so a test
// moves a clock instead of waiting; a volume tapped five times is one service call (Media's `volume_set`, 450 ms).
// `PLATFORM_TIMERS` is the default and is shared, so a controller that schedules for itself takes the same clock.
// Must not: read the clock itself, share a timer between two debounced functions, or run after `cancel`.

/** The two functions a debounce needs of a clock; `Handle` is whatever the clock hands back (a number in a browser). */
export interface Timers<Handle = unknown> {
  set(run: () => void, ms: number): Handle;
  clear(handle: Handle): void;
}

/** The platform's timers; the default, so a caller names none (a controller that schedules for itself takes them too). */
export const PLATFORM_TIMERS: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** A function that waits for quiet; `cancel` drops the call that is waiting (an element's `disconnectedCallback` does). */
export type Debounced<Args extends unknown[]> = ((...args: Args) => void) & {cancel(): void};

export function debounce<Args extends unknown[], Handle = unknown>(
  fn: (...args: Args) => void,
  ms: number,
  timers: Timers<Handle> = PLATFORM_TIMERS as Timers<Handle>,
): Debounced<Args> {
  let waiting: {handle: Handle} | null = null;
  const cancel = () => {
    if (waiting) timers.clear(waiting.handle);
    waiting = null;
  };
  const debounced = (...args: Args) => {
    cancel();
    waiting = {
      handle: timers.set(() => {
        waiting = null;
        fn(...args);
      }, ms),
    };
  };
  return Object.assign(debounced, {cancel});
}
