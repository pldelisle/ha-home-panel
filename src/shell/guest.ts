// The guest interface: what the shell asks of the legacy renderer that still draws the panel's content, and what it hands it.
// Pattern: strangler fig (Fowler, Strangler Fig Application): the host wraps the old code behind an interface the host
// owns, and the interface only shrinks; registering a factory keeps the shell from importing legacy code (ADR 0011).
// Must not: grow past what the spec names for a step, be imported by anything but the shell and src/main.js, or outlive
// the guest: this module is deleted with it, and so is the module state below.
import type {PanelApi} from '../core/api.ts';
import type {PanelSettings} from '../core/settings.ts';
import type {HassChange, PanelStore} from '../core/store.ts';

/** What the shell hands the guest when it connects: the page, the services and the shell's own few doors. */
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
 * loose type pass checks the shape where src/main.js registers it). The members of steps C to E are added by their
 * tickets, each with a note on which move deletes it.
 */
export interface GuestRenderer {
  /** Once per connection of the host; the guest takes its services from the context and subscribes here. */
  connect(ctx: GuestContext): void;
  /** Timers, observers and subscriptions down; `connect` may follow again. */
  disconnect(): void;
  /** After the store took the new hass; `change` is what it found different. */
  hassChanged(change: HassChange): void;
  /** After the store took the new config; the guest draws again only when the store's generation advanced. */
  panelChanged(): void;
  narrowChanged(narrow: boolean): void;
  /** Step B only: the guest still draws the toast, so the shell's `toast` forwards here; step E gives the toast to the shell. */
  toast(message: string, sticky?: boolean): void;
}

/** What the guest may ask of the shell. In step B the shell has one door, and the guest does not use it yet. */
export interface ShellForGuest {
  toast(message: string, sticky?: boolean): void;
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
