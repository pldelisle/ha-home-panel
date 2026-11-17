// <hp-car-summary>: the top of the Car tab: the charge and the range beside the car's picture, the battery bar with the limit Ford sets, and the facts under it (charging, the doors, the lock),
// each said once (docs/apple-hig-audit-car-2026-11-17.md, finding 3).
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `SummaryBlock`; it keeps no state: whether the photo failed is the pane's (`imageFailed`, handed down through the detail),
// and the drawn car then replaces it, through `carArt` and `socBar`.
// Must not: read an entity or the clock, word a string or place a mark (the model does), or know the detail it is in.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {carArt} from './car-art.ts';
import ownCss from './car-summary.element.css?inline';
import {CarImageFailedEvent} from './events.ts';
import type {SummaryBlock} from './model.ts';
import {socBar} from './soc-bar.ts';
import socBarCss from './soc-bar.css?inline';
import blockCss from './styles.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lensLike} from '../../ui/lens.ts';
import {common, inner} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarSummary extends LitElement {
  static override properties = {view: {attribute: false}, imageFailed: {attribute: false}};
  /** The model's summary block. */
  declare view: SummaryBlock | undefined;
  /** The photo did not load, which the pane keeps (for its life) and hands down: the drawing stands in for it. */
  declare imageFailed: boolean;

  static override styles = [
    common,
    inner,
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
        <div class="carhero">
          <div>
            <div class="t">${block.charge}<small>%</small></div>
            ${block.range ? html`<div class="muted autonomy">${block.range}</div>` : nothing}
          </div>
          ${carArt(block, this.imageFailed, this.onImageError)}
        </div>
        ${socBar(block.soc)}
        <ul class="facts">
          ${repeat(
            block.facts,
            fact => fact.text,
            fact => html`<li class=${fact.tone}><i aria-hidden="true"></i>${fact.text}</li>`,
          )}
        </ul>
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  // arrow field, so the template hands the same function at every render
  private readonly onImageError = (): void => {
    this.dispatchEvent(new CarImageFailedEvent());
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-summary': CarSummary;
  }
}

if (!customElements.get('hp-car-summary')) customElements.define('hp-car-summary', CarSummary);
