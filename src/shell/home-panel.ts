// <home-panel>, the one element Home Assistant mounts: it owns the store, the API client and the settings, provides them through context, draws the frame from the registry and hosts the guest in its one shadow root.
// Pattern: composition root (Seemann, Dependency Injection Principles, Practices, and Patterns); humble object (Meszaros, xUnit Test Patterns): it forwards `hass`, `panel` and `narrow` and decides nothing the registry and the store decide.
// It reads `localStorage`; the browser's locale defaults are read here and, until the formatters move, by the guest. It owns `tab`, `compact`, the idle state, which tabs the house shows and, through its controller, the appearance.
// Must not: import legacy code (the guest arrives through registerGuest), or decide what the store and the models decide.
// Lit binds nothing inside a guest container, and the guest writes nothing outside its containers.
import {
  LitElement,
  html,
  unsafeCSS,
  type CSSResultGroup,
  type CSSResultOrNative,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import {keyed} from 'lit/directives/keyed.js';
import {repeat} from 'lit/directives/repeat.js';
import {styleMap} from 'lit/directives/style-map.js';
import {ContextProvider} from '@lit/context';
import {createApi} from '../core/api.ts';
import {resolveConfig} from '../core/config.ts';
import type {PanelHass} from '../core/hass.ts';
import {browserDefaults} from '../core/i18n/browser.ts';
import {createSettings, type KeyValueStorage} from '../core/settings.ts';
import {createStore} from '../core/store.ts';
import {MediaQueryController} from '../ui/controllers/media-query.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {apiContext, settingsContext, storeContext, type Appearance} from '../ui/contexts.ts';
import {ico} from '../ui/icons.ts';
import {AppearanceController} from './appearance.ts';
import type {FeatureKey} from './feature.ts';
import {FEATURES, isFeatureKey, visibleTab} from './features.ts';
import {createGuest, guestStyles, type GuestContext, type GuestRenderer, type ShellForGuest} from './guest.ts';
import {IdleTimer, type IdleState} from './idle-timer.ts';

/** The panel Home Assistant hands over with the config the `panel_custom:` block carried. */
interface PanelInfo {
  config?: unknown;
}

// The phone's shape: the bar at the bottom, one column. The stylesheet's `.cp` rules are written for the same width.
const PHONE = '(max-width:599px)';
// The device's own appearance: dark, and less transparency. The theme follows the first on auto; the glass lens yields to the second.
const DARK = '(prefers-color-scheme: dark)';
const REDUCED_TRANSPARENCY = '(prefers-reduced-transparency: reduce)';

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
  // `static properties` with `declare`d fields, and no decorators: a few properties do not need the compiler's help, and
  // a plain class field would shadow the accessor Lit defines for each (useDefineForClassFields).
  static override properties = {
    hass: {attribute: false},
    narrow: {type: Boolean},
    panel: {attribute: false},
    selected: {state: true},
    epoch: {state: true},
    idleState: {state: true},
  };
  declare hass: PanelHass | undefined;
  declare narrow: boolean;
  declare panel: PanelInfo | undefined;
  /** The tab asked for, as the settings remember it: a hidden or unknown one shows Home (`tab`). */
  declare private selected: string;
  /** Counts the guest's fresh starts: the frame it draws into is keyed on it, so each start finds new elements. */
  declare private epoch: number;
  /** The idle timer's state, drawn as `.app.idle`, the overlay's `hidden` and its `wake` class; the guest draws the clock. */
  declare private idleState: IdleState;

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
  // The shell hears about the store only when a registry, the language or the user changes: it reads no entity, and the
  // guest tells it through `requestFrame` when its answer about the house changes. It passes the store itself because
  // a context provider never answers its own element.
  private readonly storeController = new StoreController(this, {
    store: this.store,
    ids: () => [],
    onChange: () => {
      this.stale = true;
    },
  });
  private readonly phone = new MediaQueryController(this, PHONE);
  // Five minutes without a touch and a tablet shows the clock; a phone never does by itself. The listeners are the
  // controller's, on this root and the window, from connection to disconnection.
  private readonly idle = new IdleTimer(this, {
    delayMs: 5 * 60_000,
    wakeMs: 400,
    compact: () => this.phone.matches,
    ready: () => this.hass !== undefined,
    onChange: state => {
      this.idleState = state;
    },
  });
  // theme, glass, text size, the page's background and `live`: one controller, which provides the value by context
  private readonly appearance: AppearanceController = new AppearanceController(this, {
    store: this.store,
    settings: this.settings,
    compact: this.phone,
    dark: new MediaQueryController(this, DARK),
    reducedTransparency: new MediaQueryController(this, REDUCED_TRANSPARENCY),
    touches: listener => this.idle.onTouch(listener),
  });
  private readonly forGuest: ShellForGuest = this.doors();
  private guest: GuestRenderer | undefined;
  private guestConnected = false;
  // which tabs this house shows, asked of the descriptors when the answer may have changed (the store told us, or the guest)
  private stale = true;
  private shown: Readonly<Partial<Record<FeatureKey, boolean>>> = {};
  private visible: FeatureKey = 'home';
  private toldTab: FeatureKey | undefined;
  private activeEpoch = -1;
  private toldCompact = false;
  // the appearance as the last render drew it, and as the guest last heard it: the guest is told once the DOM follows
  private drawn: Appearance | undefined;
  private toldAppearance: Appearance | undefined;
  private phoneNow = false;
  private idleCompact = this.phone.matches; // what the idle timer was last told about the phone's shape
  private toldIdle = false;

  constructor() {
    super();
    this.narrow = false;
    this.selected = this.settings.get().tab;
    this.epoch = 0;
    this.idleState = 'active';
    // each provider adds itself to this element as a controller and answers the context requests of every element below
    new ContextProvider(this, {context: storeContext, initialValue: this.store});
    new ContextProvider(this, {context: apiContext, initialValue: this.api});
    new ContextProvider(this, {context: settingsContext, initialValue: this.settings});
    // The store starts from the empty config, so a panel that arrives with none is no change; the store counts its
    // first config as one even then, which would make the guest draw a second time for nothing.
    this.store.setPanelConfig({});
  }

  // the shell's doors for the guest: a few calls back, and `tab`, `compact` and `narrow` read as the element is when asked
  private doors(): ShellForGuest {
    const tab = () => this.tab;
    const compact = () => this.compact;
    const appearance = () => this.appearance.value;
    return {
      toast: (message, sticky) => this.guest?.toast(message, sticky),
      setTab: key => this.setTab(key),
      requestFrame: () => this.requestFrame(),
      resetFrame: () => this.resetFrame(),
      moreSections: () => this.moreSections(),
      idle: {arm: () => this.idle.arm(), sleepNow: () => this.idle.sleepNow()},
      get tab() {
        return tab();
      },
      get compact() {
        return compact();
      },
      get appearance() {
        return appearance();
      },
    };
  }

  /** The tab shown: the one chosen, or Home when this house hides it or the settings name no tab. */
  get tab(): FeatureKey {
    return this.visible;
  }

  /** Under 600 px wide: the phone's shape. */
  get compact(): boolean {
    return this.phoneNow;
  }

  /** Shows a tab: remembers it, draws the frame with its pane open, then tells the guest, which draws its part. */
  private setTab(key: FeatureKey): void {
    this.selected = isFeatureKey(key) ? key : 'home';
    this.settings.set('tab', this.selected);
    this.idle.arm();
    // the update tells the guest when the tab shown changed (`updated`); only an element not yet drawn skips it
    this.flush();
    if (!this.hasUpdated) this.tellTab();
  }

  private requestFrame(): void {
    this.stale = true;
    this.requestUpdate();
  }

  // The guest starts over: new frame elements, as the old build wrote new ones, so no listener it wired and no card it
  // moved into a pane survives into its next draw. It needs the elements at once, so the update runs now.
  private resetFrame(): void {
    this.epoch++;
    this.flush();
  }

  // Lit renders in a microtask. The guest looks its elements up right after it asks for a change, so these two
  // requests render at once, through the hook Lit documents for taking over the timing of an update.
  private flush(): void {
    if (!this.hasUpdated) return;
    this.requestUpdate();
    this.performUpdate();
  }

  private tellTab(): void {
    if (!this.guestConnected) return;
    this.toldTab = this.visible;
    this.guest?.tabChanged(this.visible);
    this.syncActive();
  }

  // A pane whose element has an `active` property is told whether it is the one on screen; it pauses its store
  // controller while it is not. None of the guest's panes has one.
  private syncActive(): void {
    this.activeEpoch = this.epoch;
    for (const f of FEATURES) {
      const first = this.renderRoot.querySelector(`#pane-${f.key}`)?.firstElementChild as {active?: boolean} | null;
      if (first && 'active' in first) first.active = f.key === this.visible;
    }
  }

  private moreSections() {
    const {t} = this.store;
    return FEATURES.filter(f => !f.phoneBar).map(f => ({key: f.key, label: t(f.title), icon: f.icon, color: f.color}));
  }

  protected override willUpdate(): void {
    this.phoneNow = this.phone.matches;
    // told here and not in `updated`: the timer's change lands in this very update
    if (this.phoneNow !== this.idleCompact) {
      this.idleCompact = this.phoneNow;
      this.idle.compactChanged(this.phoneNow);
    }
    if (this.guestConnected && this.stale) {
      this.stale = false;
      const env = {store: this.store, guest: this.guest as GuestRenderer};
      this.shown = Object.fromEntries(FEATURES.map(f => [f.key, f.available?.(env) ?? true]));
    }
    this.visible = visibleTab(this.selected, this.shown);
  }

  // `.app#app` sits outside `keyed`: it is the one frame element a guest draw keeps, so the guest clears the classes and
  // data it toggles on it at each draw (where main's fresh `#app` came bare). The wrap inside is new at each draw.
  protected override render() {
    const a = (this.drawn = this.appearance.value);
    return html`<div
      class="app ${classMap({
        narrow: this.narrow,
        cp: this.compact,
        tabsv: true,
        idle: this.idleState === 'idle',
        gl: a.glass.on,
        txl: a.largeText,
        live: a.live,
      })}"
      id="app"
      data-theme=${a.theme}
      data-wp=${ifDefined(a.glass.wallpaper ?? undefined)}
    >
      ${keyed(this.epoch, this.renderWrap())}
      <div class="guest" style="display:contents"></div>
      ${this.renderIdle()}
      <span
        id="txprobe"
        aria-hidden="true"
        style="position:absolute;left:-9999px;visibility:hidden;font-size:17px;font:-apple-system-body"
      ></span>
    </div>`;
  }

  // The idle clock's overlay, a child of `.app` so the frame fades behind it (`.app.idle > :not(.idle)`). It is visible while
  // idle and while waking, when it fades out and swallows the tap that woke the panel; `#iwrap` is the guest's container
  // and has no binding, so Lit never touches what the guest draws in it.
  private renderIdle(): TemplateResult {
    return html`<div
      class="idle ${classMap({wake: this.idleState === 'waking'})}"
      id="idle"
      ?hidden=${this.idleState === 'active'}
      aria-hidden="true"
    >
      <div class="iwrap" id="iwrap"></div>
    </div>`;
  }

  // The header, the error line and the tabs, whose containers the guest fills (#hello, #chips, #clock, #att, #setc, #err,
  // the hosts inside the panes); what it draws itself comes after, in the guest container.
  private renderWrap(): TemplateResult {
    return html`<div class="wrap">
      <header class="head">
        <button class="icon menu" id="menu" type="button" aria-label="Open the sidebar">${ico('menu')}</button>
        <div class="hello" id="hello"></div>
        <div class="chips">
          <div id="chips"></div>
          <button
            class="icon"
            id="gear"
            type="button"
            aria-label="Settings"
            aria-haspopup="dialog"
            aria-expanded="false"
          >
            ${ico('gear', 20)}
          </button>
        </div>
        <div class="clock" id="clock"></div>
        <div class="pop" id="attpop" hidden role="dialog" aria-label="Status checks"><div id="att"></div></div>
        <div class="pop" id="setpop" hidden role="dialog" aria-label="Settings"><div id="setc"></div></div>
      </header>
      <div id="err"></div>
      <div class="tabview" id="tabview" hidden>
        ${this.renderRail()}
        <div class="panes">
          ${repeat(
            FEATURES,
            f => f.key,
            f =>
              html`<section class="pane pane-${f.key}" id="pane-${f.key}" ?hidden=${this.tab !== f.key}>
                ${f.pane()}
              </section>`,
          )}
        </div>
      </div>
    </div>`;
  }

  // The rail on a tablet, the bar on a phone. Before the guest has answered, every button is hidden: it alone knows
  // which tabs this house lacks, and a tab that shows for a moment is a tab a frame can catch.
  private renderRail(): TemplateResult {
    const {t} = this.store;
    const {tab} = this;
    const section = FEATURES.find(f => f.key === tab && !f.phoneBar);
    return html`<nav class="rail" id="rail" role="tablist" aria-label="Sections">
      ${repeat(
        FEATURES,
        f => f.key,
        f =>
          html`<button
            type="button"
            class="rtab"
            role="tab"
            data-tab=${f.key}
            ?data-ph=${f.phoneBar}
            ?hidden=${!this.guestConnected || this.shown[f.key] === false}
            aria-selected=${tab === f.key}
            @click=${() => this.setTab(f.key)}
          >
            ${ico(f.icon, 24)}<span>${t(f.title)}</span>
          </button>`,
      )}<button
        type="button"
        class="rtab rmore"
        role="tab"
        id="moretab"
        aria-selected=${section !== undefined}
        aria-haspopup="dialog"
        style=${styleMap({'--rc': section?.color ?? 'var(--c-home)'})}
        @click=${() => this.guest?.openMore()}
      >
        ${ico(section?.icon ?? 'more', 24)}<span
          >${section ? t(section.shortTitle ?? section.title) : t('nav.more')}</span
        >
      </button>
    </nav>`;
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
    this.connectGuest();
  }

  private connectGuest(): void {
    if (!this.guest || !this.isConnected) return;
    this.guest.connect(this.guestContext());
    this.guestConnected = true;
    this.phoneNow = this.phone.matches;
    this.toldCompact = this.phoneNow;
    this.toldAppearance = this.drawn;
    this.toldTab = this.visible;
    this.requestFrame(); // the guest answers about the house from here on
  }

  // The store takes each value and the guest is told after it did, in the order the properties were set: Lit keeps the
  // changed properties in the order they were first set. Home Assistant sets `panel` before `hass`, so there the guest
  // draws once with the config; the harness sets `hass` first, so there it draws once without it and again with it.
  // Each environment draws as the element did before it, which the baselines record (ADR 0016). The guest exists only
  // after `firstUpdated`, so the first update cannot be told in `willUpdate`, and the store is fed here for the same
  // reason: feeding the config before the guest's first `hassChanged` would turn the harness's two draws into one.
  protected override updated(changed: PropertyValues<this>): void {
    const {guest} = this;
    if (!guest || !this.guestConnected) return;
    for (const key of changed.keys()) {
      if (key === 'hass' && this.hass) guest.hassChanged(this.store.setHass(this.hass));
      if (key === 'panel') {
        this.store.setPanelConfig(this.panel?.config);
        guest.panelChanged();
      }
    }
    // the DOM follows the appearance now (data-theme, data-wp, gl, txl, live, cp); the guest hears of it once, then of the
    // phone's shape, whose first act was the glass it has just been told about
    if (this.drawn && this.drawn !== this.toldAppearance) {
      this.toldAppearance = this.drawn;
      guest.appearanceChanged(this.drawn);
    }
    // the frame already follows the phone's shape (`cp`); the guest lays its cards out again
    if (this.compact !== this.toldCompact) {
      this.toldCompact = this.compact;
      guest.compactChanged(this.compact);
    }
    // the shell has drawn the overlay by now, so the guest can draw the clock in it; told once, when the clock shows or goes
    const idle = this.idleState === 'idle';
    if (idle !== this.toldIdle) {
      this.toldIdle = idle;
      guest.idleChanged(idle);
    }
    // a tab the house does not show gives way to Home, and comes back when the house shows it again
    if (this.visible !== this.toldTab) this.tellTab();
    else if (this.epoch !== this.activeEpoch) this.syncActive();
  }

  // Lit calls this on the first connection too, before the first update; the guest does not exist then and
  // `firstUpdated` connects it. A later connection is a reconnect, which the guest tolerates.
  override connectedCallback(): void {
    super.connectedCallback();
    if (this.guest) this.connectGuest();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.guest?.disconnect();
    this.toldIdle = false; // the guest is down: a change of state while away tells it nothing, and a clock still showing is told again on return
  }
}
