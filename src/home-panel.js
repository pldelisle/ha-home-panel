// Home panel for Home Assistant: a wall-tablet and phone dashboard (energy, climate, lights, weather, car, air, automations).
// Registered with panel_custom, so it runs inside the HA frontend and uses the signed-in user's connection.
// Nothing secret lives in this file: the house's entities, rooms and people come from the panel's config (see core/config.ts) or are found in hass.
import {FR_ATTR, createFrench} from './i18n/fr.js';
import {browserDefaults} from './core/i18n/browser.ts';
import {createFormatters} from './core/i18n/format.ts';
import {englishLocale, panelLocale} from './core/i18n/locale.ts';
import {plural} from './legacy/globals.js';
import {registriesOf} from './core/registry.ts';
import {doorMotionSensors} from './providers/door-motion.ts';
import {powerNow} from './providers/power.ts';
import {ensureFonts} from './fonts.js';
// Liquid Glass: whether this engine can run an SVG filter inside backdrop-filter (Chromium only)
const LENS_OK =
  typeof navigator !== 'undefined' &&
  'userAgentData' in navigator &&
  !!window.CSS &&
  window.CSS.supports('backdrop-filter', 'url(#x)');

// thermostats without an HA area: the area each Hilo room belongs to
// areas the Phone tab shows as part of another, the way Apple Home groups them: the parking spot's charger and camera live in the garage
// Tabs view: one pane per subject, for a tablet fixed to the wall. The rail, the phone's bar and the panes
// are the shell's (src/shell/features.ts); the guest fills what is inside them.
/**
 * The legacy class, the shell's guest (spec 14, ADR 0016): it implements GuestRenderer structurally (src/shell/guest.ts;
 * this file may not import the shell). It is not an element: the shell constructs it, hands it the page, the store, the
 * API client and the settings in connect(), and draws nothing for it. It writes into the shell's `.guest` container and
 * nowhere else in the shell's root.
 */
export class LegacyPanel {
  // `root` (the shell's shadow root), `host` (the <home-panel> element) and `container` (the guest's container inside the
  // root) are set by connect(); so are the services the shell owns: `store`, `api` and `settings`.
  constructor() {
    // the zone, locale and hour cycle the browser prefers, which the core does not read itself
    this.browser = browserDefaults();
    // the formatter sets (spec 11), named by their language and zone, are built once the store is known (refreshFormatters):
    //   fmt      the profile's language, the house's zone: the five sites that were already French
    //   fmtEn    English, the house's zone: every other site, because the rewrite layer parses English (deleted in phase 4)
    this.localeKey = '';
    this.frDrawn = false; // whether the panel was last drawn in French
    this.onStore = () => this.refreshFormatters();
    this.unsubStore = null; // the formatters follow the store's language and zone, subscribed in connect
    this.drawnTab = 'home'; // the tab the guest last drew its part of (tabChanged); `tab` is the shell's
    this.framed = false; // whether build() has drawn once, so the next draw asks the shell for a fresh frame
    this.cache = {}; // last innerHTML per container, to skip identical updates
  }
  // connect, disconnect, hassChanged, panelChanged, tabChanged and compactChanged are the guest's interface (spec 14,
  // GuestRenderer): the shell feeds the store itself and calls them after it did.
  // The tab and the phone shape belong to the shell, which draws the rail, the bar and the panes from them
  get tab() {
    return this.ctx.shell.tab;
  }
  get compact() {
    return this.ctx.shell.compact;
  }
  // the shell's sheet host: which sheet is open, Escape, focus return and where the detail panels sit
  get sheets() {
    return this.ctx.shell.sheets;
  }
  // the shell fed the store the new config; draw again when it is a different one (configure)
  panelChanged() {
    if (this.hass && this.configure()) this.build();
  }
  /**
   * @returns {any} loose on purpose: the class reads registry fields (hidden, platform, manufacturer, entity_category)
   * that PanelHass does not declare; typing it as PanelHass gives 43 loose-pass errors. Spec 12 grows the hass types
   * to what the panel reads; the class itself goes with phase 3.
   */
  get hass() {
    return this.store.hass;
  }
  /** @param {import('./core/store.ts').HassChange} change what the store found different; the body still reads the store itself */
  // eslint-disable-next-line no-unused-vars -- the guest's signature; the body keeps reading the store until a move rewrites it
  hassChanged(change) {
    // French follows the user's profile language; switching it redraws the panel.
    // The store's locale change is not enough here: a host may set the new language on the hass object it already
    // handed over (the harness does, on its first switch), so the store sees the same language before and after.
    // Comparing with the language this panel was drawn in catches that too.
    const fr = this.store.isFrench;
    if (fr !== this.frDrawn) {
      this.frDrawn = fr;
      if (this.$app) this.teardown();
    }
    this.configure();
    if (!this.$app) this.build();
  }
  // true when the store's config changed after the panel was drawn, so it must be drawn again; the store's generation
  // is the key (the shell fed the store the config, and the store counts its changes)
  configure() {
    const gen = this.store.generation;
    if (gen === this.generation) return false;
    this.generation = gen;
    if (!this.$app) return false;
    this.teardown();
    return true; // the caller draws it again
  }
  // forget the drawn panel so build() starts over (the language or the config changed)
  teardown() {
    this.frStop();
    this.cache = {};
    this.$app = null;
  }
  /**
   * Once per connection of the host: take the root, the host and the services from the shell's context, then subscribe.
   * The shell calls hassChanged and panelChanged after this, which draw the panel the first time.
   * (A JSDoc type reference is no import for dependency-cruiser, so naming the shell's type here breaks no rule.)
   * @param {import('./shell/guest.ts').GuestContext} ctx
   */
  connect(ctx) {
    this.ctx = ctx;
    this.root = ctx.root;
    this.host = ctx.host;
    this.container = ctx.root.querySelector('.guest'); // the one container the class draws into
    this.store = ctx.store;
    this.api = ctx.api;
    this.settings = ctx.settings;
    if (!this.french) this.french = createFrench(this.store); // the French layer of this panel, read through its store
    if (!this.unsubStore) {
      this.refreshFormatters(); // a hass may have come before this connection, or while the panel was off the page
      this.unsubStore = this.store.subscribe('*', this.onStore);
    }
  }
  disconnect() {
    if (this.unsubStore) this.unsubStore();
    this.unsubStore = null;
  }
  // the store's reads: every call site goes through these; the house lives in this panel's store, not at module scope (spec 10)
  get ROOMS() {
    return this.store.config.rooms;
  }
  get MODES() {
    return this.store.config.modes;
  }
  get CFG() {
    return this.store.config;
  }
  /**
   * The name the panel shows for an entity, an area or a device, from the store's resolver. With a fallback, an id Home
   * Assistant has no name for (and the house did not name) shows the fallback instead of the id.
   * @param {string} key
   * @param {string} [fallback]
   */
  name(key, fallback) {
    return this.store.names.name(key, fallback);
  }
  kw(id) {
    return this.store.kw(id);
  }
  // ---------- time ----------
  // Rebuilds both formatter sets when the language, the time zone or the profile's formats changed. Compared by value, not
  // by the store's locale flag, because a host may change the language on the hass object it already handed over.
  refreshFormatters() {
    const hass = this.store.hass ?? /** @type {any} */ ({config: {}});
    const locale = panelLocale(hass, this.browser),
      key = JSON.stringify(locale);
    if (key === this.localeKey) return;
    this.localeKey = key;
    this.locale = locale;
    this.localeEn = englishLocale(locale.timeZone);
    this.fmt = createFormatters(this.locale);
    this.fmtEn = createFormatters(this.localeEn);
  }
  ago(t) {
    const m = Math.round((Date.now() - Date.parse(t)) / 6e4);
    return m < 1
      ? 'just now'
      : m < 60
        ? `${m} min ago`
        : m < 1440
          ? `${Math.round(m / 60)} h ago`
          : this.fmtEn.date(new Date(t));
  }
  $(id) {
    return this.root.getElementById(id);
  }
  css(n) {
    return getComputedStyle(this.$app).getPropertyValue(n).trim();
  }
  frStart() {
    this.frStop();
    const root = this.root;
    this.frObs = new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'childList') m.addedNodes.forEach(this.french.tree);
        else this.french.node(m.target);
      }
    });
    this.frObs.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: FR_ATTR,
    });
    this.french.tree(root);
  }
  frStop() {
    if (this.frObs) this.frObs.disconnect();
    this.frObs = null;
  }
  set(id, html) {
    const el = this.$(id);
    if (el && this.cache[id] !== html) {
      this.cache[id] = html;
      el.innerHTML = html;
    }
  }

  // ---------- skeleton ----------
  build() {
    ensureFonts(); // Manrope and JetBrains Mono from the panel's own fonts/ folder, declared in the document once
    // A second draw starts from new frame elements, as when the class wrote the frame itself: no listener it wired and no card it
    // moved into a pane survives. The shell renders them at once; the first draw finds the frame the shell rendered.
    if (this.framed) this.ctx.shell.resetFrame();
    this.framed = true;
    // the shell drew the frame (the header, the rail, the panes) and, since #276, the idle clock; the guest's own container holds only the
    // lens filter. It starts empty at each draw, the filter with it, as it did since the columns went (#269); #198 draws the filter again
    this.container.innerHTML = '';
    this.$app = this.$('app');
    // `.app` is the shell's and outlives a draw, where a fresh one used to start bare: clear what the guest toggles on it
    // (the shell owns the theme, the glass wallpaper, `gl`, `txl`, `live` and `idle`)
    this.$app.classList.remove('mc');
    this.theme = this.ctx.shell.appearance.theme;
    this.$app.lang = (this.store.isFrench ? this.locale : this.localeEn).tag;
    if (this.store.isFrench) this.frStart();
    this.ctx.shell.idle.arm(); // a draw counts as a touch, as it did: the five minutes start over, and an idle panel wakes
    this.tabChanged(this.tab);
    this.lensAll();
  }

  // ---------- theme, glass and text size are the shell's (its AppearanceController); the guest hears of a change here ----------
  appearanceChanged(a) {
    if (!this.$app) return; // nothing drawn yet: the first draw reads the shell
    if (a.theme !== this.theme) {
      this.theme = a.theme;
      this.cache = {};
    }
    this.lensAll();
  }
  // Security's one read left in the legacy panel (#227): the provider's door and motion sensors over the store. Its
  // last caller is the More word, which leaves with the guest.
  doorSensors() {
    return doorMotionSensors(this.store.hass.states, registriesOf(this.store.hass), this.store.names);
  }
  // Mercury drop (v1.19.0): Chromium bends the backdrop of every glass surface with a blurred fractal-noise displacement map (the Aether CSS
  // "glass-distortion" filter, referenced from glass.css through the mc class). WebKit drops url() filters, so it keeps the frosted glass from the CSS
  lensAll() {
    const {glass, reducedTransparency} = this.ctx.shell.appearance,
      on = glass.on && LENS_OK && !reducedTransparency;
    if (!this.lensSvg) {
      this.lensSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.lensSvg.setAttribute('aria-hidden', 'true');
      this.lensSvg.style.cssText = 'position:absolute;width:0;height:0';
      this.container.appendChild(this.lensSvg);
      this.lensSvg.innerHTML =
        '<filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.008" numOctaves="2" seed="92" result="noise"/><feGaussianBlur in="noise" stdDeviation="2" result="blurred"/><feDisplacementMap in="SourceGraphic" in2="blurred" scale="150" xChannelSelector="R" yChannelSelector="G"/></filter>';
    }
    this.$app.classList.toggle('mc', on);
  }

  // The shell draws the toast (<hp-toast>, #275): this asks for one as an element does, with a `ToastEvent`'s shape (the legacy code may
  // not import the kit), in French when the panel is, as the rewrite layer made it of the light DOM. Deleted with the guest (#277).
  toast(msg, sticky) {
    this.container.dispatchEvent(
      new CustomEvent('toast', {
        bubbles: true,
        composed: true,
        detail: {message: this.french.text(msg), sticky: !!sticky},
      }),
    );
  }

  // ---------- live values ----------
  // Energy's read left in the legacy panel (#241): the provider over the store, in kW (the provider words nothing). Its last caller,
  // the More word, leaves with the guest.
  powerNow() {
    return powerNow(this.store.hass?.states ?? {}, this.store.config);
  }

  // ---------- sheets ----------
  // the sheet host tells the guest when a legacy sheet opens or closes; none is left since the room's light sheet moved (#262), and #188
  // deletes the two with the host's legacy half
  sheetOpened() {}
  sheetClosed() {}
  // ---------- Phone: the Tabs view under 600 px. Bottom tab bar, one column, summary tiles that open the detail sheets ----------
  // the shell's `compact` changed and its frame already follows
  compactChanged() {
    if (!this.$app) return; // nothing drawn yet: the first draw reads the shell
    this.cache = {};
  }
  // the word under each section in the phone's More sheet, in English, for the registry's summary
  moreLines() {
    const L = this.powerNow();
    // Media's line is the feature's own (mediaBrief, #217), and so is Air's (airBrief, #234)
    const X = this.doorSensors(),
      open = X.filter(x => x.kind === 'door' && x.on).length,
      moving = X.some(x => x.kind === 'motion' && x.on);
    const sb = {
      energy: L.grid == null ? '' : `${L.grid < 1 ? Math.round(L.grid * 1000) + ' W' : L.grid.toFixed(2) + ' kW'} now`,
      cams: [open ? plural(open, 'door') + ' open' : 'Doors closed', moving ? 'motion now' : '']
        .filter(Boolean)
        .join(' · '),
    };
    return sb;
  }
  // The sheet is an element of the shell, in a shadow root the French layer's observer does not see, so the word comes
  // over in the panel's language; `text` is the layer's own rewrite of a text node, and leaves English alone. The shell asks
  // for the six sections one after the other in one task, so one pass over the house serves them all.
  // (moreMemo goes with moreLine, deleted with the guest)
  moreLine(key) {
    if (!this.moreMemo) {
      this.moreMemo = this.moreLines();
      queueMicrotask(() => (this.moreMemo = null));
    }
    const line = this.moreMemo[key];
    return line ? this.french.text(line) : null;
  }
  // the shell shows the pane of `t` (it remembered the tab and drew the rail and the panes); this is the guest's part
  tabChanged(t) {
    if (!this.$app) return; // nothing drawn yet: build() asks again once it is
    const prev = this.drawnTab;
    this.drawnTab = t;
    this.sheets.paneShown(t); // the host shows this pane's legacy detail panel inline, on a tablet: none has one since #252, and #188 deletes this call
    // on a phone each section starts at the top, as an app's tabs do
    if (this.compact && prev && prev !== t) {
      try {
        this.$app.scrollIntoView({block: 'start'});
      } catch {}
    }
  }
  // which tabs this house lacks (false: nothing for it), for the shell's registry: the guest draws no tab since #273, so it has no opinion and the descriptors' `available` answer; #188 deletes this member with the guest interface
  availability() {
    return {};
  }
}
