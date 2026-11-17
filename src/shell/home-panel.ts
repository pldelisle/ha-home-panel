// <home-panel>, the one element Home Assistant mounts: it owns the store, the API client, the settings and the optimistic values, provides them through context and draws the frame from the registry in its one shadow root.
// Pattern: composition root (Seemann, Dependency Injection Principles, Practices, and Patterns); humble object (Meszaros, xUnit Test Patterns): it forwards `hass`, `panel` and `narrow` and decides nothing the registry and the store decide.
// It reads `localStorage` and the browser's locale defaults. It owns `tab`, `compact`, the idle state, which tabs the house shows, whether the settings popup and the Status checks are open, whether a live activity runs and, through controllers, the appearance and the open sheet.
// Must not: decide what the store and the models decide. The legacy panel it hosted as its guest is gone (#277, ADR 0035).
import {LitElement, html, unsafeCSS, type PropertyValues, type TemplateResult} from 'lit';
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
import {ENGLISH_TAG, panelLocale} from '../core/i18n/locale.ts';
import {createSettings, type KeyValueStorage} from '../core/settings.ts';
import {createStatisticsCache, STATISTICS_TTL_MS} from '../core/statistics-cache.ts';
import type {ForecastEntry} from '../core/ha.ts';
import {createStore} from '../core/store.ts';
import {MediaQueryController} from '../ui/controllers/media-query.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {
  apiContext,
  forecastContext,
  optimisticContext,
  settingsContext,
  statisticsCacheContext,
  storeContext,
  type Appearance,
} from '../ui/contexts.ts';
import {OverlayStore} from '../ui/overlay-store.ts';
import {ico} from '../ui/icons.ts';
import type {SheetDismissEvent, SheetRequestEvent, TabSelectEvent, ToastEvent} from '../ui/events.ts';
import {AppearanceController} from './appearance.ts';
import type {FeatureDescriptor, FeatureEnv, FeatureKey} from '../ui/feature.ts';
import {FEATURES, UNDER_MORE, isFeatureKey, visibleTab} from './features.ts';
import {FRAME_CSS} from './frame-styles.ts';
import './idle-screen.ts'; // defines <hp-idle-screen>
import {IdleTimer, type IdleState} from './idle-timer.ts';
import {headerStyles, type SettingsToggleEvent} from './header.ts'; // defines <hp-header>
import {homePaneStyles} from './home-pane.ts';
import type {ForecastEvent} from '../features/weather/forecast-controller.ts';
import {STATUS_SHEET, type LiveActivitiesEvent} from '../features/live/index.ts'; // defines <hp-live-pill> and <hp-status-popup>
import './more-sheet.ts'; // defines <hp-more-sheet>
import '../ui/pane-header.ts'; // defines <hp-pane-header>
import {SheetMediator} from './sheet-host.ts';
import {ensureFonts} from '../ui/fonts.ts';
import {lens} from '../ui/lens.ts';
import '../ui/toast.ts'; // defines <hp-toast>
import {expiry, nextToast, type ToastAction, type ToastState} from '../ui/toast-schedule.ts';

/** The panel Home Assistant hands over with the config the `panel_custom:` block carried. */
interface PanelInfo {
  config?: unknown;
}

// The phone's shape: the bar at the bottom, one column. The stylesheet's `.cp` rules are written for the same width.
const PHONE = '(max-width:599px)';
// The device's own appearance: dark, and less transparency. The theme follows the first on auto; the glass lens yields to the second.
const DARK = '(prefers-color-scheme: dark)';
const REDUCED_TRANSPARENCY = '(prefers-reduced-transparency: reduce)';
// Liquid Glass's Mercury drop (v1.19.0): whether this engine runs an SVG filter inside backdrop-filter (Chromium only); WebKit drops
// url() filters and keeps the frosted glass of the CSS. Asked once: the engine does not change.
const LENS_OK =
  typeof navigator !== 'undefined' && 'userAgentData' in navigator && CSS.supports('backdrop-filter', 'url(#x)');
// the phone's More sheet, the first element sheet of the host
const MORE_SHEET = 'shell.more';

// The one adapter wiring for storage: only src/core/settings.ts reads or writes it. Blocked site data makes touching
// localStorage throw, so the settings then keep their defaults.
function browserStorage(): KeyValueStorage {
  try {
    return localStorage;
  } catch {
    return {getItem: () => null, setItem: () => {}};
  }
}

// the browser's defaults, read once, for the store's formats
function storeOptions() {
  const {timeZone, browserLocale, browserHour12} = browserDefaults();
  return {defaultTimeZone: timeZone, browserLocale, browserHour12, resolve: resolveConfig};
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
    settingsOpen: {state: true},
    statusOpen: {state: true},
    toastNow: {state: true},
    liveKey: {state: true},
    attention: {state: true},
  };
  declare hass: PanelHass | undefined;
  declare narrow: boolean;
  declare panel: PanelInfo | undefined;
  /** The tab asked for, as the settings remember it: a hidden or unknown one shows Home (`tab`). */
  declare private selected: string;
  /** Counts the panel's fresh draws (a new config or language after the first): the frame is keyed on it, so each starts with new elements. */
  declare private epoch: number;
  /** The idle timer's state, drawn as `.app.idle`, the overlay's `hidden` and its `wake` class, and handed to <hp-idle-screen>. */
  declare private idleState: IdleState;
  /** The settings popup behind the gear is open. */
  declare private settingsOpen: boolean;
  /** The Status checks under the live pill are open: a popup, as the settings are, so a sheet opens over it and Escape closes the sheet first. */
  declare private statusOpen: boolean;
  /** The toast showing, from the last `ToastEvent` through the pure schedule; null when none is. */
  declare private toastNow: ToastState;
  /** Counts the live pill's changes, which the header redraws its weather chip at; with `liveRunning`, whether an activity shows. */
  declare private liveKey: number;
  /** How many Status checks need attention, which the Home pane's heading says. */
  declare private attention: number;
  private liveRunning = false;

  // The frame's rules (the rail, the panes, the overlays, the glass), then the Home pane's and the header's, which draw in this
  // root's light DOM (ADR 0032, ADR 0033). Lit adopts them once for every instance, as constructed sheets.
  static override styles = [unsafeCSS(FRAME_CSS), homePaneStyles, headerStyles];

  // this panel's services, none shared with another panel (ADR 0012)
  private readonly store = createStore(storeOptions());
  private readonly api = createApi(this.store);
  /** The one memo of the recorder's reads for this panel (ADR 0028); a reply stays fresh as long as a feature keeps its history. */
  /** Each reply moves the header's "Live · history" time, and the first turns the settings popup's version line to "kept fresh". */
  private readonly statistics = createStatisticsCache(this.api, {
    ttlMs: STATISTICS_TTL_MS,
    onLoad: () => this.requestUpdate(),
  });
  private readonly settings = createSettings(browserStorage());
  // what the household asked for and Home Assistant has not confirmed yet: the panel's elements share it (ADR 0023)
  private readonly optimistic = new OverlayStore();
  /** The daily forecast the Weather pane's subscription last heard, for the elements that read tomorrow (ADR 0030). */
  private readonly forecast: ContextProvider<typeof forecastContext>;
  // The shell draws again when a registry, the language or the user changes: it reads no entity itself; the descriptors' `available`
  // is asked at every change (`onAvailability`). It passes the store itself because
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
  // which sheet is open, Escape and where focus goes back to; the shell registers its two popups with it
  private readonly sheets = new SheetMediator(this, {
    root: () => this.renderRoot as ShadowRoot,
    paneOf: id => FEATURES.find(f => f.detailSheet === id)?.key,
    compact: () => this.compact,
    setTab: key => this.setTab(key),
  });
  // the rail's buttons wait for the first answer about the house (`connectFrame`), so no tab shows for a frame and goes
  private answered = false;
  // what the frame was last drawn for: the store's config generation and the language; a change after the first draw starts it over
  private drawnFor: string | undefined;
  private settingsOff: (() => void) | undefined;
  private statusOff: (() => void) | undefined;
  private availabilityOff: (() => void) | undefined;
  // which tabs this house shows, asked of the descriptors when the answer may have changed (the store told us)
  private stale = true;
  private shown: Readonly<Partial<Record<FeatureKey, boolean>>> = {};
  private visible: FeatureKey = 'home';
  private toldTab: FeatureKey | undefined;
  private activeEpoch = -1;
  private toldCompact = false;
  // the appearance as the last render drew it
  private drawn: Appearance | undefined;
  private phoneNow = false;
  private idleCompact = this.phone.matches; // what the idle timer was last told about the phone's shape
  // the word under each section of the More sheet, asked of the descriptors when the sheet opens
  private moreSummaries: Readonly<Partial<Record<FeatureKey, string | null>>> = {};
  private moreWasOpen = false;
  // the one timer of this panel's toast: it sends `expire` when the schedule says a done toast goes
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  /** What a descriptor may read: this panel's store and the sheet host's answers. */
  private get env(): FeatureEnv {
    return {
      store: this.store,
      sheetOpen: id => this.sheets.isOpen(id),
      sheetDetail: id => this.sheets.detail(id),
      attention: this.attention,
    };
  }

  constructor() {
    super();
    this.narrow = false;
    this.selected = this.settings.get().tab;
    this.epoch = 0;
    this.idleState = 'active';
    this.settingsOpen = false;
    this.statusOpen = false;
    this.toastNow = null;
    this.liveKey = 0;
    this.attention = 0;
    // each provider adds itself to this element as a controller and answers the context requests of every element below
    new ContextProvider(this, {context: storeContext, initialValue: this.store});
    new ContextProvider(this, {context: apiContext, initialValue: this.api});
    new ContextProvider(this, {context: statisticsCacheContext, initialValue: this.statistics});
    new ContextProvider(this, {context: settingsContext, initialValue: this.settings});
    new ContextProvider(this, {context: optimisticContext, initialValue: this.optimistic});
    this.forecast = new ContextProvider(this, {context: forecastContext, initialValue: []});
    // The store starts from the empty config, so a panel that arrives with none is no change; the store counts its
    // first config as one even then, which would make the frame draw a second time for nothing.
    this.store.setPanelConfig({});
  }

  /** The tab shown: the one chosen, or Home when this house hides it or the settings name no tab. */
  get tab(): FeatureKey {
    return this.visible;
  }

  /** Under 600 px wide: the phone's shape. */
  get compact(): boolean {
    return this.phoneNow;
  }

  /** Shows a tab: remembers it and draws the frame with its pane open. */
  private setTab(key: FeatureKey): void {
    this.selected = isFeatureKey(key) ? key : 'home';
    this.settings.set('tab', this.selected);
    this.idle.arm();
    this.flush();
  }

  private requestFrame(): void {
    this.stale = true;
    this.requestUpdate();
  }

  // A new config or language draws the frame anew, as the legacy panel's draw did (ADR 0016): new elements, the sheets
  // and the popups closed. The update runs now, so the frame is new before anything else reads it.
  private resetFrame(): void {
    this.sheets.forget(MORE_SHEET);
    this.statusOpen = false;
    this.settingsOpen = false;
    this.epoch++;
    this.flush();
  }

  // arrow fields, so the template hands the same functions at every render

  // the sheet's Close button, its backdrop and its swipe: the host closes it, if it is still the sheet that is open
  private readonly onMoreClose = (): void => this.sheets.close(MORE_SHEET);

  // The header's gear opens and closes the popup, and closes the Status checks, which never stay open beside it from the gear; its Sleep now
  // closes it and starts the idle clock. Escape reaches it through the sheet host (registered after the Status checks, so those close first),
  // and a tap outside closes it (`onTapOutside`). Arrow fields, so the template hands the same functions at every render.
  private readonly toggleSettings = (e: SettingsToggleEvent): void => {
    e.stopPropagation();
    this.settingsOpen = !this.settingsOpen;
    this.statusOpen = false;
  };

  private closeSettings(): void {
    this.settingsOpen = false;
  }

  // the Status checks: the pill opens and closes them, a tap outside and Escape close them
  private closeStatus(): void {
    this.statusOpen = false;
  }

  private readonly onSleepNow = (): void => {
    this.settingsOpen = false;
    this.idle.sleepNow();
  };

  // a tile of the More sheet or the Home card's header asks for a tab: the More sheet closes (a no-op when it is not open), then the tab shows
  private readonly onTabSelect = (e: TabSelectEvent): void => {
    this.sheets.close(MORE_SHEET);
    this.setTab(e.detail.key);
  };

  // an element asked upward for a sheet, or for the toast; the event stops here, it is the panel's business
  private readonly onSheetRequest = (e: SheetRequestEvent): void => {
    e.stopPropagation();
    const {id, detail} = e.detail;
    // the Status checks are a popup the shell keeps, not a sheet: a sheet opened after them leaves them open beneath it
    if (id === STATUS_SHEET) this.statusOpen = true;
    else this.sheets.open(id, detail);
  };

  // A pane whose detail sheet is open while another tab is shown (Home's card opens Weather's, on a phone), or one of the sheets it
  // draws over the screen (a tile's history, opened from that detail), stays in the page, behind the sheet, so the sheet is drawn and
  // the tab is not changed; the pane draws only its sheets then.
  private sheetBehind(f: FeatureDescriptor): boolean {
    if (this.tab === f.key) return false;
    const detail = f.detailSheet !== undefined && this.compact && this.sheets.isOpen(f.detailSheet);
    return detail || (f.overSheets ?? []).some(id => this.sheets.isOpen(id));
  }

  // an element's sheet asks to close (its Close button, its backdrop, its swipe)
  private readonly onSheetDismiss = (e: SheetDismissEvent): void => {
    e.stopPropagation();
    if (e.detail.id === STATUS_SHEET) this.closeStatus();
    else this.sheets.close(e.detail.id);
  };

  // The live pill counts what runs and what needs attention: the header's weather chip slims while an activity shows, drawn anew at each
  // change (`liveKey`), and the Home pane's heading says the count.
  private readonly onLiveActivities = (e: LiveActivitiesEvent): void => {
    e.stopPropagation();
    this.liveRunning = e.detail.count > 0;
    this.attention = e.detail.attention;
    this.liveKey++;
  };

  // A tap outside the Status checks closes them (a tap on the pill stops at the pill), and one outside the settings popup and its gear
  // closes that, as the legacy panel's listener on the root did (deleted in #269).
  private readonly onTapOutside = (e: MouseEvent): void => {
    const path = e.composedPath();
    if (!path.some(n => n instanceof Element && n.localName === 'hp-status-popup')) this.closeStatus();
    if (this.settingsOpen && !path.some(n => n instanceof Element && (n.id === 'setpop' || n.id === 'gear')))
      this.closeSettings();
  };

  // the Weather pane's controller owns the forecast: the shell hands the daily one on to the elements that read tomorrow (ADR 0030)
  private readonly onForecast = (e: ForecastEvent): void => {
    e.stopPropagation();
    // the entries are the API client's, which the weather provider's type only widens (`datetime` may be a number there)
    if (e.detail.type === 'daily') this.forecast.setValue(e.detail.forecast as readonly ForecastEntry[]);
  };

  // Each panel draws its own toast from the events of its own root, so two panels on one page never show each other's.
  private readonly onToast = (e: ToastEvent): void => {
    e.stopPropagation();
    this.toastAct({type: 'show', message: e.detail.message, sticky: e.detail.sticky});
  };

  private readonly onToastDismiss = (e: Event): void => {
    e.stopPropagation();
    this.toastAct({type: 'dismiss'});
  };

  // the schedule decides; the shell keeps the one timer it asks for, a new toast's in place of the old one's
  private toastAct(action: ToastAction): void {
    this.toastNow = nextToast(this.toastNow, action, Date.now());
    clearTimeout(this.toastTimer);
    const at = expiry(this.toastNow);
    this.toastTimer = at === null ? undefined : setTimeout(() => this.toastAct({type: 'expire'}), at - Date.now());
  }

  // Lit renders in a microtask. A tab's pane and a fresh frame are drawn at once, through the hook Lit documents for taking
  // over the timing of an update, so the pane told it is active is the one in the page.
  private flush(): void {
    if (!this.hasUpdated) return;
    this.requestUpdate();
    this.performUpdate();
  }

  private tellTab(): void {
    const prev = this.toldTab;
    this.toldTab = this.visible;
    this.syncActive();
    // on a phone each section starts at the top, as an app's tabs do (the legacy panel's tabChanged)
    if (this.compact && prev !== undefined && prev !== this.visible)
      this.renderRoot.querySelector('#app')?.scrollIntoView({block: 'start'});
  }

  // A pane whose element has an `active` property is told whether it is the one on screen; it pauses its store
  // controller while it is not.
  private syncActive(): void {
    this.activeEpoch = this.epoch;
    for (const f of FEATURES) {
      const first = this.renderRoot.querySelector(`#pane-${f.key}`)?.firstElementChild as {active?: boolean} | null;
      if (first && 'active' in first) first.active = f.key === this.visible;
    }
  }

  protected override willUpdate(): void {
    this.phoneNow = this.phone.matches;
    // More is a phone sheet: the shape left the phone, so it closes, as compactChanged hid every open sheet
    if (!this.phoneNow) this.sheets.close(MORE_SHEET);
    // told here and not in `updated`: the timer's change lands in this very update
    if (this.phoneNow !== this.idleCompact) {
      this.idleCompact = this.phoneNow;
      this.idle.compactChanged(this.phoneNow);
    }
    if (this.answered && this.stale) {
      this.stale = false;
      const {env} = this;
      this.shown = Object.fromEntries(FEATURES.map(f => [f.key, f.available?.(env) ?? true]));
    }
    const before = this.visible;
    this.visible = visibleTab(this.selected, this.shown);
    // Another tab shows by another road than a tile of More (a card of Home, a house that stopped showing it): More closes,
    // as the legacy panel's tabChanged hid it. No screen reaches this road today, so no test does.
    if (this.visible !== before) this.sheets.close(MORE_SHEET);
    // More opens with the words under its sections as they are now
    const more = this.sheets.isOpen(MORE_SHEET);
    if (more && !this.moreWasOpen) {
      const {env} = this;
      this.moreSummaries = Object.fromEntries(UNDER_MORE.map(f => [f.key, f.summary?.(env) ?? null]));
    }
    this.moreWasOpen = more;
  }

  // `.app#app` sits outside `keyed`: it is the one frame element a fresh draw keeps; the wrap inside is new at each draw. `mc`
  // turns the Mercury drop on (glass.css), whose filter is `lens`, drawn once and kept through every draw (#198).
  protected override render() {
    const a = (this.drawn = this.appearance.value);
    const {hass} = this.store;
    const lang = this.store.isFrench && hass ? panelLocale(hass, browserDefaults()).tag : ENGLISH_TAG;
    return html`<div
      class="app ${classMap({
        narrow: this.narrow,
        cp: this.compact,
        tabsv: true,
        idle: this.idleState === 'idle',
        gl: a.glass.on,
        txl: a.largeText,
        live: a.live,
        mc: a.glass.on && LENS_OK && !a.reducedTransparency,
      })}"
      id="app"
      lang=${lang}
      data-theme=${a.theme}
      data-wp=${ifDefined(a.glass.wallpaper ?? undefined)}
      @sheet-request=${this.onSheetRequest}
      @sheet-dismiss=${this.onSheetDismiss}
      @tab-select=${this.onTabSelect}
      @toast=${this.onToast}
      @weather-forecast=${this.onForecast}
      @live-activities=${this.onLiveActivities}
      @settings-toggle=${this.toggleSettings}
      @sleep-now=${this.onSleepNow}
      @click=${this.onTapOutside}
    >
      ${keyed(this.epoch, this.renderWrap())} ${lens}
      <hp-toast
        .open=${this.toastNow !== null}
        .message=${this.toastNow?.message ?? ''}
        .sticky=${this.toastNow?.sticky === true}
        .dismissLabel=${this.store.t('common.dismiss')}
        @toast-dismiss=${this.onToastDismiss}
      ></hp-toast>
      <hp-more-sheet
        .features=${UNDER_MORE}
        .shown=${this.shown}
        .summaries=${this.moreSummaries}
        .current=${this.tab}
        .open=${this.sheets.isOpen(MORE_SHEET)}
        @sheet-close=${this.onMoreClose}
      ></hp-more-sheet>
      ${this.renderIdle()}
      <span
        id="txprobe"
        aria-hidden="true"
        style="position:absolute;left:-9999px;visibility:hidden;font-size:17px;font:-apple-system-body"
      ></span>
    </div>`;
  }

  // The idle clock's overlay, a child of `.app` so the frame fades behind it (`.app.idle > :not(.idle)`). It is visible while
  // idle and while waking, when it fades out and swallows the tap that woke the panel; what it shows is <hp-idle-screen>'s (#276).
  private renderIdle(): TemplateResult {
    return html`<div
      class="idle ${classMap({wake: this.idleState === 'waking'})}"
      id="idle"
      ?hidden=${this.idleState === 'active'}
      aria-hidden="true"
    >
      <hp-idle-screen .state=${this.idleState}></hp-idle-screen>
    </div>`;
  }

  // The header (<hp-header>, #269) and the tabs: the rail and one pane per feature, each its element. The live pill and the Status popup
  // are the live feature's elements (#256), the popup one the shell keeps open (`statusOpen`); so is the settings popup (`settingsOpen`).
  private renderWrap(): TemplateResult {
    return html`<div class="wrap">
      <hp-header
        .statusOpen=${this.statusOpen}
        .settingsOpen=${this.settingsOpen}
        .live=${this.liveRunning}
        .liveKey=${this.liveKey}
        .historyAt=${this.statistics.lastLoadedAt}
      ></hp-header>
      <div class="tabview" id="tabview">
        ${this.renderRail()}
        <div class="panes">
          ${repeat(
            FEATURES,
            f => f.key,
            f =>
              html`<section
                class="pane pane-${f.key} ${this.sheetBehind(f) ? 'behind' : ''}"
                id="pane-${f.key}"
                ?hidden=${this.tab !== f.key && !this.sheetBehind(f)}
              >
                ${f.pane(this.env)}
              </section>`,
          )}
        </div>
      </div>
    </div>`;
  }

  // The rail on a tablet, the bar on a phone. Before the first answer about the house, every button is hidden: a tab
  // that shows for a moment is a tab a frame can catch.
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
            ?hidden=${!this.answered || this.shown[f.key] === false}
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
        @click=${() => this.sheets.open(MORE_SHEET)}
      >
        ${ico(section?.icon ?? 'more', 24)}<span
          >${section ? t(section.shortTitle ?? section.title) : t('nav.more')}</span
        >
      </button>
    </nav>`;
  }

  // the frame is in the page now: the fonts go into the document, the popups register, and the house is asked about
  protected override firstUpdated(): void {
    this.connectFrame();
  }

  private connectFrame(): void {
    if (!this.isConnected) return;
    ensureFonts(); // Manrope and JetBrains Mono from the panel's own fonts/ folder, declared in the document once
    // Escape tries the popups in the order they registered: the Status checks close first, then the settings
    this.statusOff?.();
    this.statusOff = this.sheets.registerPopup({isOpen: () => this.statusOpen, close: () => this.closeStatus()});
    this.settingsOff?.();
    this.settingsOff = this.sheets.registerPopup({isOpen: () => this.settingsOpen, close: () => this.closeSettings()});
    this.answered = true;
    this.phoneNow = this.phone.matches;
    this.toldCompact = this.phoneNow;
    this.toldTab = this.visible;
    this.requestFrame(); // the descriptors answer about the house from here on
    this.availabilityOff?.();
    this.availabilityOff = this.store.subscribe('*', this.onAvailability);
  }

  // A tab a descriptor's `available` gates (Climate, Car) appears when its entity does: every change asks those descriptors, and the
  // rail is drawn again only when an answer moved, as the legacy tiles' check asked the shell until the Home move (#268).
  private readonly onAvailability = (): void => {
    const {env} = this;
    if (FEATURES.some(f => f.available && f.available(env) !== (this.shown[f.key] ?? true))) this.requestFrame();
  };

  // The store takes each value in the order the properties were set (Lit keeps the changed properties in the order they were
  // first set), and the frame is drawn anew after each when the config or the language it was drawn for changed. Home Assistant
  // sets `panel` before `hass`, so there the frame draws once with the config; the harness sets `hass` first, so there it draws
  // once without it and again with it, as the legacy panel did (ADR 0016). The frame exists only after `firstUpdated`, so the
  // store is fed here: feeding it before would turn the harness's two draws into one.
  protected override updated(changed: PropertyValues<this>): void {
    if (!this.answered) return;
    for (const key of changed.keys()) {
      if (key === 'hass' && this.hass) {
        this.store.setHass(this.hass);
        this.drawIfNew();
      }
      if (key === 'panel') {
        // a new config is a new generation, and the replies cached under the old one go (StatisticsCache.clear)
        if (this.store.setPanelConfig(this.panel?.config)) this.statistics.clear();
        this.drawIfNew();
      }
    }
    // the frame already follows the phone's shape (`cp`): the open sheet closes and the panels move
    if (this.compact !== this.toldCompact) {
      this.toldCompact = this.compact;
      this.sheets.compactChanged();
    }
    // a tab the house does not show gives way to Home, and comes back when the house shows it again
    if (this.visible !== this.toldTab) this.tellTab();
    else if (this.epoch !== this.activeEpoch) this.syncActive();
  }

  // A draw counts as a touch, as it did: the five minutes start over, and an idle panel wakes. Nothing draws before the first hass.
  private drawIfNew(): void {
    if (!this.store.hass) return;
    const key = `${this.store.generation}|${this.store.isFrench}`;
    if (key === this.drawnFor) return;
    if (this.drawnFor !== undefined) this.resetFrame();
    this.drawnFor = key;
    this.idle.arm();
  }

  // Lit calls this on the first connection too, before the first update; `firstUpdated` connects the frame then. A later
  // connection is a reconnect.
  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.connectFrame();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.statusOff?.();
    this.statusOff = undefined;
    this.availabilityOff?.();
    this.availabilityOff = undefined;
    this.settingsOff?.();
    this.settingsOff = undefined;
    // the toast goes with the panel: no timer runs for a panel off the page
    clearTimeout(this.toastTimer);
    this.toastTimer = undefined;
    this.toastNow = null;
  }
}
