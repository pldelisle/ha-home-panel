// A controller that lets a phone's sheet be dragged down by its grabber or its header to close, as iOS sheets are.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers) that keeps the drag outside the render, so a drag
// redraws nothing and moves the panel with a transform; the element binds its four handlers in its template.
// Must not: render, decide whether the screen is a phone (the host says), or close the sheet itself: it asks.
import type {ReactiveController, ReactiveControllerHost} from 'lit';

export interface SwipeToCloseOptions {
  /** Whether a drag may start now: only on the phone's shape. */
  enabled: () => boolean;
  /** Called after the panel has slid off, when the drag was far or fast enough. */
  close: () => void;
  /** Where a drag may start, as a selector inside the panel. */
  handle: string;
}

interface Drag {
  panel: HTMLElement;
  y: number;
  at: number;
  id: number;
  /** Past the first few pixels: the panel follows the finger. */
  moving: boolean;
}

// A drag under this many pixels is a tap; past it the panel follows the finger.
const START_PX = 6;
// Far enough to close, or a quick flick that has gone a little way (pixels per millisecond).
const CLOSE_PX = 80;
const FLICK_PX = 24;
const FLICK_SPEED = 0.5;
// How long the slide off lasts before the sheet is asked to close.
const SLIDE_MS = 180;
// A press on a control is the control's: capturing the pointer for a drag would send its click to the panel.
const CONTROL = 'button, a[href], input, select, textarea, [role="tab"]';

export class SwipeToClose implements ReactiveController {
  private drag: Drag | null = null;
  private slide: ReturnType<typeof setTimeout> | undefined;

  constructor(
    host: ReactiveControllerHost,
    private readonly options: SwipeToCloseOptions,
  ) {
    host.addController(this);
  }

  hostDisconnected(): void {
    clearTimeout(this.slide);
    this.drag = null;
  }

  readonly onPointerDown = (e: PointerEvent): void => {
    const panel = e.currentTarget as HTMLElement;
    if (!this.options.enabled() || e.button || !this.startsOnHandle(e, panel)) return;
    this.drag = {panel, y: e.clientY, at: Date.now(), id: e.pointerId, moving: false};
    try {
      panel.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that is gone cannot be captured; the drag simply never moves
    }
  };

  // The path, not `closest`: this listener is on the panel, a shadow root above what an owner slots into the header, so
  // the event's target is that slotted node and walking up its parents never reaches the header's own element.
  private startsOnHandle(e: PointerEvent, panel: HTMLElement): boolean {
    const path = e.composedPath();
    const inside = path.slice(0, path.indexOf(panel)).filter((n): n is Element => n instanceof Element);
    return inside.some(n => n.matches(this.options.handle)) && !inside.some(n => n.matches(CONTROL));
  }

  readonly onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y;
    if (!d.moving) {
      if (dy <= START_PX) return;
      d.moving = true;
      d.panel.classList.add('dragging');
    }
    d.panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
  };

  readonly onPointerEnd = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y;
    const fast = dy / Math.max(1, Date.now() - d.at) > FLICK_SPEED;
    this.drag = null;
    d.panel.classList.remove('dragging');
    if (!(d.moving && (dy > CLOSE_PX || (fast && dy > FLICK_PX)))) {
      d.panel.style.transform = '';
      return;
    }
    d.panel.style.transform = `translateY(${d.panel.offsetHeight}px)`;
    this.slide = setTimeout(() => {
      d.panel.style.transform = '';
      this.options.close();
    }, SLIDE_MS);
  };
}
