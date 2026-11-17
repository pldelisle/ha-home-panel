// The kit's drag and drop: a list of units an owner draws keyed, which a pointer lifts and drags into place and an arrow key moves one step.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers) holding the drag outside the owner's state: the owner binds its handlers on
// the list, draws its units in `arrange`'s order, and is told the new order once, on the drop or the key (`onReorder`). The Lights tiles are its
// first user (#263); its second is named in spec 23: the smart stack's reminders or the scenes' order, whichever moves first.
// Must not: save an order (the owner does), draw a unit, or move one while `enabled` says no.
import type {ReactiveController, ReactiveControllerHost} from 'lit';

export interface DragReorderOptions {
  /** Whether a drag or a key may move a unit now: an admin's Arrange. */
  enabled: () => boolean;
  /** The units' keys in the order drawn when no drag is under way. */
  keys: () => string[];
  /** The key of a child of the list, or undefined for one that is not a unit. */
  keyOf: (unit: HTMLElement) => string | undefined;
  /** The new order, after a drop that changed it or a key that moved a unit. */
  onReorder: (keys: string[]) => void;
}

/** A drag under way: the unit lifted, the pointer, where it took the unit, and the units' order as it stands. */
interface Drag {
  key: string;
  pointer: number;
  dx: number;
  dy: number;
  order: string[];
  list: HTMLElement;
  /** Released: the units settle for a moment before the owner's order takes over, and the pointer moves nothing meanwhile. */
  dropped: boolean;
}

/** The drop settles this long before the owner's order is drawn, as the legacy drag let it. */
const SETTLE_MS = 60;
/** Near the top or the bottom of the window the page scrolls along, by this much per move. */
const EDGE_TOP_PX = 70;
const EDGE_BOTTOM_PX = 90;
const SCROLL_STEP_PX = 12;
const STEPS: Readonly<Record<string, number>> = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1};

/** `key` taken out of `order` and put where `target` stood: the unit under the pointer gives way. */
export function moveTo(order: readonly string[], key: string, target: string): string[] {
  const next = order.filter(k => k !== key);
  next.splice(order.indexOf(target), 0, key);
  return next;
}

/** `key` moved `step` places, or null at either end. */
export function moveBy(order: readonly string[], key: string, step: number): string[] | null {
  const i = order.indexOf(key);
  const j = i + step;
  if (i < 0 || j < 0 || j >= order.length) return null;
  const next = [...order];
  next.splice(j, 0, ...next.splice(i, 1));
  return next;
}

/** `items` in the drag's order; one that appeared meanwhile goes last. */
export function inOrder<T>(items: readonly T[], keyOf: (item: T) => string, order: readonly string[] | undefined): T[] {
  if (!order) return [...items];
  const byKey = new Map(items.map(item => [keyOf(item), item]));
  return [
    ...order.flatMap(key => (byKey.has(key) ? [byKey.get(key)!] : [])),
    ...items.filter(item => !order.includes(keyOf(item))),
  ];
}

export class DragReorderController implements ReactiveController {
  private drag: Drag | null = null;
  private settle: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement & {renderRoot: HTMLElement | DocumentFragment},
    private readonly options: DragReorderOptions,
  ) {
    host.addController(this);
  }

  // a page left mid-drag puts the lifted unit back where it stands
  hostDisconnected(): void {
    clearTimeout(this.settle);
    const unit = this.drag && this.unitEl(this.drag);
    if (unit) unit.style.transform = '';
    this.drag = null;
  }

  /** The key of the unit under the finger, which the owner draws lifted; null when none is. */
  get lifted(): string | null {
    return this.drag && !this.drag.dropped ? this.drag.key : null;
  }

  /** The owner's units in the order to draw: the drag's while one is under way, else as given. */
  arrange<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
    return inOrder(items, keyOf, this.drag?.order);
  }

  // the child of the list a pointer or a key is on
  private unitOf(e: Event): HTMLElement | undefined {
    return e
      .composedPath()
      .find(
        (n): n is HTMLElement =>
          n instanceof HTMLElement && n.parentElement === e.currentTarget && this.options.keyOf(n) !== undefined,
      );
  }

  private unitEl(drag: Drag): HTMLElement | undefined {
    return [...drag.list.children].find(
      (c): c is HTMLElement => c instanceof HTMLElement && this.options.keyOf(c) === drag.key,
    );
  }

  readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.options.enabled() || e.button > 0) return;
    const unit = this.unitOf(e);
    if (!unit) return;
    e.preventDefault();
    clearTimeout(this.settle);
    const box = unit.getBoundingClientRect();
    this.drag = {
      key: this.options.keyOf(unit)!,
      pointer: e.pointerId,
      dx: e.clientX - box.left,
      dy: e.clientY - box.top,
      order: this.options.keys(),
      list: e.currentTarget as HTMLElement,
      dropped: false,
    };
    try {
      unit.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that is already gone: the drop follows
    }
    this.host.requestUpdate();
  };

  readonly onPointerMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.dropped || !this.options.enabled() || e.pointerId !== drag.pointer) return;
    e.preventDefault();
    // the unit under the pointer takes the lifted one's place (the lifted one lets the pointer through); the document would answer the host
    const over = (this.host.renderRoot as ShadowRoot).elementFromPoint(e.clientX, e.clientY);
    const target = [...drag.list.children].find(c => c instanceof HTMLElement && c.contains(over)) as
      HTMLElement | undefined;
    const key = target && this.options.keyOf(target);
    if (key && key !== drag.key) {
      drag.order = moveTo(drag.order, drag.key, key);
      this.host.requestUpdate();
      void this.host.updateComplete.then(() => this.follow(e));
    } else this.follow(e);
    if (e.clientY < EDGE_TOP_PX) window.scrollBy(0, -SCROLL_STEP_PX);
    else if (e.clientY > innerHeight - EDGE_BOTTOM_PX) window.scrollBy(0, SCROLL_STEP_PX);
  };

  // the lifted unit stays where the pointer took it
  private follow(e: PointerEvent): void {
    const drag = this.drag;
    const unit = drag && this.unitEl(drag);
    if (!unit) return;
    unit.style.transform = '';
    const box = unit.getBoundingClientRect();
    unit.style.transform = `translate(${e.clientX - drag.dx - box.left}px,${e.clientY - drag.dy - box.top}px)`;
  }

  readonly onPointerUp = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.dropped || e.pointerId !== drag.pointer) return;
    drag.dropped = true;
    const unit = this.unitEl(drag);
    if (unit) unit.style.transform = '';
    if (JSON.stringify(drag.order) !== JSON.stringify(this.options.keys())) this.options.onReorder(drag.order);
    this.host.requestUpdate(); // the unit is put down at once
    // the drop settles before the owner's order takes over
    this.settle = setTimeout(() => {
      if (this.drag === drag) this.drag = null;
      this.host.requestUpdate();
    }, SETTLE_MS);
  };

  // while enabled, an arrow key moves the focused unit one place, and focus stays on what had it
  readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.options.enabled()) return;
    const step = STEPS[e.key];
    const unit = this.unitOf(e);
    if (!unit || !step) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const next = moveBy(this.options.keys(), this.options.keyOf(unit)!, step);
    if (!next) return;
    const focused = e.composedPath()[0] as HTMLElement;
    this.options.onReorder(next);
    void this.host.updateComplete.then(() => focused.focus());
  };

  // while enabled a tap inside a unit neither switches nor opens it: stopped on its way down
  readonly onClickCapture = {
    handleEvent: (e: Event): void => {
      if (this.options.enabled() && this.unitOf(e)) e.stopPropagation();
    },
    capture: true,
  };
}
