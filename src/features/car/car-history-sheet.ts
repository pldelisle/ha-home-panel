// <hp-car-history-sheet>: what the charging history's sheet holds (docs/apple-hig-audit-car-2026-11-17.md, findings 8 and 11): the last 30 days as a chart on a card (a day label every week and a kWh axis, as Energy's month chart),
// the sessions (`<hp-car-sessions>`: the months' chart and the table) and the last plug-in; with no session in the year, the sentence that says so and no empty chart or table.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `HistoryBlock`, `SessionsBlock` and `LastBlock`; the pane draws it inside the kit's `<hp-sheet>`, which the sheet host
// opens (ADR 0021), and only while the sheet is open, so a closed sheet holds no chart. The chart's options are rebuilt only when the days, the theme, the language or the screen changed. The sessions' toggle crosses the root
// as it did (`sessions-toggle`, composed), and the pane keeps it.
// Must not: read an entity or the clock, word a string (the model did), or open or close the sheet (the row asks, the host answers).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import ownCss from './car-history-sheet.element.css?inline';
import './car-last-plug.ts'; // defines <hp-car-last-plug>
import './car-sessions.ts'; // defines <hp-car-sessions>
import {dailyChartOptions} from './history.ts';
import type {DailyBars, HistoryBlock, LastBlock, SessionsBlock} from './model.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import type {ChartOptions} from '../../ui/chart-options.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {common, inner} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarHistorySheet extends LitElement {
  static override properties = {
    view: {attribute: false},
    sessions: {attribute: false},
    last: {attribute: false},
    error: {attribute: false},
  };
  /** The model's history row and its 30 days of bars. */
  declare view: HistoryBlock | undefined;
  declare sessions: SessionsBlock | undefined;
  declare last: LastBlock | undefined;
  /** Why the history did not load, in words; null when it did, or has not been asked. */
  declare error: string | null;

  static override styles = [common, inner, unsafeCSS(forShadow(ownCss))];

  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);
  // the daily chart's options, rebuilt only when what they are made of changed
  private chartKey = '';
  private chartOptions: ChartOptions | undefined;

  constructor() {
    super();
    this.view = undefined;
    this.sessions = undefined;
    this.last = undefined;
    this.error = null;
  }

  protected override willUpdate(): void {
    const daily = this.view?.daily;
    if (!daily) return;
    const {store} = this.storeController;
    const compact = this.appearance.value?.compact === true;
    const key = `${this.appearance.value?.theme ?? 'light'}/${store.language}/${compact}/${daily.days[0]}/${daily.values.join()}`;
    if (key === this.chartKey) return;
    this.chartKey = key;
    const color = getComputedStyle(this).getPropertyValue('--c-ev').trim();
    this.chartOptions = dailyChartOptions(daily, {fmt: store.fmt, t: store.t, color, compact});
  }

  protected override render() {
    const {view, sessions} = this;
    if (!view) return nothing;
    return html`${this.error ? html`<p class="hline">${this.error}</p>` : nothing}
      ${view.daily && sessions?.rows.length ? this.renderBars(view.daily) : nothing} ${this.renderSessions()}
      <hp-car-last-plug .view=${this.last}></hp-car-last-plug>`;
  }

  // the sessions' chart and table; with none in the year, only the sentence that says so (no empty chart or table: docs/apple-hig-audit-car-2026-11-17.md, finding 8)
  private renderSessions() {
    const {sessions} = this;
    if (!sessions) return nothing;
    if (!sessions.rows.length) return sessions.summary ? html`<p class="hline">${sessions.summary}</p>` : nothing;
    return html`<hp-car-sessions .view=${sessions} .error=${null}></hp-car-sessions>`;
  }

  // the 30 days' chart on a card, as the other charts sit, and the sentence under it that names where the figures come from
  private renderBars({label, line}: DailyBars) {
    return html`<div class="inner bars">
      <hp-chart .height=${220} .label=${label} .options=${this.chartOptions}></hp-chart>
      <p>${line}</p>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-history-sheet': CarHistorySheet;
  }
}

if (!customElements.get('hp-car-history-sheet')) customElements.define('hp-car-history-sheet', CarHistorySheet);
