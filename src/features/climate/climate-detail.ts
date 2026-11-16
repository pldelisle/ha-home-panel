// <hp-climate-detail>: the selection's head (title, line, state pill), then the gauge and the big number on a tablet or the dial on a phone, the tiles, the chart and the note.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `detail` and the options `ClimateCharts` made, through `chart-place.ts`; the legacy panel's controls, which it still draws until #248,
// come through a named slot (Lit docs, Shadow DOM: Slots) forwarded from the pane, in the place the legacy detail had them under the head. The chart is `<hp-chart>` (ADR 0022).
// Must not: read an entity, compute a figure or word a string (the model does), build the chart's options (the pane's `ClimateCharts` does), or be given the selection by anyone but the pane.
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {keyed} from 'lit/directives/keyed.js';
import {repeat} from 'lit/directives/repeat.js';
import {chartPlace, legendItems} from './chart-place.ts';
import './dial.ts'; // defines <hp-dial>
import './gauge.ts'; // defines <hp-gauge>
import detailOwn from './climate-detail.element.css?inline';
import type {ClimateSelection, ClimateViewModel} from './model.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import type {ChartOptions} from '../../ui/chart-options.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lensLike} from '../../ui/lens.ts';
import {chart, common, inner, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

type Detail = ClimateViewModel['detail'];

/** The detail's badge, the legacy sheet's own art, where the rail and the phone's header draw the `therm` icon. */
export const detailIcon = svg`<svg
  width="26"
  height="26"
  viewBox="0 0 24 24"
  aria-hidden="true"
>
  <path d="M10 3a2 2 0 0 1 4 0v10.3a4.5 4.5 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="2" />
  <circle cx="12" cy="17" r="2" fill="currentColor" />
</svg>`;

export class ClimateDetail extends LitElement {
  static override properties = {
    view: {attribute: false},
    selection: {},
    chart: {attribute: false},
  };
  /** The pane's view model of the detail: the head, the reading and its drawing, the tiles, the chart's legend and the note. */
  declare view: Detail | undefined;
  /** What is shown: the dial is drawn again, with its first-draw motion, when another room is chosen. */
  declare selection: ClimateSelection;
  /** The chart's options, made by the pane's `ClimateCharts` once the range is loaded; null before. */
  declare chart: ChartOptions | null;

  // The kit's inner card, tiles and chart legend; the element's own rules, the head, the big number, the tiles' columns and the note, are in climate-detail.element.css.
  static override styles = [common, inner, tiles, chart, unsafeCSS(forShadow(detailOwn))];

  constructor() {
    super();
    // `compact` and `glass` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
    this.view = undefined;
    this.selection = 'house';
    this.chart = null;
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    return html`<div class="inner cdet" aria-live="polite">
        <div class="big">
          <div>
            <h3>${view.title}</h3>
            <p>${view.sub}</p>
          </div>
          <span class=${`cpill ${view.pill.tone}`}>${view.pill.text}</span>
        </div>
        ${view.dial ? this.renderDial(view.dial) : this.renderGauge(view)}
        <slot name="controls"></slot>
        <div class="tiles" style=${`grid-template-columns:repeat(${view.tiles.length},minmax(0,1fr))`}>
          ${repeat(
            view.tiles,
            ({label}) => label,
            ({label, value, unit, sub, range}) =>
              html`<div class=${range ? 'tile trange' : 'tile'}>
                <div class="k">${label}</div>
                <div class="v num">${value}<small>${unit}</small></div>
                ${sub ? html`<div class="s">${sub}</div>` : nothing}
              </div>`,
          )}
        </div>
        ${this.renderChart(view)} ${view.note ? html`<p class="note">${view.note}</p>` : nothing}
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  // the legend and the chart; until the range is loaded (or when it failed) the line that says so stands in the chart's place
  private renderChart({title, sub, chart: block}: Detail) {
    return html`<div class="legend">${legendItems(block.legend)}<span class="muted">${block.rangeLabel}</span></div>
      ${chartPlace(block, this.chart, 230, `${title}. ${sub}`)}`;
  }

  // the phone: the dial, an image whose name says its value, redrawn from its first frame for each room chosen
  private renderDial({geometry, label, valueText, big, caption}: NonNullable<Detail['dial']>) {
    return keyed(
      this.selection,
      html`<hp-dial
        .geometry=${geometry}
        .label=${valueText ? `${label}: ${valueText}` : label}
        .big=${big}
        .caption=${caption}
      ></hp-dial>`,
    );
  }

  // the tablet: the big number with the outside reading beside it, and the gauge under them
  private renderGauge({temperature, outside, gauge}: Detail) {
    return html`<div class="big again">
        <div class="t">${temperature}<small>°C</small></div>
        <div class="muted out">${outside}</div>
      </div>
      ${gauge ? html`<hp-gauge .view=${gauge}></hp-gauge>` : nothing}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-climate-detail': ClimateDetail;
  }
}

if (!customElements.get('hp-climate-detail')) customElements.define('hp-climate-detail', ClimateDetail);
