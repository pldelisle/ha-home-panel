// <hp-car-last-plug>: the Car detail's last plug-in block: when Ford says the car was plugged in and out, and four tiles (the battery's climb, the range added, the hours, the kWh the Wallbox delivered).
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `LastBlock`; before Ford has reported a plug-in the block is a title and the line that says so, with no tiles.
// Must not: read an entity, parse a date, sum the Wallbox's sessions or word a string (the provider and the model did), or know the detail it is in.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import ownCss from './car-last-plug.element.css?inline';
import {carTiles} from './car-tiles.ts';
import type {LastBlock} from './model.ts';
import blockCss from './styles.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lensLike} from '../../ui/lens.ts';
import {common, inner, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarLastPlug extends LitElement {
  static override properties = {view: {attribute: false}};
  /** The model's last plug-in block. */
  declare view: LastBlock | undefined;

  static override styles = [common, inner, tiles, unsafeCSS(forShadow(blockCss)), unsafeCSS(forShadow(ownCss))];

  constructor() {
    super();
    this.view = undefined;
    // `glass` and `compact` come from the shell as host attributes the rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const block = this.view;
    if (!block) return nothing;
    return html`<div class="inner fill">
        <h3>${block.title}</h3>
        <p>${block.caption}</p>
        ${block.tiles.length ? html`<div class="tiles">${carTiles(block.tiles)}</div>` : nothing}
      </div>
      ${lensLike(this.getRootNode())}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-last-plug': CarLastPlug;
  }
}

if (!customElements.get('hp-car-last-plug')) customElements.define('hp-car-last-plug', CarLastPlug);
