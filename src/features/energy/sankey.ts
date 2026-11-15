// <hp-sankey>: the Sankey of a period: the grid, the four uses it splits into and the rooms that heat, as ribbons and bars with their labels.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over pure geometry (`sankeyLayout`, as <hp-power-flow> is over `flowLayout`): a keyed set of
// paths, bars and texts (Lit docs, repeat), so a period that changes moves the shapes it has and adds the ones it lacks.
// Must not: compute a position, a size or a word (the layout and the model do), or draw the live flow (that is <hp-power-flow>, from the card's geometry).
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import ownCss from './sankey.element.css?inline';
import type {SankeyGeometry, SankeyItem} from './sankey-layout.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class Sankey extends LitElement {
  static override properties = {geometry: {attribute: false}};
  /** The layout of the period: the viewBox, the sentence for a screen reader and the drawing's items in paint order. */
  declare geometry: SankeyGeometry | undefined;

  // The element's own rules, the drawing's size and its labels, are in sankey.element.css.
  static override styles = [common, unsafeCSS(forShadow(ownCss))];

  constructor() {
    super();
    this.geometry = undefined;
    new AppearanceConsumer(this);
  }

  protected override render() {
    const sankey = this.geometry;
    if (!sankey) return nothing;
    // a node and its label share a name: the kind is part of the key
    return html`<svg viewBox="0 0 ${sankey.width} ${sankey.height}" role="img" aria-label=${sankey.label}>
      ${repeat(sankey.items, item => `${item.kind}:${item.key}`, this.item)}
    </svg>`;
  }

  private readonly item = (item: SankeyItem) => {
    switch (item.kind) {
      case 'ribbon':
        return svg`<path d=${item.d} fill=${item.color} opacity=${item.opacity} />`;
      case 'node':
        return svg`<rect
          x=${item.x}
          y=${item.y}
          width=${item.width}
          height=${item.height}
          rx="4"
          fill=${item.color}
        />`;
      case 'label':
        return svg`<text x=${item.x} y=${item.y}>${item.name}</text
          ><text x=${item.x} y=${item.valueY} class="v">${item.value}</text>`;
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-sankey': Sankey;
  }
}

if (!customElements.get('hp-sankey')) customElements.define('hp-sankey', Sankey);
