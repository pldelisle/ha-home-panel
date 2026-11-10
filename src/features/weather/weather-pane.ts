// <hp-weather-pane>: the Weather tab: on the phone the header, the summary card, the eight stat tiles and the detail's sheet, on a tablet the detail inline,
// and, over either, the sheet of the tile whose history is open.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `weatherModel` runs in `willUpdate` and the template only
// places what it returns, keyed (Lit docs, repeat); a store controller on the ids it reads (ADR 0012), paused while the pane is hidden. It owns
// the statistics caches and hands the model and a cache to the detail and the history, which it draws only while they are on screen.
// Must not: read an entity itself (`readWeather` does, from the states it is handed), format a figure or hold a string the household reads, or open a sheet (it asks).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {readWeather} from './inputs.ts';
import {weatherIds} from './ids.ts';
import {weatherModel, type DayCell, type WeatherViewModel} from './model.ts';
import {ForecastController} from './forecast-controller.ts';
import {HISTORY_TTL_MS, STATISTICS_TTL_MS} from './history.ts';
import {DETAIL_SHEET, HISTORY_SHEET} from './sheets.ts';
import type {TileKey} from './tiles.ts';
import './weather-detail.ts'; // defines <hp-weather-detail>
import './weather-history.ts'; // defines <hp-weather-history>
import paneStyles from './styles.css?inline';
import {createStatisticsCache, type StatisticsCache} from '../../core/statistics-cache.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {apiContext} from '../../ui/contexts.ts';
import {SheetDismissEvent, SheetRequestEvent} from '../../ui/events.ts';
import {weatherIcon} from '../../ui/icons.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/sheet.ts'; // defines <hp-sheet>
import '../../ui/stat-tile.ts'; // defines <hp-stat-tile>
import type {TileOpenDetail} from '../../ui/stat-tile.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import weatherPaneOwn from './weather-pane.element.css?inline';

export class WeatherPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    detailOpen: {type: Boolean},
    historyTile: {},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to nothing and draws nothing. */
  declare active: boolean;
  /** Bound by the registry's template to the sheet host's `isOpen('weather.detail')`: the phone's sheet is on screen. */
  declare detailOpen: boolean;
  /** Bound by the registry's template to the tile whose history the sheet host has open, or undefined: a sheet over the screen, on any tab. */
  declare historyTile: TileKey | undefined;

  // The host lays itself out as the old pane did: a column with the sixteen pixels between its parts on the phone, a block on a
  // tablet, where the detail is its one child.
  // The element's own rules, its `:host` and what only its tree has, are in weather-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneStyles)), unsafeCSS(forShadow(weatherPaneOwn))];

  private readonly storeController = new StoreController(this, {ids: store => weatherIds(store.config)});
  private readonly appearance = new AppearanceConsumer(this);
  private readonly forecast = new ForecastController(this);
  private view: WeatherViewModel | undefined;
  private cache: StatisticsCache | undefined;
  private historyCache: StatisticsCache | undefined;
  private cacheGeneration = -1;

  constructor() {
    super();
    this.active = false;
    this.detailOpen = false;
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
    // the sheet over another tab (the Home card opens it) shows the pane's tab behind it, but it is the sheet that is on screen
    const shown = this.active || this.detailOpen || this.historyTile !== undefined;
    if (changed.has('active') || changed.has('detailOpen') || changed.has('historyTile')) {
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
        house: store.config.house,
      },
    );
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const compact = this.appearance.value?.compact === true;
    const {t} = this.storeController.store;
    // The sheets over another tab (Home's card opens the detail's, which opens a tile's history): the pane is behind them and draws
    // nothing but them, so the tab stays.
    if (!this.active && (this.detailOpen || this.historyTile !== undefined) && compact)
      return html`${this.renderSheet(view)}${this.renderHistory()}`;
    // On a tablet the pane is the detail's place alone: the header is there and not shown, as the old pane's was, and the card, the
    // tiles and the sheet are the phone's.
    return html`<hp-pane-header .icon=${'wx'} .color=${'var(--m-blue)'} .heading=${t('weather.title')}>
        <div slot="sub">${view.summary}</div>
      </hp-pane-header>
      ${compact ? this.renderCard(view, t('weather.card.open')) : this.renderInline(view)}${
        compact ? html`${this.renderSheet(view)}${this.renderTiles(view)}` : nothing
      }${this.renderHistory()}`;
  }

  // a tile's history exists only while its sheet is open, so a closed one holds no chart and asks for nothing
  private renderHistory() {
    return this.historyTile
      ? html`<hp-weather-history .tile=${this.historyTile} .cache=${this.historyCache}></hp-weather-history>`
      : nothing;
  }

  // a tablet shows the detail in the pane while the pane is the tab; leaving the tab drops it, charts and radar with it
  private renderInline(view: WeatherViewModel) {
    return this.active ? html`<hp-weather-detail .view=${view} .cache=${this.cache}></hp-weather-detail>` : nothing;
  }

  // a phone shows it in a sheet the host opens; it exists only while open, so a closed sheet holds no chart and no radar
  private renderSheet(view: WeatherViewModel) {
    const {t} = this.storeController.store;
    return html`<hp-sheet
      .open=${this.detailOpen}
      .icon=${'wx'}
      .color=${'var(--m-amber)'}
      .heading=${t('weather.title')}
      .closeLabel=${t('weather.detail.close')}
      @sheet-close=${this.dismissDetail}
    >
      ${
        this.detailOpen
          ? html`<span slot="icon" style="display:contents"
                >${weatherIcon('partlycloudy', 22, true, t('weather.cond.partlycloudy'))}</span
              >
              <div slot="sub">${view.summary}</div>
              <hp-weather-detail .view=${view} .cache=${this.cache}></hp-weather-detail>`
          : nothing
      }
    </hp-sheet>`;
  }

  // The card is a button that opens the detail's sheet: a tap, Enter and Space. `repeat` keys the days, so a forecast message
  // changes their text and keeps their nodes. The lens is the guest's glass filter, drawn again in this root (see lens.ts): temporary, it goes with the copy there (#198, #188).
  private renderCard({card}: WeatherViewModel, label: string) {
    // lit-analyzer does not know `aria-description` (a screen reader reads it after the role and the name); the ignore covers this one tag
    return html`<!-- @ts-ignore -->
      <div
        class="wxcard"
        tabindex="0"
        role="button"
        aria-description=${label}
        @click=${this.openDetail}
        @keydown=${this.onCardKey}
      >
        ${
          card.house
            ? html`<img class="house photo day" alt="" src=${card.house.day} /><img
                  class="house photo night"
                  alt=""
                  src=${card.house.night}
                />`
            : nothing
        }
        <div class="txt">
          <div class="wxsun">${card.sunLabel} <b>${card.sunTime}</b></div>
          <div class="num wxtemp">${card.temperature}</div>
          <div class="wxcond">${card.condition}</div>
          <div class="wxrange">${card.range}</div>
        </div>
        <div class="wxfacts">${card.facts.map(fact => html`<span>${fact.label}<b>${fact.value}</b></span>`)}</div>
        <div class="wxd">
          ${repeat(
            card.days,
            day => day.dayKey,
            day => this.renderDay(day),
          )}
        </div>
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  // a night with no high is Tonight: its low is the figure, with the word under it
  private renderDay(day: DayCell) {
    const {icon} = day;
    return html`<div>
      <span>${day.label}</span>${weatherIcon(icon.condition, 26, icon.day, icon.label)}${
        day.isTonight
          ? html`<b class="num">${day.lo}</b><small>${day.loLabel}</small>`
          : html`<b class="num">${day.hi}</b><small class="num">${day.lo}</small>`
      }
    </div>`;
  }

  private renderTiles({tiles}: WeatherViewModel) {
    return html`<div class="wxtiles" @tile-open=${this.onTile}>
      ${repeat(
        tiles,
        tile => tile.key,
        tile =>
          html`<hp-stat-tile
            .key=${tile.key}
            .icon=${tile.icon}
            .label=${tile.label}
            .sub=${tile.sub}
            .value=${tile.value}
            .unit=${tile.unit}
            .tone=${tile.tone ?? ''}
          ></hp-stat-tile>`,
      )}
    </div>`;
  }

  // arrow fields, so the template hands the same functions at every render
  private readonly openDetail = (): void => {
    this.dispatchEvent(new SheetRequestEvent(DETAIL_SHEET));
  };

  // the sheet's Close button, its backdrop and its swipe: the host closes it, the pane only says so
  private readonly dismissDetail = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(DETAIL_SHEET));
  };

  private readonly onCardKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    this.openDetail();
  };

  // the tile's event stops here: what it asks for is a sheet, which is the shell's to open
  private readonly onTile = (e: CustomEvent<TileOpenDetail>): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetRequestEvent(HISTORY_SHEET, {key: e.detail.key}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-weather-pane': WeatherPane;
  }
}

if (!customElements.get('hp-weather-pane')) customElements.define('hp-weather-pane', WeatherPane);
