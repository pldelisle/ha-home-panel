// The guest interface: what the shell asks of the guest, the legacy class that still draws the panel's content, and what it hands it.
// Pattern: strangler fig (Fowler, Strangler Fig Application): the host wraps the old code behind an interface the host
// owns, and the interface only shrinks; registering a factory keeps the shell from importing legacy code (ADR 0011).
// Must not: grow past what the spec names for a step, except a member whose note names what deletes it; be imported by
// anything but the shell and src/main.js; or outlive the guest: it is deleted with it, module state included.
// Lit binds nothing inside a guest container, and the guest writes nothing outside its containers.
import type {PanelApi} from '../core/api.ts';
import type {PanelSettings} from '../core/settings.ts';
import type {HassChange, PanelStore} from '../core/store.ts';
import type {Appearance} from '../ui/contexts.ts';
import type {FeatureDescriptor, FeatureKey, GuestAnswers} from './feature.ts';
import type {IdleTimer} from './idle-timer.ts';

/** What the shell hands the guest when it connects: the root, the host, the services and the shell's own few doors. */
export interface GuestContext {
  /** The shell's one shadow root; the guest draws into its containers inside it and nowhere else. */
  root: ShadowRoot;
  /** The `<home-panel>` element, for `isConnected` and for events that must leave the shadow root. */
  host: HTMLElement;
  store: PanelStore;
  api: PanelApi;
  settings: PanelSettings;
  shell: ShellForGuest;
}

/**
 * What the shell asks of the guest. The class in src/home-panel.js implements it structurally (it is JavaScript; the
 * loose type pass checks the shape where src/main.js registers it). The members of steps D and E are added by their
 * tickets, each with a note on which move deletes it.
 */
export interface GuestRenderer extends GuestAnswers {
  /** Once per connection of the host; the guest takes its services from the context and subscribes here. */
  connect(ctx: GuestContext): void;
  /** Timers, observers and subscriptions down; `connect` may follow again. */
  disconnect(): void;
  /** After the store took the new hass; `change` is what it found different. */
  hassChanged(change: HassChange): void;
  /** After the store took the new config; the guest draws again only when the store's generation advanced. */
  panelChanged(): void;
  /** Step B only: the guest still draws the toast, so the shell's `toast` forwards here; step E gives the toast to the shell. */
  toast(message: string, sticky?: boolean): void;
  /** Step C: the shell's frame shows the pane of `tab` now; the guest draws its part of it. Deleted with the last pane the guest draws. */
  tabChanged(tab: FeatureKey): void;
  /** Step C: the shell's `compact` changed and its frame already follows; the guest lays its cards out again. Deleted with the last layout the guest keeps. */
  compactChanged(compact: boolean): void;
  /**
   * Step D: the shell's appearance is a new value and its frame shows it (`data-theme`, `data-wp`, `gl`, `txl`, `live`
   * and the rest). Told once per new value, after the frame shows it, and not for the value the guest connected to; the
   * guest redraws what it drew from the old theme and fits its glass lens. Deleted with the guest (the phase-3 gate,
   * #188); the lens half also waits for #198.
   */
  appearanceChanged(appearance: Appearance): void;
  /** Step C only: the shell's More button asks for the guest's More sheet, deleted by #166 (`<hp-more-sheet>`). */
  openMore(): void;
  /**
   * Step D: the idle clock is showing (true) or the panel woke (false). The shell has drawn `.app.idle` and the overlay by
   * then; the guest draws the clock into `#iwrap`. Told once per change. Deleted with the clock's own move (#187).
   */
  idleChanged(idle: boolean): void;
}

/** One section the phone's More sheet lists, as the registry gives it; deleted by #166 (`<hp-more-sheet>`). */
export type MoreSection = Pick<FeatureDescriptor, 'key' | 'icon' | 'color'> & {
  /** The label, in the panel's language. */
  label: string;
};

/** What the guest may ask of the shell, and what it may read of it. Deleted whole with the guest; `tab`, `compact`, `setTab` and `requestFrame` live as long as it does. */
export interface ShellForGuest {
  toast(message: string, sticky?: boolean): void;
  /** The tab shown: the one chosen, or Home when this house hides it. */
  readonly tab: FeatureKey;
  /** Under 600 px wide: the phone's shape. */
  readonly compact: boolean;
  /** How the panel looks now: always current, where the frame follows in the next render. Deleted with the guest. */
  readonly appearance: Appearance;
  /** Shows a tab, remembers it and tells the guest through `tabChanged` once its pane is on screen. */
  setTab(key: FeatureKey): void;
  /** `availability()` changed: the shell asks the guest again and draws the rail from the answer. */
  requestFrame(): void;
  /** The guest is about to draw its markup again: the shell renders its frame afresh and returns when it is in the DOM. Deleted with the guest's `build`. */
  resetFrame(): void;
  /** The sections that sit under More, in rail order; deleted by #166 (`<hp-more-sheet>`). */
  moreSections(): readonly MoreSection[];
  /**
   * Step D: the shell's idle timer. `arm` counts as a touch (the guest drew again); `sleepNow` shows the clock at once,
   * on a phone too. The controller's `start` is the shell's own, at connection. Deleted with the guest's clock (#187).
   */
  idle: Pick<IdleTimer, 'arm' | 'sleepNow'>;
}

// The guest's containers, inside the shell's root: `.guest` (src/shell/home-panel.ts holds it, display: contents) and
// `#iwrap`, the idle clock's, inside the overlay the shell draws (step D). The rule both sides keep: Lit binds nothing
// inside a guest container, and the guest writes nothing outside its containers. This list only shrinks.

// The shell's module state: the guest registry here and, in document-background.ts, the claims on the document's
// background. This is what src/main.js registers before it defines the element, so the first <home-panel> already has a
// guest to create and its stylesheet to adopt. It exists for the guest alone.
let registered: {make: () => GuestRenderer; styles: string} | null = null;

/** `styles` is the guest's stylesheet as text; the shell adopts it once, so the shell imports no legacy module. */
export function registerGuest(make: () => GuestRenderer, styles: string): void {
  registered = {make, styles};
}

const unregistered = () =>
  new Error('No guest registered: call registerGuest() in src/main.js before defining <home-panel>.');

export function createGuest(): GuestRenderer {
  if (!registered) throw unregistered();
  return registered.make();
}

export function guestStyles(): string {
  if (!registered) throw unregistered();
  return registered.styles;
}
