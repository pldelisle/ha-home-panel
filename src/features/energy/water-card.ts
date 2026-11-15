// <hp-water-card>: the water heater's card: the tank's temperature and whether it heats, the last 24 hours as a small chart, its legend and the cycles line.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `water` view, placing the pure geometry of `waterChartGeometry` with `svg`
// templates (the pure-geometry style of spec 19); on a tablet beside the detail, on a phone inside the sheet its tile opens (`framed`).
// Must not: read an entity or the clock, compute a position or a word (the model does), or open anything (the sheet is its pane's).
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import type {EnergyViewModel} from './model.ts';
import type {WaterChartGeometry, WaterChartText} from './water-chart.ts';
import ownCss from './water-card.element.css?inline';
import energyShared from './styles.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lensLike} from '../../ui/lens.ts';
import {common, hero} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

type Water = EnergyViewModel['water'];

export class WaterCard extends LitElement {
  static override properties = {
    view: {attribute: false},
    framed: {type: Boolean, reflect: true},
  };
  /** The model's water heater: its title, name, temperature and state, and, once the history is there, the chart, the legend and the cycles line. */
  declare view: Water | undefined;
  /** Drawn inside a sheet, where the box is a little tighter, as the legacy card sheet drew a card. */
  declare framed: boolean;

  // The kit's hero, the feature's box (styles.css), and the element's own rules, the chart's and the legend's, last (water-card.element.css).
  static override styles = [common, hero, unsafeCSS(forShadow(energyShared)), unsafeCSS(forShadow(ownCss))];

  constructor() {
    super();
    this.view = undefined;
    this.framed = false;
    // `glass` and `compact` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {temperature, state} = view;
    // the inner box carries the glass: see <hp-energy-card>
    return html`<div class="ebox">
        <div class="etop"><span class="elbl">${view.title}</span><span class="eright">${view.name}</span></div>
        <div class="hero">
          <div class="v num">${temperature.value}<small>${temperature.unit}</small></div>
          <span class="state"><i class=${state.heating ? 'on' : 'off'}></i>${state.text}</span>
        </div>
        ${view.chart ? this.renderChart(view.chart) : nothing}
        ${
          view.legend.length
            ? html`<div class="whleg">
                ${repeat(
                  view.legend,
                  item => item.kind,
                  item => html`<span><i class=${item.kind}></i>${item.label}</span>`,
                )}
              </div>`
            : nothing
        }
        ${view.line === null ? nothing : html`<div class="muted whline">${view.line}</div>`}
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  // the geometry's numbers and texts, placed as they come: the grid and its labels, the power axis, the hour ticks, the bars, the line and its last point
  private renderChart(chart: WaterChartGeometry) {
    return html`<svg class="whchart" viewBox="0 0 ${chart.width} ${chart.height}" role="img" aria-label=${chart.label}>
      ${chart.grid.map(
        g =>
          svg`<line x1=${g.x1} x2=${g.x2} y1=${g.y} y2=${g.y} stroke="var(--ring)" stroke-width="1" />${this.axis(g.label)}`,
      )}
      ${chart.powerLabels.map(this.axis)}
      ${chart.ticks.map(
        tick =>
          svg`<line x1=${tick.x} x2=${tick.x} y1=${tick.y1} y2=${tick.y2} stroke="var(--ring)" />${this.axis(tick.label)}`,
      )}
      ${chart.bars.map(
        bar =>
          svg`<rect class="bar" x=${bar.x} y=${bar.y} width=${bar.width} height=${bar.height} rx=".6"><title>${bar.title}</title></rect>`,
      )}
      ${chart.line === null ? nothing : svg`<path class="trace" d=${chart.line} />`}
      ${chart.dot === null ? nothing : svg`<circle class="dot" cx=${chart.dot.cx} cy=${chart.dot.cy} r="3" />`}
    </svg>`;
  }

  private readonly axis = ({x, y, text, anchor}: WaterChartText) =>
    svg`<text class="axis" x=${x} y=${y} text-anchor=${anchor}>${text}</text>`;
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-water-card': WaterCard;
  }
}

if (!customElements.get('hp-water-card')) customElements.define('hp-water-card', WaterCard);
