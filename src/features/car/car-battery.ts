// <hp-car-battery>: the Car detail's battery block: the usable energy, the charge beside the car's picture, the bar with the charge limit's mark and four tiles.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `BatteryBlock`; it keeps no state: whether the photo failed is the pane's (`imageFailed`, handed down through the detail; the card is told the same), and the drawn car then replaces it,
// through `carArt` and `socBar`, which the card calls too.
// Must not: read an entity or the clock, word a string or place a mark (the model does), or know the detail it is in.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {carArt} from './car-art.ts';
import ownCss from './car-battery.element.css?inline';
import {CarImageFailedEvent} from './events.ts';
import {carTiles} from './car-tiles.ts';
import type {BatteryBlock} from './model.ts';
import {socBar} from './soc-bar.ts';
import socBarCss from './soc-bar.css?inline';
import blockCss from './styles.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lens} from '../../ui/lens.ts';
import {common, inner, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarBattery extends LitElement {
  static override properties = {view: {attribute: false}, imageFailed: {attribute: false}};
  /** The model's battery block. */
  declare view: BatteryBlock | undefined;
  /** The photo did not load, which the pane keeps (for its life) and hands down: the drawing stands in for it. */
  declare imageFailed: boolean;

  static override styles = [
    common,
    inner,
    tiles,
    unsafeCSS(forShadow(socBarCss)),
    unsafeCSS(forShadow(blockCss)),
    unsafeCSS(forShadow(ownCss)),
  ];

  constructor() {
    super();
    this.view = undefined;
    this.imageFailed = false;
    // `glass` and `compact` come from the shell as host attributes the rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const block = this.view;
    if (!block) return nothing;
    return html`<div class="inner fill">
        <h3>${block.title}</h3>
        <p>${block.line}</p>
        <div class="carhero">
          <div>
            <div class="t">${block.charge}<small>%</small></div>
            <div class="muted autonomy">${block.range}</div>
          </div>
          ${carArt(block, this.imageFailed, this.onImageError)}
        </div>
        ${socBar(block.soc)}
        <div class="tiles btiles">${carTiles(block.tiles)}</div>
      </div>
      ${lens}`;
  }

  // arrow field, so the template hands the same function at every render
  private readonly onImageError = (): void => {
    this.dispatchEvent(new CarImageFailedEvent());
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-battery': CarBattery;
  }
}

if (!customElements.get('hp-car-battery')) customElements.define('hp-car-battery', CarBattery);
