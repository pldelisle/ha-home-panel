// <hp-climate-detail>: the selection's head (title, line, state pill), then the gauge and the big number on a tablet or the dial on a phone, the controls, the tiles, the chart and the note.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `detail` and the options `ClimateCharts` made, through `chart-place.ts`. The chart is `<hp-chart>` (ADR 0022); the controls are
// `<hp-climate-controls>`; the dial's drag and keys are told here (`dial-input`, `dial-change`), shown at once in the overlay and sent once the finger rests, through `ControlSender` (ADR 0023).
// Must not: read an entity, compute a figure or word a string (the model does), build the chart's options (the pane's `ClimateCharts` does), build a command by hand, or be given the selection by anyone but the pane (a tile's tap tells it upward as `select`).
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {keyed} from 'lit/directives/keyed.js';
import {repeat} from 'lit/directives/repeat.js';
import {chartPlace, legendItems} from './chart-place.ts';
import './climate-controls.ts'; // defines <hp-climate-controls>
import {hpTemperature, setRoomTemperature} from './commands.ts';
import './dial.ts'; // defines <hp-dial>
import type {SelectDetail} from './climate-list.ts';
import type {DialDetail} from './dial.ts';
import './gauge.ts'; // defines <hp-gauge>
import detailOwn from './climate-detail.element.css?inline';
import type {ClimateSelection, ClimateViewModel} from './model.ts';
import {ControlSender} from './sender.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import type {ChartOptions} from '../../ui/chart-options.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {lens} from '../../ui/lens.ts';
import {chart, common, inner, pill, tiles} from '../../ui/styles/index.ts';
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
  static override styles = [common, inner, tiles, chart, pill, unsafeCSS(forShadow(detailOwn))];

  // the catalog and the formatters for the dial's commands; no entity, so no state change reaches the detail
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });
  private readonly sender = new ControlSender(this, {overlay: this.optimistic, commands: this.commands});

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
          <span class=${`pill cpill ${view.pill.tone}`}>${view.pill.text}</span>
        </div>
        ${view.dial ? this.renderDial(view.dial) : this.renderGauge(view)}
        <hp-climate-controls .view=${view.controls}></hp-climate-controls>
        <div class="tiles" style=${`grid-template-columns:repeat(${view.tiles.length},minmax(0,1fr))`}>
          ${repeat(
            view.tiles,
            ({label}) => label,
            tile => this.renderTile(tile),
          )}
        </div>
        ${this.renderChart(view)} ${view.note ? html`<p class="note">${view.note}</p>` : nothing}
      </div>
      ${lens}`;
  }

  // a tile is a plain well, or, when it leads to a room's chart (the house's Warmest and Coolest), the kit's button with its chevron that tells the pane which room (its name is what it draws, its description the model's `opens`);
  private renderTile({label, value, unit, sub, range, select, opens}: Detail['tiles'][number]) {
    const body = html`<div class="k">${label}</div>
      <div class="v num">${value}<small>${unit}</small></div>
      ${sub ? html`<div class="s">${sub}</div>` : nothing}`;
    if (select === undefined) return html`<div class=${range ? 'tile trange' : 'tile'}>${body}</div>`;
    return html`<button
      type="button"
      class="tile tilebtn"
      aria-description=${ifDefined(opens)}
      @click=${() => this.choose(select)}
    >
      ${body}
    </button>`;
  }

  // the same event the list tells, so the pane shows that room as it does for a tap on its row
  private choose(sel: ClimateSelection): void {
    this.dispatchEvent(new CustomEvent<SelectDetail>('select', {detail: {sel}}));
  }

  // the legend and the chart; until the range is loaded (or when it failed) the line that says so stands in the chart's place
  private renderChart({title, sub, chart: block}: Detail) {
    return html`<div class="legend">${legendItems(block.legend)}<span class="muted">${block.rangeLabel}</span></div>
      ${chartPlace(block, this.chart, 230, `${title}. ${sub}`)}`;
  }

  // the phone: the dial, a slider named for what it sets when it can be moved, else an image whose name says its value; redrawn from its first frame for each room chosen
  private renderDial({geometry, label, valueText, big, caption, editable, value, lo, hi}: NonNullable<Detail['dial']>) {
    return keyed(
      this.selection,
      html`<hp-dial
        .geometry=${geometry}
        .label=${editable || !valueText ? label : `${label}: ${valueText}`}
        .valueText=${valueText}
        .big=${big}
        .caption=${caption}
        .editable=${editable}
        .value=${value ?? lo}
        .lo=${lo}
        .hi=${hi}
        @dial-input=${this.onDialInput}
        @dial-change=${this.onDialChange}
      ></hp-dial>`,
    );
  }

  // what the dial's setpoint is for, as a command: a thermostat's or the heat pump's, in the formats of the household
  private dialCommand(value: number) {
    const target = this.view?.dial?.target;
    const {fmt} = this.storeController.store;
    if (!target) return null;
    return target.kind === 'hp' ? hpTemperature(target, value, fmt) : setRoomTemperature(target, value, fmt);
  }

  // the value under the finger shows at once (the overlay holds it, so a state change meanwhile does not move the knob), and nothing is sent yet
  private readonly onDialInput = (e: CustomEvent<DialDetail>): void => {
    e.stopPropagation();
    const command = this.dialCommand(e.detail.value);
    if (command) this.sender.show(command, e.detail.value);
  };

  // the finger lifted, or a key was pressed: the value is sent 1,100 ms after the last, so a drag is one call
  private readonly onDialChange = (e: CustomEvent<DialDetail>): void => {
    e.stopPropagation();
    const command = this.dialCommand(e.detail.value);
    if (command) this.sender.later(command, e.detail.value);
  };

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
