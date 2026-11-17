// <hp-car-status>: the Car detail's status block: the four tire pressures around the car seen from above, the chips for the doors, windows, hood, lock, alarm and gear, and four tiles.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `StatusBlock`; the tires are placed by the grid's auto-placement in the order the model gives them, the drawing in the middle.
// Must not: read an entity, convert a pressure or word a string (the provider and the model did), or know the detail it is in.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {carTop} from './car-art.ts';
import ownCss from './car-status.element.css?inline';
import {carTiles} from './car-tiles.ts';
import type {StatusBlock, TireView} from './model.ts';
import blockCss from './styles.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lens} from '../../ui/lens.ts';
import {common, inner, list, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarStatus extends LitElement {
  static override properties = {view: {attribute: false}};
  /** The model's status block. */
  declare view: StatusBlock | undefined;

  static override styles = [common, inner, tiles, list, unsafeCSS(forShadow(blockCss)), unsafeCSS(forShadow(ownCss))];

  constructor() {
    super();
    this.view = undefined;
    // `glass` and `compact` come from the shell as host attributes the rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const block = this.view;
    if (!block) return nothing;
    const [frontLeft, frontRight, rearLeft, rearRight] = block.tires;
    return html`<div class="inner fill">
        <h3>${block.title}</h3>
        <p>${block.caption}</p>
        <div class="tpms">
          ${this.renderTire(frontLeft)}${carTop(block.drawing)}${this.renderTire(frontRight)}${this.renderTire(rearLeft)}${this.renderTire(rearRight)}
        </div>
        <div class="clear">
          ${repeat(
            block.chips,
            chip => chip.text,
            chip => html`<span class=${chip.good ? '' : 'warn'}>${chip.text}</span>`,
          )}
        </div>
        <div class="tiles">${carTiles(block.tiles)}</div>
      </div>
      ${lens}`;
  }

  // a tire: its name, its pressure, and Ford's word for it when it gave one, in the warning colour unless it is normal
  private renderTire({label, psi, unit, state}: TireView) {
    return html`<div class="tp">
      <div class="k">${label}</div>
      <div class="v">${psi}<small>${unit}</small></div>
      ${state ? html`<div class=${state.ok ? 's' : 's warn'}>${state.text}</div>` : nothing}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-status': CarStatus;
  }
}

if (!customElements.get('hp-car-status')) customElements.define('hp-car-status', CarStatus);
