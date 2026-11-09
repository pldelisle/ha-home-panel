// AppearanceController: the shell's theme, glass, text size, page background and `live` class, gathered into one frozen Appearance.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers) wrapping what were six methods of the legacy class; it
// provides its value by context (ADR 0018, after the Context Protocol) and the pure rules of appearance-rules.ts decide.
// Must not: read localStorage (the settings module does), hold a rule (the rules do), or write into a guest container.
import {ContextProvider} from '@lit/context';
import type {LitElement, ReactiveController} from 'lit';
import {createFormatters} from '../core/i18n/format.ts';
import {englishLocale} from '../core/i18n/locale.ts';
import type {PanelSettings} from '../core/settings.ts';
import type {PanelStore} from '../core/store.ts';
import {sunTimes, type SunTimes} from '../core/sun.ts';
import {appearanceContext, type Appearance} from '../ui/contexts.ts';
import type {MediaQueryController} from '../ui/controllers/media-query.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {glassDensity, glassWallpaper, isDark, textScale} from './appearance-rules.ts';
import {skyWallpaper} from './sky.ts';

/** The element that hosts the controller: Home Assistant's `narrow` is one of its properties. */
export type AppearanceHost = LitElement & {narrow: boolean};

export interface AppearanceOptions {
  store: PanelStore;
  settings: PanelSettings;
  /** Under 600 px: the shell's own query, so the frame and the appearance cannot disagree. */
  compact: MediaQueryController;
  dark: MediaQueryController;
  reducedTransparency: MediaQueryController;
}

// The touches that keep `live` on; the scroll, which does not bubble out of a pane, is listened to on the window.
const TOUCHES = ['pointerdown', 'wheel', 'keydown'];
// A touch keeps the `live` class for a minute: the frame shows what it shows only while somebody is there.
const LIVE_MS = 60000;
// The sky wallpaper follows the clock, and the sun entity says so only every few minutes: look again once a minute.
const CLOCK_MS = 60000;
// Where the sun does not rise or set, or before any hass: the sky is Lake.
const NO_SUN: Pick<SunTimes, 'rise' | 'set' | 'dawn' | 'dusk'> = {rise: null, set: null, dawn: null, dusk: null};

const same = (a: Appearance, b: Appearance): boolean =>
  a.theme === b.theme &&
  a.compact === b.compact &&
  a.narrow === b.narrow &&
  a.glass.wallpaper === b.glass.wallpaper &&
  a.glass.density === b.glass.density &&
  a.textScale === b.textScale &&
  a.reducedTransparency === b.reducedTransparency &&
  a.live === b.live;

export class AppearanceController implements ReactiveController {
  private current: Appearance;
  private readonly provider: ContextProvider<typeof appearanceContext>;
  private readonly options: AppearanceOptions;
  private touched = false;
  private liveTimer: ReturnType<typeof setTimeout> | undefined;
  private probePx = Number.NaN; // the text probe's size; NaN is "not read", which the rule takes as the body size
  private staleProbe = true;
  private applied: Appearance | undefined;
  private pageKey: string | undefined;
  private pageFrame = 0;
  private stops: (() => void)[] = [];
  private clock: ReturnType<typeof setInterval> | undefined;
  private isoDayZone = '';
  private isoDayOf: ((t: number) => string) | undefined;

  constructor(
    private readonly host: AppearanceHost,
    options: AppearanceOptions,
  ) {
    this.options = options;
    host.addController(this);
    this.current = this.compute();
    this.provider = new ContextProvider(host, {context: appearanceContext, initialValue: this.current});
    // The sun decides the theme on auto and, with the weather, the sky wallpaper; the ids are asked again when the
    // config changes, so a house that names its own sun entity is followed. The controller hears of nothing else.
    new StoreController(host, {
      store: options.store,
      ids: ({config}) => [config.entities.sun, config.entities.weather].filter((id): id is string => id !== null),
    });
  }

  /** How the panel looks now. Replaced, never changed, so a holder compares it by reference. */
  get value(): Appearance {
    return this.current;
  }

  hostConnected(): void {
    const {settings} = this.options;
    const root = this.host.renderRoot;
    // The four touches the legacy class listened to. The idle timer's ticket (#165) owns the same four and gives them
    // to this controller through one subscription, which deletes these.
    for (const type of TOUCHES) root.addEventListener(type, this.onTouch, {passive: true});
    window.addEventListener('scroll', this.onTouch, {passive: true, capture: true});
    document.addEventListener('visibilitychange', this.onVisible);
    this.clock = setInterval(() => this.refresh(), CLOCK_MS);
    this.stops = [
      settings.subscribe(() => this.refresh()),
      () => {
        for (const type of TOUCHES) root.removeEventListener(type, this.onTouch);
        window.removeEventListener('scroll', this.onTouch, {capture: true});
        document.removeEventListener('visibilitychange', this.onVisible);
      },
    ];
    // what the page was given is gone if the panel was off the page; and a setting or the device may have moved
    this.applied = undefined;
    this.pageKey = undefined;
    this.refresh();
    this.host.requestUpdate();
  }

  hostDisconnected(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
    clearInterval(this.clock);
    clearTimeout(this.liveTimer);
    this.touched = false;
    this.paintPage(null);
  }

  // The inputs may all have changed (a media query, the store, a setting, `narrow`): ask them once, just before the
  // host renders, so what it draws is what they say now.
  hostUpdate(): void {
    this.refresh();
  }

  // The frame is drawn: the properties a template cannot bind without rewriting the whole style attribute, and the page.
  hostUpdated(): void {
    const app = this.app();
    if (!app) return;
    if (this.staleProbe) this.refresh(); // the probe is in the DOM now; reading it may change the scale
    const a = this.current;
    if (a === this.applied) return;
    this.applied = a;
    app.style.setProperty('--g-m', a.glass.density.toFixed(3));
    app.style.setProperty('--tx', a.textScale.toFixed(3));
    const key = `${a.theme}/${a.glass.wallpaper}`;
    if (key === this.pageKey) return;
    this.pageKey = key;
    this.paintPage(app);
  }

  // Lit makes the root when the host first connects, so the controller built in the host's constructor finds none yet
  private root(): ShadowRoot | undefined {
    return this.host.renderRoot as ShadowRoot | undefined;
  }

  private app(): HTMLElement | null {
    return this.root()?.getElementById('app') ?? null;
  }

  // Compares against what is held and replaces it only if something differs: the context's consumers hear of a change
  // once, and the host renders once for it. Called by every input's notification and before every render.
  private refresh(): void {
    const next = this.compute();
    if (same(next, this.current)) return;
    this.current = next;
    this.provider.setValue(next);
    this.host.requestUpdate();
  }

  private compute(): Appearance {
    const {store, settings, compact, dark, reducedTransparency} = this.options;
    const set = settings.get();
    if (this.staleProbe) this.readProbe();
    const wallpaper = glassWallpaper(set.glass, () => this.sky());
    return Object.freeze({
      theme: isDark(set.theme, dark.matches, store.state(store.config.entities.sun)?.state) ? 'dark' : 'light',
      compact: compact.matches,
      narrow: Boolean(this.host.narrow), // Lit sets the property after the controllers are built
      glass: Object.freeze({on: wallpaper !== null, wallpaper, density: glassDensity(set.glassLevel)}),
      textScale: textScale(set.text, this.probePx),
      reducedTransparency: reducedTransparency.matches,
      live: this.touched,
    });
  }

  // A hidden probe in the shell's template, set in the system body font, reports the size chosen in Settings (17 px at
  // the default). Read once the template has rendered and again when the page comes back into view, not on every update.
  private readProbe(): void {
    const probe = this.root()?.getElementById('txprobe');
    if (!probe) return;
    this.probePx = parseFloat(getComputedStyle(probe).fontSize);
    this.staleProbe = false;
  }

  private sky(): string {
    const {store} = this.options;
    const {hass, config} = store;
    const now = Date.now();
    const day = hass ? sunTimes(hass.config.latitude ?? 0, hass.config.longitude ?? 0, this.isoDay(now)) : NO_SUN;
    return skyWallpaper(store.state(config.entities.weather)?.state, day, now);
  }

  // the local day in the house's zone, as the legacy class asked of its English formatters; one set per zone
  private isoDay(t: number): string {
    const {timeZone} = this.options.store;
    if (!this.isoDayOf || this.isoDayZone !== timeZone) {
      this.isoDayZone = timeZone;
      const formatters = createFormatters(englishLocale(timeZone));
      this.isoDayOf = t => formatters.isoDay(t);
    }
    return this.isoDayOf(t);
  }

  // The page behind the panel (what shows in the overscroll bounce on iOS) takes the wallpaper's base colour, so the
  // bounce never shows a dark band. With no app, or with glass off, it is the page's own colour again. The last panel to
  // write wins, and each removes what it wrote when it leaves.
  private paintPage(app: HTMLElement | null): void {
    cancelAnimationFrame(this.pageFrame);
    const base = app && this.current.glass.on ? getComputedStyle(app).getPropertyValue('--wbase').trim() : '';
    if (app && this.current.glass.on && !base) {
      this.pageFrame = requestAnimationFrame(() => this.paintPage(app)); // styles not applied yet on the first call
      return;
    }
    for (const el of [document.documentElement, document.body]) {
      if (base) el.style.setProperty('background-color', base, 'important');
      else el.style.removeProperty('background-color');
    }
  }

  private readonly onTouch = (): void => {
    clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => {
      this.touched = false;
      this.refresh();
    }, LIVE_MS);
    if (this.touched) return;
    this.touched = true;
    this.refresh();
  };

  private readonly onVisible = (): void => {
    if (document.hidden) return;
    this.staleProbe = true;
    this.refresh();
  };
}
