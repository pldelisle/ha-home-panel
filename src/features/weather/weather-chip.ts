// <hp-weather-chip>: the header's weather chip, the outside temperature and the condition; beside a running live activity (`slim`) only
// the temperature. Nothing when the house reads no temperature.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `weatherChipModel`, on the weather ids (ADR 0012), as `<hp-peak-chip>` beside it is;
// it draws the chip the legacy `renderHeader` drew (deleted in #269), on `.wx`, so no selector of the legacy sheet is written twice.
// Must not: read an entity itself (`readWeather` does), word anything (the model does), or open anything (the chip is no button).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {weatherIds} from './ids.ts';
import {readWeather} from './inputs.ts';
import {weatherChipModel} from './model.ts';
import ownCss from './weather-chip.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {lensLike} from '../../ui/lens.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class WeatherChip extends LitElement {
  static override styles = [common, unsafeCSS(forShadow(ownCss))];
  static override properties = {slim: {type: Boolean, reflect: true}};
  /** A live activity shows beside the chip: the condition is left out (the header sets it). */
  declare slim: boolean;

  private readonly storeController = new StoreController(this, {ids: store => weatherIds(store.config)});

  constructor() {
    super();
    this.slim = false;
    // `glass`, `compact` and `data-theme` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const {hass, config, t, fmt} = this.storeController.store;
    const view = hass ? weatherChipModel(readWeather(hass.states, config), {t, fmt}) : null;
    if (!view) return nothing;
    return html`<div class="wx">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="9" r="4" fill="var(--m-amber)" />
          <path d="M8 19h9a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.6A3.2 3.2 0 0 0 8 19z" fill="var(--fg3)" opacity=".7" /></svg
        ><span class="num">${view.temperature}</span><small>${view.condition}</small>
      </div>
      ${lensLike(this.getRootNode())}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-weather-chip': WeatherChip;
  }
}

if (!customElements.get('hp-weather-chip')) customElements.define('hp-weather-chip', WeatherChip);
