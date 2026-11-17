// Home panel for Home Assistant: a wall-tablet and phone dashboard (energy, climate, lights, weather, car, air, automations).
// Registered with panel_custom, so it runs inside the HA frontend and uses the signed-in user's connection.
// Nothing secret lives in this file: the house's entities, rooms and people come from the panel's config (see core/config.ts) or are found in hass.
import {FR_ATTR, createFrench} from './i18n/fr.js';
import {autoMethods} from './auto.js';
import {sunTimes} from './core/sun.ts';
import {browserDefaults} from './core/i18n/browser.ts';
import {createFormatters} from './core/i18n/format.ts';
import {englishLocale, panelLocale} from './core/i18n/locale.ts';
import {ok, esc, plural} from './legacy/globals.js';
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

const sum = a => a.reduce((x, y) => x + (y || 0), 0);
const f1 = v => (v == null ? '–' : (+v).toFixed(1));

// thermostats without an HA area: the area each Hilo room belongs to
// areas the Phone tab shows as part of another, the way Apple Home groups them: the parking spot's charger and camera live in the garage
// Tabs view: one pane per subject, for a tablet fixed to the wall. The rail, the phone's bar and the panes
// are the shell's (src/shell/features.ts); the guest fills what is inside them.
// ---------- weather helpers ----------
const COND = {
  'clear-night': 'Clear',
  cloudy: 'Cloudy',
  fog: 'Fog',
  hail: 'Hail',
  lightning: 'Thunderstorms',
  'lightning-rainy': 'Thunderstorms and rain',
  partlycloudy: 'Partly cloudy',
  pouring: 'Heavy rain',
  rainy: 'Rain',
  snowy: 'Snow',
  'snowy-rainy': 'Rain and snow',
  sunny: 'Sunny',
  windy: 'Windy',
  'windy-variant': 'Windy and cloudy',
  exceptional: 'Unusual weather',
};
const condName = c => (!c ? '' : COND[c] || String(c).charAt(0).toUpperCase() + String(c).slice(1).toLowerCase());
// HA condition codes, or Environment Canada's own words, down to one of the drawn icons
const condKind = c => {
  const s = String(c || '').toLowerCase();
  if (COND[s])
    return {
      'clear-night': 'clear',
      sunny: 'clear',
      partlycloudy: 'part',
      cloudy: 'cloud',
      fog: 'fog',
      rainy: 'rain',
      pouring: 'rain',
      hail: 'snow',
      snowy: 'snow',
      'snowy-rainy': 'sleet',
      lightning: 'storm',
      'lightning-rainy': 'storm',
      windy: 'wind',
      'windy-variant': 'wind',
      exceptional: 'cloud',
    }[s];
  if (/thunder/.test(s)) return 'storm';
  if (/snow|flurr/.test(s) && /rain|drizzle/.test(s)) return 'sleet';
  if (/snow|flurr|ice|hail/.test(s)) return 'snow';
  if (/rain|shower|drizzle/.test(s)) return 'rain';
  if (/fog|mist|haze/.test(s)) return 'fog';
  if (/wind/.test(s)) return 'wind';
  if (/partly|mix|few|a few clouds|mainly sunny|mainly clear/.test(s)) return 'part';
  if (/cloud|overcast/.test(s)) return 'cloud';
  if (/sun|clear/.test(s)) return 'clear';
  return 'cloud';
};
const wxIcon = (c, sz = 28, day = true) => {
  const k = condKind(c),
    sun = day
      ? '<circle cx="12" cy="12" r="4.6" fill="var(--m-amber)"/><g class="rays" stroke="var(--m-amber)" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g>'
      : '<path d="M15.5 3.5a8 8 0 1 0 5 11.8A6.5 6.5 0 0 1 15.5 3.5z" fill="var(--m-blue)"/>';
  const cloud = (x = 0, y = 0, f = 'var(--fg3)') =>
    `<g class="cld"><path transform="translate(${x} ${y})" d="M7 19h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1A4.5 4.5 0 0 0 7 19z" fill="${f}"/></g>`;
  const drops =
    '<g class="drp" stroke="var(--c-home)" stroke-width="1.8" stroke-linecap="round"><path d="M8 20.5l-1 2M12 20.5l-1 2M16 20.5l-1 2"/></g>';
  const flakes =
    '<g class="flk" fill="var(--c-home)"><circle cx="7.5" cy="21.5" r="1.2"/><circle cx="12" cy="22.3" r="1.2"/><circle cx="16.5" cy="21.5" r="1.2"/></g>';
  const g = {
    clear: sun,
    part: `<g transform="translate(-3 -3) scale(.8)">${sun}</g>${cloud(1.5, 1.5)}`,
    cloud: cloud(0, -1),
    rain: cloud(0, -3) + drops,
    snow: cloud(0, -3) + flakes,
    sleet:
      cloud(0, -3) +
      '<path d="M8 20.5l-1 2M16 20.5l-1 2" stroke="var(--c-home)" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="22" r="1.2" fill="var(--c-home)"/>',
    storm:
      cloud(0, -3) +
      '<path class="bolt" d="M12.5 15.5 10 20h3l-1.5 3.5" fill="none" stroke="var(--m-amber)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    fog:
      cloud(0, -4) +
      '<g class="fog" stroke="var(--fg3)" stroke-width="1.8" stroke-linecap="round"><path d="M4 18.5h16M6 21.5h12"/></g>',
    wind: '<g class="wnd" fill="none" stroke="var(--fg3)" stroke-width="1.9" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7"/></g>',
  }[k];
  return `<svg class="wxi" width="${sz}" height="${sz}" viewBox="0 0 24 24" role="img" aria-label="${esc(condName(c))}">${g}</svg>`;
};
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
    this.onStore = () => {
      this.refreshFormatters(); // before the render, which reads them
      this.tick();
    };
    this.unsubStore = null; // the one path to the one-second render, subscribed in connect
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
    if (this.hass && this.configure()) {
      this.build();
      this.tick();
    }
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
    this.clockT = setInterval(() => this.renderIdle(), 20000);
  }
  disconnect() {
    clearInterval(this.clockT);
    if (this.unsubStore) this.unsubStore();
    this.unsubStore = null;
  }
  // the store's reads: every call site goes through these; the house lives in this panel's store, not at module scope (spec 10)
  get E() {
    return this.store.config.entities;
  }
  get ROOMS() {
    return this.store.config.rooms;
  }
  get MODES() {
    return this.store.config.modes;
  }
  get CFG() {
    return this.store.config;
  }
  st(id) {
    return this.store.state(id);
  }
  num(id) {
    return this.store.num(id);
  }
  /** @returns {any} the store returns unknown; the legacy class reads attributes it does not narrow (see get hass) */
  attr(id, a) {
    return this.store.attr(id, a);
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
    // the shell drew the frame (the header, the rail, the panes); the guest draws what is not in it: the idle clock. Its own container
    // starts empty at each draw, the lens filter with it, as it did since the columns went (#269); #198 draws the filter again
    this.container.innerHTML = '';
    this.$app = this.$('app');
    // `.app` is the shell's and outlives a draw, where a fresh one used to start bare: clear what the guest toggles on it
    // (the shell owns the theme, the glass wallpaper, `gl`, `txl`, `live` and `idle`)
    this.$app.classList.remove('mc');
    this.theme = this.ctx.shell.appearance.theme;
    this.$app.lang = (this.store.isFrench ? this.locale : this.localeEn).tag;
    if (this.store.isFrench) this.frStart();
    // The smart stack is the stack feature's element (#266), placed by its tag beside the idle clock (the Home-card bridge, ADR 0031), its
    // last use until the idle screen moves (spec 26). The header and the Home pane are the shell's since #268 and #269.
    this.$('iwrap').innerHTML =
      '<div id="iss"><div class="ssc" id="iclk"></div><div class="ssk" id="istk" hidden><hp-smart-stack mode="idle"></hp-smart-stack></div></div>';
    this.idleStackShown = false;
    this.$('istk').addEventListener('hp-empty', e => {
      this.idleStackShown = !e.detail.empty;
      this.placeIdleStack();
    });
    this.wire();
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
  // Idle clock (v1.19.6): after 5 min without a touch the wall iPad shows a big clock with the date, the temperatures and the next sun event.
  // Since 2.2.0 the current outdoor condition's icon (day or night version) sits beside the time.
  // Any touch brings the panel back; the overlay swallows that first tap so nothing underneath gets pressed. Phones never go idle.
  // The shell's idle timer (src/shell/idle-timer.ts) decides when, draws the overlay and `.app.idle`, and tells the guest here;
  // "Sleep now" in the settings popup asks it through ctx.shell.idle. The guest draws the clock into #iwrap until the clock moves.
  idleChanged(idle) {
    if (!idle) return; // the shell took `.idle` off the frame already; the overlay fades out by itself
    this.renderIdle();
  }
  // The smart stack beside the clock is the stack feature's <hp-smart-stack mode="idle"> (#266), which build() places in #istk through
  // the Home-card bridge (ADR 0031), its last use until the idle screen moves (spec 26): while it has a card the clock and the card sit
  // side by side (`.ss`), else the clock is alone, as the legacy `renderIdle` laid them out.
  placeIdleStack() {
    const wrap = this.$('iss'),
      slot = this.$('istk');
    if (!wrap || !slot) return;
    wrap.className = this.idleStackShown ? 'ss' : '';
    slot.hidden = !this.idleStackShown;
  }
  renderIdle() {
    if (!this.$app || !this.hass || !this.$app.classList.contains('idle')) return;
    const now = new Date(),
      fr = this.store.isFrench;
    const t = fr ? [this.fmt.time24(now)] : this.fmtEn.time(now).split(' ');
    const dateStr = (fr ? this.fmt : this.fmtEn).dateLong(now),
      L = this.powerNow();
    const ins = L.rooms.map(r => r.temperature).filter(v => v != null),
      outT = this.attr(this.E.weather, 'temperature') ?? this.num(this.E.outT);
    const cond = this.st(this.E.cond),
      w = this.st(this.E.weather),
      c = ok(cond) ? cond.state : ok(w) ? w.state : null;
    const temps = [
      ins.length ? `${(sum(ins) / ins.length).toFixed(1)}° inside` : '',
      outT == null ? '' : `${f1(outT)}° outside`,
    ]
      .filter(Boolean)
      .join(' · ');
    const sun = this.st(this.E.sun),
      day = !sun || sun.state === 'above_horizon'; // the sun is up (or unknown)
    const icon = c ? `<span class="iwx">${wxIcon(c, 120, day)}</span>` : '';
    const ms = now.getTime(),
      d = this.sunDay(0),
      d1 = this.sunDay(1);
    const next = ms < d.rise ? ['Sunrise', d.rise] : ms < d.set ? ['Sunset', d.set] : ['Sunrise', d1.rise];
    const clock = `<div class="iclock num">${t[0]}<small>${t[1] || ''}</small></div>`;
    this.set(
      'iclk',
      `${icon ? `<div class="iclk2">${icon}${clock}</div>` : clock}<div class="idate">${esc(dateStr)}</div>${temps ? `<div class="itemps">${temps}</div>` : ''}${next[1] ? `<div class="isun">${next[0]} ${this.fmtEn.time(new Date(next[1]))}</div>` : ''}`,
    );
    // the block drifts a little on every tick so the OLED-less iPad still never shows the same pixels for hours
    const x = Math.round(Math.random() * 40 - 20),
      y = Math.round(Math.random() * 30 - 15);
    this.$('iwrap').style.transform = `translate(${x}px,${y}px)`;
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

  // ---------- events ----------
  wire() {
    this.$('pane-auto').addEventListener('click', e => {
      const r = e.target.closest('[data-run]'),
        c = e.target.closest('[data-au]'),
        x = e.target.closest('[data-auclose]');
      if (!r && !c && !x) return;
      this.auSel = x ? null : r ? {item: r.dataset.item, run: r.dataset.run} : {item: c.dataset.au, run: null};
      this.cache.auhost = null;
      this.auLoad(true);
      this.renderAuto();
      if (!x) {
        const h = this.$('auhost');
        const card = h && h.querySelector('.ausel');
        if (card) card.scrollIntoView({behavior: 'smooth', block: 'start'});
      }
    });
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

  // ---------- live rendering, throttled ----------
  tick() {
    if (this.tickQ) return;
    const wait = Math.max(0, 1000 - (Date.now() - (this.lastTick || 0)));
    this.tickQ = setTimeout(() => {
      this.tickQ = null;
      this.lastTick = Date.now();
      this.renderLive();
    }, wait);
  }
  renderLive() {
    if (!this.hass) return;
    this.renderTabs();
  }

  // ---------- live values ----------
  // Energy's read left in the legacy panel (#241): the provider over the store, in kW (the provider words nothing). Its callers leave
  // with the idle clock (spec 26) and the More word (the guest).
  powerNow() {
    return powerNow(this.store.hass?.states ?? {}, this.store.config);
  }

  // ---------- sheets ----------
  // the sheet host tells the guest when a legacy sheet opens or closes; none is left since the room's light sheet moved (#262), and #188
  // deletes the two with the host's legacy half
  sheetOpened() {}
  sheetClosed() {}
  // Temporary until the idle clock moves (spec 26): the sun's day at the house
  sunDay(offset = 0) {
    const lat = (this.hass.config && this.hass.config.latitude) ?? 0,
      lon = (this.hass.config && this.hass.config.longitude) ?? 0;
    const t = Date.now() + offset * 864e5;
    return sunTimes(lat, lon, this.fmtEn.isoDay(t));
  }
  // ---------- Phone: the Tabs view under 600 px. Bottom tab bar, one column, summary tiles that open the detail sheets ----------
  // the shell's `compact` changed and its frame already follows
  compactChanged() {
    if (!this.$app) return; // nothing drawn yet: the first draw reads the shell
    this.cache = {};
    this.renderLive();
  }
  // the word under each section in the phone's More sheet, in English, for the registry's summary
  moreLines() {
    const L = this.powerNow();
    // Media's line is the feature's own (mediaBrief, #217), and so is Air's (airBrief, #234)
    const X = this.doorSensors(),
      open = X.filter(x => x.kind === 'door' && x.on).length,
      moving = X.some(x => x.kind === 'motion' && x.on);
    const A = this.auAutos ? this.auAutos() : [],
      running = A.filter(a => a.current).length;
    const sb = {
      energy: L.grid == null ? '' : `${L.grid < 1 ? Math.round(L.grid * 1000) + ' W' : L.grid.toFixed(2) + ' kW'} now`,
      cams: [open ? plural(open, 'door') + ' open' : 'Doors closed', moving ? 'motion now' : '']
        .filter(Boolean)
        .join(' · '),
      auto: running ? `${running} running` : A.length ? plural(A.length, 'automation') : '',
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
    this.renderTabs();
    // on a phone each section starts at the top, as an app's tabs do
    if (this.compact && prev && prev !== t) {
      try {
        this.$app.scrollIntoView({block: 'start'});
      } catch {}
    }
  }
  renderTabs() {
    if (!this.$app || !this.hass) return;
    try {
      this.renderAuto();
    } catch (e) {
      console.error('home-panel tabs', 'renderAuto', e);
    }
  }
  // which tabs this house lacks (false: nothing for it), for the shell's registry: none of the tabs the guest still draws has an opinion, Climate's and Car's are their descriptors' `available`
  availability() {
    return {};
  }
}

Object.assign(LegacyPanel.prototype, autoMethods);
