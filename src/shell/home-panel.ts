// <home-panel>, the one element Home Assistant mounts: it owns the store, the API client and the settings, provides them
// through context, and draws the legacy guest into its one shadow root.
// Pattern: composition root (Seemann, Dependency Injection Principles, Practices, and Patterns), the only place that
// builds services and wires them; humble object (Meszaros, xUnit Test Patterns), it forwards `hass`, `panel` and `narrow`
// to the store and the guest and holds no rule of its own.
// Must not: import legacy code (the guest arrives through registerGuest), bind a Lit part inside a guest container, or
// decide what the store and the models decide. It reads the browser's time zone and localStorage, and nothing below does.
import {LitElement, html, unsafeCSS, type CSSResultGroup, type CSSResultOrNative, type PropertyValues} from 'lit';
import {ContextProvider} from '@lit/context';
import {createApi} from '../core/api.ts';
import {resolveConfig} from '../core/config.ts';
import type {PanelHass} from '../core/hass.ts';
import {browserDefaults} from '../core/i18n/browser.ts';
import {createSettings, type KeyValueStorage} from '../core/settings.ts';
import {createStore} from '../core/store.ts';
import {apiContext, settingsContext, storeContext} from './contexts.ts';
import {createGuest, guestStyles, type GuestContext, type GuestRenderer, type ShellForGuest} from './guest.ts';

/** The panel Home Assistant hands over with the config the `panel_custom:` block carried. */
interface PanelInfo {
  config?: unknown;
}

// The one adapter wiring for storage: only src/core/settings.ts reads or writes it. Blocked site data makes touching
// localStorage throw, so the settings then keep their defaults.
function browserStorage(): KeyValueStorage {
  try {
    return localStorage;
  } catch {
    return {getItem: () => null, setItem: () => {}};
  }
}

export class HomePanel extends LitElement {
  // `static properties` with `declare`d fields, and no decorators: three properties do not need the compiler's help, and
  // a plain class field would shadow the accessor Lit defines for each (useDefineForClassFields).
  static override properties = {
    hass: {attribute: false},
    narrow: {type: Boolean},
    panel: {attribute: false},
  };
  declare hass: PanelHass | undefined;
  declare narrow: boolean;
  declare panel: PanelInfo | undefined;

  // The legacy stylesheet is the guest's, so it comes with the guest (registerGuest) instead of an import of
  // src/styles.js, which the dependency rule forbids here. Lit adopts it once for every instance, as a constructed
  // sheet, where the class used to write a <style> tag into each root: the rules are the same text.
  protected static override finalizeStyles(styles?: CSSResultGroup): CSSResultOrNative[] {
    return super.finalizeStyles([unsafeCSS(guestStyles()), styles ?? []]);
  }

  // this panel's services, none shared with another panel (ADR 0012)
  private readonly store = createStore({defaultTimeZone: browserDefaults().timeZone, resolve: resolveConfig});
  private readonly api = createApi(this.store);
  private readonly settings = createSettings(browserStorage());
  // a controller each: they listen for the context requests of every element below
  private readonly providers = [
    new ContextProvider(this, {context: storeContext, initialValue: this.store}),
    new ContextProvider(this, {context: apiContext, initialValue: this.api}),
    new ContextProvider(this, {context: settingsContext, initialValue: this.settings}),
  ];
  // the shell's doors for the guest; in step B the shell forwards the toast to the guest, which still draws it
  private readonly forGuest: ShellForGuest = {toast: (message, sticky) => this.guest?.toast(message, sticky)};
  private guest: GuestRenderer | undefined;

  constructor() {
    super();
    this.narrow = false;
    // The store starts from the empty config, so a panel that arrives with none is no change; the store counts its
    // first config as one even then, which would make the guest draw twice for nothing.
    this.store.setPanelConfig({});
  }

  protected override render() {
    // a container with no box of its own: the guest's markup is laid out as if it were the shadow root's children
    return html`<div class="guest" style="display:contents"></div>`;
  }

  private guestContext(): GuestContext {
    return {
      root: this.renderRoot as ShadowRoot,
      host: this,
      store: this.store,
      api: this.api,
      settings: this.settings,
      shell: this.forGuest,
    };
  }

  // the container exists now, which the guest's `connect` needs
  protected override firstUpdated(): void {
    this.guest = createGuest();
    this.guest.connect(this.guestContext());
  }

  // The store takes each new value and the guest is told after it did, in the order Home Assistant sets the properties
  // (hass, narrow, panel), the order of the setters this replaces: the guest draws once with the config the store
  // started from and draws again when the panel's config follows. That is today's behaviour, kept on purpose: one draw
  // with the final config would show the Mercury-drop filter that the guest appends to its container and that every
  // later draw wipes, which changes the glass in Chromium; the baselines record the panel without it (ADR 0016). The
  // guest does not exist during the first `willUpdate`, which is why this is `updated` and not there.
  protected override updated(changed: PropertyValues<this>): void {
    const {guest} = this;
    if (!guest) return;
    if (changed.has('hass') && this.hass) guest.hassChanged(this.store.setHass(this.hass));
    if (changed.has('narrow')) guest.narrowChanged(this.narrow);
    if (changed.has('panel')) {
      this.store.setPanelConfig(this.panel?.config);
      guest.panelChanged();
    }
  }

  // Lit calls this on the first connection too, before the first update; the guest does not exist then and
  // `firstUpdated` connects it. A later connection is a reconnect, which the guest tolerates.
  override connectedCallback(): void {
    super.connectedCallback();
    if (this.guest) this.guest.connect(this.guestContext());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.guest?.disconnect();
  }
}
