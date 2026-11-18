// <hp-water-card>: the water heater's card: the tank's temperature and whether it heats, the last 24 hours as a small chart, its legend and the cycles line.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `water` view, placing the pure geometry of `waterChartGeometry` with `svg`
// templates (the pure-geometry style of spec 19) and its texts as HTML over them, which keep their size when the card's width changes; on a tablet beside the detail, on a phone inside the sheet its tile opens (`framed`).
// Must not: read an entity or the clock, compute a position or a word (the model does), or open anything (the sheet is its pane's).
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import type {EnergyViewModel} from './model.ts';
import type {WaterChartGeometry, WaterChartText} from './water-chart.ts';
import ownCss from './water-card.element.css?inline';
import energyShared from './styles.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lens} from '../../ui/lens.ts';
import {figureCell} from '../../ui/reading.ts';
import {common, hero, status} from '../../ui/styles/index.ts';
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
  static override styles = [common, hero, status, unsafeCSS(forShadow(energyShared)), unsafeCSS(forShadow(ownCss))];

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
    // the inner box carries the glass: see <hp-hilo-card>
    return html`<div class="ebox">
        <div class="etop"><span class="elbl">${view.title}</span><span class="eright">${view.name}</span></div>
        <div class="hero">
          ${figureCell(temperature)}
          <span class=${state.heating ? 'status ok' : 'status'}><i aria-hidden="true"></i>${state.text}</span>
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
      ${lens}`;
  }

  // the geometry's numbers, placed as they come: the grid, the hour ticks, the bars, the line and its last point; its texts are HTML over the svg
  // (the svg scales with the card, so text drawn in it would not keep its size: see the axis rules in water-card.element.css)
  private renderChart(chart: WaterChartGeometry) {
    const labels = [...chart.grid.map(g => g.label), ...chart.powerLabels, ...chart.ticks.map(tick => tick.label)];
    return html`<div class="whbox">
      <svg class="whchart" viewBox="0 0 ${chart.width} ${chart.height}" role="img" aria-label=${chart.label}>
        ${chart.grid.map(
          g => svg`<line x1=${g.x1} x2=${g.x2} y1=${g.y} y2=${g.y} stroke="var(--ring)" stroke-width="1" />`,
        )}
        ${chart.ticks.map(
          tick => svg`<line x1=${tick.x} x2=${tick.x} y1=${tick.y1} y2=${tick.y2} stroke="var(--ring)" />`,
        )}
        ${chart.bars.map(
          bar =>
            svg`<rect class="bar" x=${bar.x} y=${bar.y} width=${bar.width} height=${bar.height} rx=".6"><title>${bar.title}</title></rect>`,
        )}
        ${chart.line === null ? nothing : svg`<path class="trace" d=${chart.line} />`}
        ${chart.dot === null ? nothing : svg`<circle class="dot" cx=${chart.dot.cx} cy=${chart.dot.cy} r="3" />`}
      </svg>
      ${labels.map(label => this.axis(label, chart))}
    </div>`;
  }

  // an axis text: a span placed by its share of the canvas, its anchor (`start`, `middle`, `end`) as the attribute the rules read
  private readonly axis = ({x, y, text, anchor}: WaterChartText, {width, height}: WaterChartGeometry) =>
    html`<span
      class="axis"
      aria-hidden="true"
      data-anchor=${anchor}
      style="left:${(x / width) * 100}%;top:${(y / height) * 100}%"
      >${text}</span
    >`;
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-water-card': WaterCard;
  }
}

if (!customElements.get('hp-water-card')) customElements.define('hp-water-card', WaterCard);
