// The sheet host: the one object that knows which sheet is open, and with it Escape and where focus returns.
// Pattern: mediator (Gamma et al., Design Patterns): sheets and popups never know about each other, they register or ask; a Lit
// reactive controller (Lit docs, Reactive Controllers) on the shell, so the window's keydown listener lives as long as the connection.
// Must not: draw a sheet, or choose a tab other than by setTab. Its legacy half (the guest's sheets and their inline panels) went with the guest (#277).
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import type {FeatureKey} from '../ui/feature.ts';

/** An element's sheet: `<owner>.<name>` (`shell.more`, `weather.history`). */
export type SheetId = string;

/** A popup that Escape dismisses after the sheets: the Status checks, the settings popup. Registered in the order Escape tries them. */
export interface Popup {
  isOpen(): boolean;
  close(): void;
}

/** What the shell and the elements may ask of the host. */
export interface SheetHost {
  /** The sheet over the page; null when there is none. */
  readonly shown: SheetId | null;
  isOpen(id: SheetId): boolean;
  /** What the sheet open was asked to show (`open`'s second argument), for an element's sheet to read; undefined for any other. */
  detail(id: SheetId): unknown;
  /** Opens a sheet and closes the one open before it; on a tablet a pane's detail shows its pane instead. */
  open(id: SheetId, detail?: unknown): void;
  /** Closes the sheet over the page; with an id, only when that sheet is the one open (an element's late `sheet-close` closes nothing else). */
  close(id?: SheetId): void;
  registerPopup(popup: Popup): () => void;
}

export interface SheetMediatorOptions {
  /** The shell's root: where focus is read. */
  root: () => ShadowRoot;
  /** The pane whose detail an element's sheet is (`air.detail`), from the registry; none for any other. */
  paneOf: (id: SheetId) => FeatureKey | undefined;
  /** Whether a detail sheet opens over the screen, whatever tab is shown (the phone, or a room view: ADR 0039), as the shell has it now. */
  overScreen: () => boolean;
  setTab: (key: FeatureKey) => void;
}

// the focused element, through every shadow root down to the element itself: a tile of an element has focus two roots down
function deepActiveElement(root: ShadowRoot): HTMLElement | null {
  let el = root.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el as HTMLElement | null;
}

export class SheetMediator implements SheetHost, ReactiveController {
  private current: SheetId | null = null; // the sheet over the page
  private currentDetail: unknown; // what it was asked to show
  private lastFocus: HTMLElement | null = null;
  private readonly popups: Popup[] = [];

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly options: SheetMediatorOptions,
  ) {
    host.addController(this);
  }

  // Escape is caught on the window: a redraw can drop focus out of the shell's root, so the root would miss the key
  hostConnected(): void {
    window.addEventListener('keydown', this.onKey);
  }

  hostDisconnected(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  get shown(): SheetId | null {
    return this.current;
  }

  isOpen(id: SheetId): boolean {
    return this.current === id;
  }

  detail(id: SheetId): unknown {
    return this.current === id ? this.currentDetail : undefined;
  }

  open(id: SheetId, detail?: unknown): void {
    // an element's detail sheet is its pane's: a tablet shows it inline in the pane, a phone (or a room view) over the screen, whatever tab is shown
    const owner = this.options.paneOf(id);
    if (owner && !this.options.overScreen()) {
      this.options.setTab(owner);
      return;
    }
    this.closeCurrent();
    this.lastFocus = deepActiveElement(this.options.root());
    this.current = id;
    this.currentDetail = detail;
    this.host.requestUpdate(); // an element's `open` follows `isOpen` in its owner's template
  }

  close(id?: SheetId): void {
    if (id !== undefined && this.current !== id) return;
    this.closeCurrent();
  }

  /** The phone's shape changed: the sheet over the page closes. */
  compactChanged(): void {
    this.closeCurrent();
  }

  registerPopup(popup: Popup): () => void {
    this.popups.push(popup);
    return () => {
      const at = this.popups.indexOf(popup);
      if (at >= 0) this.popups.splice(at, 1);
    };
  }

  /** The sheet is gone from the page (the frame started over): it is no longer open, and focus goes nowhere. */
  forget(id: SheetId): void {
    if (this.current !== id) return;
    this.current = null;
    this.lastFocus = null;
    this.host.requestUpdate();
  }

  // Escape closes one thing: the open sheet, else the first popup that is open
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (this.current !== null) this.close();
    else this.popups.find(p => p.isOpen())?.close();
  };

  private closeCurrent(): void {
    if (this.current === null) return;
    this.current = null;
    this.host.requestUpdate();
    this.lastFocus?.focus?.();
  }
}
