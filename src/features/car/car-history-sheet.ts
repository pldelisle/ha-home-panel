// <hp-car-history-sheet>: what the charging history's sheet holds (docs/apple-hig-audit-car-2026-11-17.md, findings 8 and 11): the last 30 days as a chart on a card (a day label every week and a kWh axis, as Energy's month chart),
// the sessions (`<hp-car-sessions>`: the months' chart and the table) and the last plug-in; with no session in the year, the sentence that says so and no empty chart or table.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `HistoryBlock`, `SessionsBlock` and `LastBlock`; the pane draws it inside the kit's `<hp-sheet>`, which the sheet host
// opens (ADR 0021), and only while the sheet is open, so a closed sheet holds no chart. The chart's options come from `ChargedChart`, which makes them again only when the days, the theme, the language or the screen changed. The sessions' toggle crosses the root
// as it did (`sessions-toggle`, composed), and the pane keeps it.
// Must not: read an entity or the clock, word a string (the model did), or open or close the sheet (the row asks, the host answers).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import ownCss from './car-history-sheet.element.css?inline';
import './car-last-plug.ts'; // defines <hp-car-last-plug>
import './car-sessions.ts'; // defines <hp-car-sessions>
import {CHARGED_CHART_HEIGHT, ChargedChart} from './charged-chart.ts';
import {dailyChartOptions} from './history.ts';
import type {DailyChart, HistoryBlock, LastBlock, SessionsBlock} from './model.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
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

  // the 30 days' chart's options, made again only when what they are made of changed
  private readonly chart = new ChargedChart(this);

  constructor() {
    super();
    this.view = undefined;
    this.sessions = undefined;
    this.last = undefined;
    this.error = null;
  }

  protected override render() {
    const {view, sessions} = this;
    if (!view) return nothing;
    return html`${this.error ? html`<p class="hline">${this.error}</p>` : nothing}
      ${view.daily && sessions?.rows.length ? this.renderDaily(view.daily) : nothing} ${this.renderSessions()}
      <hp-car-last-plug .view=${this.last}></hp-car-last-plug>`;
  }

  // the sessions' chart and table; with none in the year, only the sentence that says so (no empty chart or table: docs/apple-hig-audit-car-2026-11-17.md, finding 8)
  private renderSessions() {
    const {sessions} = this;
    if (!sessions) return nothing;
    if (!sessions.rows.length) return sessions.summary ? html`<p class="hline">${sessions.summary}</p>` : nothing;
    return html`<hp-car-sessions .view=${sessions} .error=${null}></hp-car-sessions>`;
  }

  // the 30 days' chart on a card, as the other charts sit, and the sentence under it; a 30 days with nothing charged is the one sentence that says so, with no empty axes
  private renderDaily(daily: DailyChart) {
    const {notice, label, line} = daily;
    if (notice !== null) return html`<div class="inner daily"><p>${notice}</p></div>`;
    const options = this.chart.options(`${daily.days[0]}/${daily.values.join()}`, deps =>
      dailyChartOptions(daily, deps),
    );
    return html`<div class="inner daily">
      <hp-chart .height=${CHARGED_CHART_HEIGHT} .label=${label} .options=${options}></hp-chart>
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
