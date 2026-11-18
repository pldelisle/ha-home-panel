// A helper that lets a sheet or a dialog finish leaving (its fade, its slide) before it says that it is closed.
// Pattern: a small state holder an element composes (the other controllers here, minus the host: it asks for no update itself) holding the one fact the template cannot, "it is leaving now", and the Web Animations API's
// `getAnimations()` to know when the CSS has run its course (MDN, Animation.finished), so the length of the exit stays in the stylesheet's tokens and not in a timer here.
// Must not: decide that the element closes (its owner does, by the event `done` sends), know what it is leaving, or wait when the design does not animate: then `done` runs at once, as it always did.
/** The part of an animation this waits for. */
export interface Exiting {
  getAnimations(options?: {subtree?: boolean}): ReadonlyArray<{finished: Promise<unknown>}>;
}

export interface ExitOptions {
  /** Whether the leave is drawn now (the Material design); when it is not, `done` runs synchronously. */
  animated: () => boolean;
  /** The element whose animations, and its pseudo-elements' and its children's, are the leave. */
  target: () => Exiting | null;
  /** Called with true when the leave starts and false when it has ended: the element's way to show its `.leaving` look. */
  mark: (leaving: boolean) => void;
  /** Resolves when the element has drawn what `mark(true)` asked for, so that its animations exist (a Lit element's `updateComplete`). */
  drawn?: () => Promise<unknown>;
}

export class Exit {
  private active = false;

  constructor(private readonly options: ExitOptions) {}

  /** Between the start of the leave and its end. */
  get leaving(): boolean {
    return this.active;
  }

  /**
   * Runs `done`: now when the leave is not drawn, else once the leave's animations have finished. A second `run` while one is leaving does nothing,
   * so a button, Escape and the backdrop that come together close it once.
   */
  async run(done: () => void): Promise<void> {
    if (this.active) return;
    if (!this.options.animated()) {
      done();
      return;
    }
    this.active = true;
    this.options.mark(true);
    await this.options.drawn?.();
    await Promise.allSettled((this.options.target()?.getAnimations({subtree: true}) ?? []).map(a => a.finished));
    // `done` first: the owner shuts the element on its event, and the look that held it open goes after
    done();
    this.active = false;
    this.options.mark(false);
  }
}
