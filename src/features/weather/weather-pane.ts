// <hp-weather-pane>: the Weather tab: the detail inline (on the phone under the pane's header, on a tablet with its own) and, over any tab,
// the sheet of the tile whose history is open.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `weatherModel` runs in `willUpdate` and the template only
// places what it returns, keyed (Lit docs, repeat); a store controller on the ids it reads (ADR 0012), paused while the pane is hidden. It owns
// the statistics caches and hands the model and a cache to the detail and the history, which it draws only while they are on screen.
// Must not: read an entity itself (`readWeather` does, from the states it is handed), format a figure or hold a string the household reads, or open a sheet (it asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {readWeather} from './inputs.ts';
import {weatherIds} from './ids.ts';
import {weatherModel, type WeatherViewModel} from './model.ts';
import {ForecastController} from './forecast-controller.ts';
import {HISTORY_TTL_MS, STATISTICS_TTL_MS} from './history.ts';
import type {TileKey} from './tiles.ts';
import './weather-detail.ts'; // defines <hp-weather-detail>
import './weather-history.ts'; // defines <hp-weather-history>
import {createStatisticsCache, type StatisticsCache} from '../../core/statistics-cache.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {apiContext} from '../../ui/contexts.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import weatherPaneOwn from './weather-pane.element.css?inline';

export class WeatherPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    historyTile: {},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to nothing and draws nothing. */
  declare active: boolean;
  /** Bound by the registry's template to the tile whose history the sheet host has open, or undefined: a sheet over the screen, on any tab. */
  declare historyTile: TileKey | undefined;

  // The host lays itself out as a column with the sixteen pixels between its parts on the phone (the header, the detail), a block on a
  // tablet, where the detail is its one child.
  // The element's own rules, its `:host` and what only its tree has, are in weather-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(weatherPaneOwn))];

  private readonly storeController = new StoreController(this, {ids: store => weatherIds(store.config)});
  private readonly forecast = new ForecastController(this);
  private view: WeatherViewModel | undefined;
  private cache: StatisticsCache | undefined;
  private historyCache: StatisticsCache | undefined;
  private cacheGeneration = -1;

  constructor() {
    super();
    // reflects `compact` and `data-theme` as attributes on the host, which its CSS reads
    new AppearanceConsumer(this);
    this.active = false;
    this.historyTile = undefined;
    // the caches are the pane's: the detail is drawn and dropped as the pane is shown and left, and a second opening within the
    // fifteen minutes is the cache's hit; a client never changes for a given tree
    new ContextConsumer(this, {
      context: apiContext,
      subscribe: false,
      callback: api => {
        this.cache = createStatisticsCache(api, {ttlMs: STATISTICS_TTL_MS});
        this.historyCache = createStatisticsCache(api, {ttlMs: HISTORY_TTL_MS});
      },
    });
  }

  // The pause and the resume sit in willUpdate and not in updated: a resume asks for an update, and one asked for inside
  // willUpdate is this one, where `updated` would draw twice.
  protected override willUpdate(changed: PropertyValues<this>): void {
    const shown = this.active;
    if (changed.has('active')) {
      if (shown) this.storeController.resume();
      else this.storeController.pause();
    }
    // A pane never shown has nothing to keep fresh. One that was shown and left has paused its store controller, so only a forecast
    // message reaches it; it draws that and the next change of an entity it reads.
    if (!shown && !this.view) return;
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    // the cached replies belong to the config they were asked under
    if (store.generation !== this.cacheGeneration) {
      this.cache?.clear();
      this.historyCache?.clear();
      this.cacheGeneration = store.generation;
    }
    this.view = weatherModel(
      readWeather(hass.states, store.config),
      {daily: this.forecast.daily, hourly: this.forecast.hourly},
      {
        now: Date.now(),
        fmt: store.fmt,
        t: store.t,
        latitude: hass.config.latitude ?? 0,
        longitude: hass.config.longitude ?? 0,
      },
    );
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    // On a tablet the pane is the detail's place alone: the header is there and not shown, as the old pane's was, and the detail draws its own.
    // On a phone the pane's header is the tab's, and the detail has none.
    return html`<hp-pane-header .icon=${'wx'} .color=${'var(--m-blue)'} .heading=${t('weather.title')}>
        <div slot="sub">${view.summary}</div>
      </hp-pane-header>
      ${this.renderInline(view)}${this.renderHistory()}`;
  }

  // a tile's history exists only while its sheet is open, so a closed one holds no chart and asks for nothing
  private renderHistory() {
    return this.historyTile
      ? html`<hp-weather-history .tile=${this.historyTile} .cache=${this.historyCache}></hp-weather-history>`
      : nothing;
  }

  // the tab shows the detail in the pane while the pane is the tab; leaving the tab drops it, charts and radar with it
  private renderInline(view: WeatherViewModel) {
    return this.active ? html`<hp-weather-detail .view=${view} .cache=${this.cache}></hp-weather-detail>` : nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-weather-pane': WeatherPane;
  }
}

if (!customElements.get('hp-weather-pane')) customElements.define('hp-weather-pane', WeatherPane);
