// <hp-ask-answer>: one answered question: the summary line, the mean, <hp-chart> of the series and the line that says what the panel understood.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing `askView`'s texts and the options `seriesChartOptions` made; the options are made again only when the answer, the theme or the language changed,
// so an update for anything else does not ask the chart to draw again. The summary and the understood line are text, so the chart is never the only carrier (spec 29, "The elements").
// Must not: compute a figure or word a string (the model did), import ApexCharts (ADR 0027), call a model, or draw the chart before the sheet has a width (<hp-chart> waits for one, ADR 0029).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import ownCss from './ask-answer.element.css?inline';
import {ASK_CHART_HEIGHT, seriesChartOptions} from './charts.ts';
import type {SeriesAnswer} from './evaluate.ts';
import type {AskView} from './model.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import type {ChartOptions} from '../../ui/chart-options.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class AskAnswer extends LitElement {
  static override properties = {view: {attribute: false}, answer: {attribute: false}, name: {}, unit: {}};
  /** The texts of the answered state, from `askView`. */
  declare view: AskView | undefined;
  /** What the chart draws. */
  declare answer: SeriesAnswer | undefined;
  /** The sensor's display name, the chart series' name. */
  declare name: string;
  /** What the sensor's readings are measured in. */
  declare unit: string;

  static override styles = [common, unsafeCSS(forShadow(ownCss))];

  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);
  // what the options in `cached` were made for
  private key = '';
  private drawn: SeriesAnswer | undefined;
  private cached: ChartOptions | undefined;

  constructor() {
    super();
    this.view = undefined;
    this.answer = undefined;
    this.name = '';
    this.unit = '';
  }

  // the chart's options, kept until what they are made of changed: the answer, the theme, the language
  private options(answer: SeriesAnswer): ChartOptions {
    const {store} = this.storeController;
    const key = `${this.appearance.value?.theme ?? 'light'}/${store.language}/${this.name}/${this.unit}`;
    if (this.cached === undefined || key !== this.key || answer !== this.drawn) {
      this.key = key;
      this.drawn = answer;
      const color = getComputedStyle(this).getPropertyValue('--c-home').trim();
      this.cached = seriesChartOptions(answer, {fmt: store.fmt, name: this.name, unit: this.unit, color});
    }
    return this.cached;
  }

  protected override render() {
    const {view, answer} = this;
    if (!view || !answer) return nothing;
    return html`<div class="answer">
      <p class="summary" id="ask-summary">${view.summary}</p>
      <p class="mean num" id="ask-mean">${view.mean}</p>
      <hp-chart .height=${ASK_CHART_HEIGHT} .label=${view.summary ?? ''} .options=${this.options(answer)}></hp-chart>
      <p class="understood" id="ask-understood">${view.understood}</p>
      ${view.coverage ? html`<p class="coverage" id="ask-coverage">${view.coverage}</p>` : nothing}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-ask-answer': AskAnswer;
  }
}

if (!customElements.get('hp-ask-answer')) customElements.define('hp-ask-answer', AskAnswer);
