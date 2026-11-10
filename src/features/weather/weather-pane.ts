// <hp-weather-pane>: the Weather tab: on the phone the header, the summary card and the eight stat tiles, on a tablet the place for the detail panel.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `weatherModel` runs in `willUpdate` and the template only
// places what it returns, keyed (Lit docs, repeat); a store controller on the ids it reads (ADR 0012), paused while the pane is hidden.
// Must not: read an entity itself (`readWeather` does, from the states it is handed), format a figure or hold a string the household reads, or write in the detail host.
import {LitElement, css, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {readWeather} from './inputs.ts';
import {weatherIds} from './ids.ts';
import {weatherModel, type DayCell, type WeatherViewModel} from './model.ts';
import {ForecastController} from './forecast-controller.ts';
import paneStyles from './styles.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {weatherIcon} from '../../ui/icons.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/stat-tile.ts'; // defines <hp-stat-tile>
import type {TileOpenDetail} from '../../ui/stat-tile.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The sheet a tile asks for; the shell opens the legacy history sheet for it until the history is an element (#159). */
export const HISTORY_SHEET = 'weather.history';
/** The legacy detail panel's sheet, which the summary card opens on the phone. Deleted with the detail's move (#158). */
const DETAIL_SHEET = 'sh-weather';

export class WeatherPane extends LitElement {
  static override properties = {
    active: {type: Boolean},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to nothing and draws nothing. */
  declare active: boolean;

  // The host lays itself out as the old pane did: a column with the sixteen pixels between its parts on the phone, a block on a
  // tablet. The detail host is slotted (`wxhost`, the sheet host's inline placement, which the shell's root still holds).
  static override styles = [
    common,
    unsafeCSS(forShadow(paneStyles)),
    css`
      :host {
        display: block;
      }
      :host([compact]) {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      hp-pane-header {
        display: none;
      }
      :host([compact]) hp-pane-header {
        display: block;
        margin-bottom: 0;
      }
      :host([compact]) ::slotted([slot='detail']) {
        display: none;
      }
    `,
  ];

  private readonly storeController = new StoreController(this, {ids: store => weatherIds(store.config)});
  private readonly appearance = new AppearanceConsumer(this);
  private readonly forecast = new ForecastController(this);
  private view: WeatherViewModel | undefined;

  constructor() {
    super();
    this.active = false;
  }

  // The pause and the resume sit in willUpdate and not in updated: a resume asks for an update, and one asked for inside
  // willUpdate is this one, where `updated` would draw twice.
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active')) {
      if (this.active) this.storeController.resume();
      else this.storeController.pause();
    }
    // A pane never shown has nothing to keep fresh. One that was shown and left has paused its store controller, so only a forecast
    // message reaches it; it draws that and the next change of an entity it reads.
    if (!this.active && !this.view) return;
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
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
    if (!view) return html`<slot name="detail"></slot>`;
    const compact = this.appearance.value?.compact === true;
    const {t} = this.storeController.store;
    // On a tablet the pane is the detail panel's place alone: the header is there and not shown, as the old pane's was, and the card
    // and the tiles are the phone's.
    return html`<hp-pane-header .icon=${'wx'} .color=${'var(--m-blue)'} .heading=${t('weather.title')}>
        <div slot="sub">${view.summary}</div>
      </hp-pane-header>
      ${compact ? this.renderCard(view, t('weather.card.open')) : nothing}<slot name="detail"></slot>${
        compact ? this.renderTiles(view) : nothing
      }`;
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
