// <hp-gauge>: the tablet's temperature bar: a dot at the reading with its words, a mark at the setpoint, and the scale's ends with a caption between them.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `GaugeView`: the positions are `gaugeGeometry`'s percentages and every word is the model's.
// Must not: compute a position or word anything (the geometry and the model do), read an entity, or hold state.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import gaugeOwn from './gauge.element.css?inline';
import type {GaugeView} from './model.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class Gauge extends LitElement {
  static override properties = {view: {attribute: false}};
  /** The model's gauge: the bar's positions, its description for a screen reader, and the words under it. */
  declare view: GaugeView | undefined;

  // The element's own rules, the bar, its dot, mark and words, and the scale under it, are in gauge.element.css.
  static override styles = [common, unsafeCSS(forShadow(gaugeOwn))];

  constructor() {
    super();
    this.view = undefined;
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    const {geometry} = view;
    return html`<div class="gauge" role="img" aria-label=${view.label}>
        ${geometry.setpoint === null ? nothing : html`<span class="sp" style=${`left:${geometry.setpoint}%`}></span>`}
        <span class="mk" style=${`left:${geometry.now}%`}></span>
        <span class="lb" style=${`left:${geometry.now}%`}>${view.now}</span>
      </div>
      <div class="gscale"><span>${view.lo}</span><span>${view.caption}</span><span>${view.hi}</span></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-gauge': Gauge;
  }
}

if (!customElements.get('hp-gauge')) customElements.define('hp-gauge', Gauge);
