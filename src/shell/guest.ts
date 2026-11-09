// The guest interface: what the shell asks of the guest, the legacy class that still draws the panel's content, and what it hands it.
// Pattern: strangler fig (Fowler, Strangler Fig Application): the host wraps the old code behind an interface the host
// owns, and the interface only shrinks; registering a factory keeps the shell from importing legacy code (ADR 0011).
// Must not: grow past what the spec names for a step (an addition says in its note what deletes it), be imported by
// anything but the shell and src/main.js, or outlive the guest: it is deleted with it, module state included.
// Lit binds nothing inside a guest container, and the guest writes nothing outside its containers.
import type {PanelApi} from '../core/api.ts';
import type {PanelSettings} from '../core/settings.ts';
import type {HassChange, PanelStore} from '../core/store.ts';
import type {IconName} from '../ui/icons.ts';
import type {FeatureKey, GuestAnswers} from './feature.ts';

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
  /** Step C only: the shell's More button asks for the guest's More sheet, until `<hp-more-sheet>` replaces the guest's sheet. */
  openMore(): void;
}

/** One section the phone's More sheet lists, as the registry gives it: the guest's sheet draws the list until `<hp-more-sheet>` does. */
export interface MoreSection {
  key: FeatureKey;
  /** The label, in the panel's language. */
  label: string;
  icon: IconName;
  /** A colour token such as `var(--m-blue)`. */
  color: string;
}

/** What the guest may ask of the shell, and what it may read of it. */
export interface ShellForGuest {
  toast(message: string, sticky?: boolean): void;
  /** The tab shown: the one chosen, or Home when this house hides it. */
  readonly tab: FeatureKey;
  /** Under 600 px wide: the phone's shape. */
  readonly compact: boolean;
  /** Home Assistant's sidebar is collapsed. */
  readonly narrow: boolean;
  /** Shows a tab, remembers it and tells the guest through `tabChanged` once its pane is on screen. */
  setTab(key: FeatureKey): void;
  /** `availability()` changed: the shell asks the guest again and draws the rail from the answer. */
  requestFrame(): void;
  /** The guest is about to draw its markup again: the shell renders its frame afresh and returns when it is in the DOM. Deleted with the guest's `build`. */
  resetFrame(): void;
  /** The sections that sit under More, in rail order; deleted with the guest's More sheet. */
  moreSections(): readonly MoreSection[];
}

// The guest's containers, inside the shell's root: `.guest` (src/shell/home-panel.ts holds it, display: contents). The
// rule both sides keep: Lit binds nothing inside a guest container, and the guest writes nothing outside its
// containers. This list only shrinks.

// The one piece of module state in the shell: what src/main.js registers before it defines the element, so the first
// <home-panel> already has a guest to create and its stylesheet to adopt. It exists for the guest alone.
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
