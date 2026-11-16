// <hp-heat-legend>: the heatmap's colour bar, a gradient through the heat scale of the theme, with the degrees written under it.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing `heatLegend`'s colours and ticks for the stops of the theme `AppearanceConsumer` says; the page's own theme is the only thing it reads.
// Must not: hold a colour of its own (`heatScale` has them), read an entity or the history, or word anything but the degrees `fmt` writes.
import {LitElement, html, unsafeCSS} from 'lit';
import {degrees} from '../../core/i18n/format.ts';
import legendOwn from './heatmap-legend.element.css?inline';
import {heatLegend, heatScale} from './history.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class HeatLegendElement extends LitElement {
  // The element's own rules, the bar and the ticks under it, are in heatmap-legend.element.css.
  static override styles = [common, unsafeCSS(forShadow(legendOwn))];

  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);

  protected override render() {
    const {colors, ticks} = heatLegend(heatScale(this.appearance.value?.theme === 'dark'));
    const {fmt} = this.storeController.store;
    return html`<div class="hleg">
      <span class="hbar" style=${`background:linear-gradient(90deg,${colors.join(',')})`}></span>
      <span class="hticks"
        >${ticks.map(({degrees: at, at: left}) => html`<i style=${`left:${left}%`}>${degrees(fmt, at)}</i>`)}</span
      >
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-heat-legend': HeatLegendElement;
  }
}

if (!customElements.get('hp-heat-legend')) customElements.define('hp-heat-legend', HeatLegendElement);
