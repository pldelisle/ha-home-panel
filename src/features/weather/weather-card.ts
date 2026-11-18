// <hp-weather-card>: the weather part of the Home pane's first card: the next sun event and the one after, the big temperature with
// the condition and the high and low, and the house picture the config names, one for the light theme and one for the dark.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `weatherCardModel`; its host lays out nothing, so its three parts are
// items of the Home pane's card, as the legacy `renderHome`'s `#hwx-wx` (deleted in #268) placed them.
// Must not: read an entity itself (`readWeather` and `readSunTimes` do), word anything (the model does), or open a sheet.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {weatherIds} from './ids.ts';
import {readSunTimes, readWeather} from './inputs.ts';
import {weatherCardModel, type WeatherCardView} from './model.ts';
import cardOwn from './weather-card.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class WeatherCard extends LitElement {
  // The element's own rules, its `:host`, the figure and the house, are in weather-card.element.css.
  static override styles = [common, unsafeCSS(forShadow(cardOwn))];

  private readonly storeController = new StoreController(this, {ids: store => weatherIds(store.config)});
  private view: WeatherCardView | undefined;

  constructor() {
    super();
    // `compact` sizes the figure and the house down, and `data-theme` picks the house picture
    new AppearanceConsumer(this);
  }

  protected override willUpdate(): void {
    const {hass, config, t, fmt} = this.storeController.store;
    this.view = hass
      ? weatherCardModel(readWeather(hass.states, config), readSunTimes(hass.states, config), {t, fmt})
      : undefined;
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const house = this.storeController.store.config.house;
    return html`<div class="muted sunline">
        ${view.next.label}
        <b>${view.next.time}</b>${view.then ? html` · ${view.then.label} <b>${view.then.time}</b>` : nothing}
      </div>
      <div class="hbig">
        <span class=${view.temperatureMissing ? 'na' : 'num'}>${view.temperature}</span>
        <div>
          <div class="hc">${view.condition}</div>
          <div class="muted">${view.range}</div>
        </div>
      </div>
      <div class="hhouse">
        ${
          house
            ? html`<img class="house photo day" alt="" src=${house.day ?? ''} /><img
                  class="house photo night"
                  alt=""
                  src=${house.night ?? ''}
                />`
            : nothing
        }
      </div>`;
  }
}

if (!customElements.get('hp-weather-card')) customElements.define('hp-weather-card', WeatherCard);
