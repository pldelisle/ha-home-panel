// The sheet host: the one object that knows which sheet is open, and with it Escape, where focus returns and where a detail panel sits.
// Pattern: mediator (Gamma et al., Design Patterns): sheets and popups never know about each other, they register or ask; a Lit
// reactive controller (Lit docs, Reactive Controllers) on the shell, so the window's keydown listener lives as long as the connection.
// Must not: draw a sheet, build a legacy sheet's content (the guest does, when told), or choose a tab other than by setTab.
import type {ReactiveController, ReactiveControllerHost} from 'lit';
import type {FeatureKey} from './feature.ts';

/** The ids of the guest's sheets: the id of the `.sheet` element it draws. */
export type LegacySheetId =
  | 'sh-energy'
  | 'sh-climate'
  | 'sh-air'
  | 'sh-car'
  | 'sh-weather'
  | 'sh-wx'
  | 'sh-sens'
  | 'sh-cam'
  | 'sh-light'
  | 'sh-card';

/** A legacy sheet is its element's id (a `LegacySheetId`); an element's sheet is `<owner>.<name>` (`shell.more`, later `weather.history`). */
export type SheetId = string;

/** Where a detail panel sits inside its pane on a tablet, and the pane that holds it. */
export interface InlinePlacement {
  pane: FeatureKey;
  /** the id of the container inside the shell's root that takes the panel */
  host: string;
}

/** A sheet the guest wrote, registered while its element is in the DOM. */
export interface LegacySheet {
  id: LegacySheetId;
  /** the `.sheet` div: the scrim, with the `.panel` and the `.close` button inside */
  element: HTMLElement;
  /** Present for the five detail sheets: on a tablet the panel sits in its pane, and opening the sheet shows that pane. */
  inline?: InlinePlacement;
}

/** A popup that Escape dismisses after the sheets: the Status checks, the settings popup. Registered in the order Escape tries them. */
export interface Popup {
  isOpen(): boolean;
  close(): void;
}

/** What the host asks of the guest: build a sheet's content when it opens, let go of it when it closes. */
export interface LegacySheetGuest {
  /** The sheet is on screen (over the page, or inline in its pane); it may be told again for an inline sheet another had covered. */
  sheetOpened(id: LegacySheetId, detail?: unknown): void;
  /** The sheet left the screen: charts, the radar and the camera go. */
  sheetClosed(id: LegacySheetId): void;
}

/** What the guest and the elements may ask of the host. */
export interface SheetHost {
  /** The sheet on screen: the one over the page, or else the detail panel shown inside the pane. Null when there is none. */
  readonly shown: SheetId | null;
  isOpen(id: SheetId): boolean;
  /** Opens a sheet and closes the one open before it; on a tablet a sheet with an inline panel shows its pane instead. */
  open(id: SheetId, detail?: unknown): void;
  /** Closes the sheet over the page; with an id, only when that sheet is the one open (an element's late `sheet-close` closes nothing else). */
  close(id?: SheetId): void;
  /** The pane of `tab` is on screen: the inline panel of the pane before it goes, the one of this pane shows (a tablet). */
  paneShown(tab: FeatureKey): void;
  registerLegacy(sheet: LegacySheet): () => void;
  registerPopup(popup: Popup): () => void;
}

export interface SheetMediatorOptions {
  /** The shell's root: where focus is read, and where the inline hosts are looked up. */
  root: () => ShadowRoot;
  guest: () => LegacySheetGuest | undefined;
  /** The tab shown, and the phone's shape, as the shell has them now. */
  tab: () => FeatureKey;
  compact: () => boolean;
  setTab: (key: FeatureKey) => void;
}

interface Registered {
  sheet: LegacySheet;
  /** kept by identity: on a tablet it is moved out of `sheet.element` into its pane */
  panel: HTMLElement | null;
}

// the focused element, through every shadow root down to the element itself: a tile of an element has focus two roots down
function deepActiveElement(root: ShadowRoot): HTMLElement | null {
  let el = root.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el as HTMLElement | null;
}

export class SheetMediator implements SheetHost, ReactiveController {
  private current: SheetId | null = null; // the sheet over the page
  private inline: LegacySheetId | null = null; // the detail panel shown in its pane
  private lastFocus: HTMLElement | null = null;
  private readonly legacy = new Map<SheetId, Registered>();
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
    return this.current ?? this.inline;
  }

  isOpen(id: SheetId): boolean {
    return this.shown === id;
  }

  open(id: SheetId, detail?: unknown): void {
    const entry = this.legacy.get(id);
    if (!entry && !id.includes('.')) return; // a guest sheet that is not drawn (any more)
    const inline = entry?.sheet.inline;
    if (inline && !this.options.compact()) {
      this.options.setTab(inline.pane);
      return;
    }
    this.closeCurrent();
    this.lastFocus = deepActiveElement(this.options.root());
    this.current = id;
    if (!entry) {
      this.host.requestUpdate(); // an element's `open` follows `isOpen` in its owner's template
      return;
    }
    entry.sheet.element.hidden = false;
    this.options.guest()?.sheetOpened(entry.sheet.id, detail);
    entry.sheet.element.querySelector<HTMLElement>('.close')?.focus();
  }

  close(id?: SheetId): void {
    if (id !== undefined && this.current !== id) return;
    if (this.closeCurrent()) this.showInline(this.options.tab());
  }

  paneShown(tab: FeatureKey): void {
    // a sheet over the panel closes with it, as `hide` did when the tab changed
    if (this.current !== null && this.inline !== null) this.closeCurrent();
    this.dropInline();
    this.showInline(tab);
  }

  /** The phone's shape changed: the sheet over the page closes, the inline panel goes, and the panels sit where the new shape wants them. */
  compactChanged(compact: boolean): void {
    this.closeCurrent();
    this.dropInline();
    for (const entry of this.legacy.values()) this.place(entry, compact);
  }

  registerLegacy(sheet: LegacySheet): () => void {
    const entry: Registered = {sheet, panel: sheet.element.querySelector<HTMLElement>('.panel')};
    const abort = new AbortController();
    const {signal} = abort;
    // a tap on the scrim, not on the panel, and the Close button
    sheet.element.addEventListener(
      'click',
      e => {
        if (e.target === sheet.element) this.close(sheet.id);
      },
      {signal},
    );
    sheet.element.querySelector('.close')?.addEventListener('click', () => this.close(sheet.id), {signal});
    this.legacy.set(sheet.id, entry);
    this.place(entry, this.options.compact());
    return () => {
      abort.abort();
      this.forget(sheet.id);
      this.legacy.delete(sheet.id);
    };
  }

  registerPopup(popup: Popup): () => void {
    this.popups.push(popup);
    return () => {
      const at = this.popups.indexOf(popup);
      if (at >= 0) this.popups.splice(at, 1);
    };
  }

  /** The sheet is gone from the page (the guest drew again, the frame started over): it is no longer open, and nobody is told. */
  forget(id: SheetId): void {
    if (this.inline === id) this.inline = null;
    if (this.current !== id) return;
    this.current = null;
    this.lastFocus = null;
    if (!this.legacy.has(id)) this.host.requestUpdate();
  }

  // Escape closes one thing: the open sheet, else the first popup that is open
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (this.current !== null) this.close();
    else this.popups.find(p => p.isOpen())?.close();
  };

  // True when a legacy sheet closed. The guest's charts for it and for an inline panel share one list, so closing it
  // destroyed the panel's: it is dropped without a word and the caller shows it again, built anew, as `hide` did.
  private closeCurrent(): boolean {
    const id = this.current;
    if (id === null) return false;
    this.current = null;
    const entry = this.legacy.get(id);
    if (entry) {
      this.inline = null;
      this.options.guest()?.sheetClosed(entry.sheet.id);
      entry.sheet.element.hidden = true;
    } else this.host.requestUpdate();
    this.lastFocus?.focus?.();
    return entry !== undefined;
  }

  private showInline(tab: FeatureKey): void {
    if (this.options.compact() || this.current !== null || this.inline !== null) return;
    for (const {sheet} of this.legacy.values()) {
      if (sheet.inline?.pane !== tab) continue;
      this.inline = sheet.id;
      this.options.guest()?.sheetOpened(sheet.id);
      return;
    }
  }

  private dropInline(): void {
    const id = this.inline;
    if (id === null) return;
    this.inline = null;
    this.options.guest()?.sheetClosed(id);
  }

  // the five detail panels sit inline in their panes on a tablet; on a phone they stay sheets over the page
  private place({sheet, panel}: Registered, compact: boolean): void {
    if (!sheet.inline || !panel) return;
    if (compact) {
      panel.setAttribute('aria-modal', 'true');
      sheet.element.appendChild(panel);
    } else {
      panel.removeAttribute('aria-modal');
      this.options.root().getElementById(sheet.inline.host)?.appendChild(panel);
    }
  }
}
