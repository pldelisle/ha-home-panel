// <hp-car-sessions>: the Car detail's charging history: the sentence and four tiles, the monthly bars through <hp-chart> (the year window's; the month's has none), and the table of the latest ten sessions with the button that shows them all.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `SessionsBlock`, the rows keyed by the session's start (Lit docs, repeat); the chart's options (`ChargedChart`) are made again only when the months,
// the theme or the language changed, so an update for anything else does not ask the chart to draw again. The table's length is the pane's state: the button asks (`sessions-toggle`) and the model answers.
// Must not: read an entity or the clock, sum or cost a session or word a string (the model did), call the API client, or hold which rows are shown.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import ownCss from './car-sessions.element.css?inline';
import {carTiles} from './car-tiles.ts';
import {CHARGED_CHART_HEIGHT, ChargedChart} from './charged-chart.ts';
import {sessionsChartOptions} from './history.ts';
import type {SessionRow, SessionsBlock} from './model.ts';
import blockCss from './styles.css?inline';
import '../../ui/chart.ts'; // defines <hp-chart>
import {lens} from '../../ui/lens.ts';
import {common, inner, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The button asks for the table to show every session, or the latest ten again; the pane holds which, and the model's rows follow. Not exported: the pane's `@sessions-toggle` binds by the literal, as a lit template's event name cannot be a constant. */
const SESSIONS_TOGGLE = 'sessions-toggle';

export class CarSessions extends LitElement {
  static override properties = {view: {attribute: false}, error: {attribute: false}};
  /** The model's sessions block. */
  declare view: SessionsBlock | undefined;
  /** Why the history did not load, in words; null when it did, or has not been asked. */
  declare error: string | null;

  static override styles = [common, inner, tiles, unsafeCSS(forShadow(blockCss)), unsafeCSS(forShadow(ownCss))];

  // the monthly bars' options, made again only when what they are made of changed
  private readonly chart = new ChargedChart(this);

  constructor() {
    super();
    this.view = undefined;
    this.error = null;
  }

  protected override render() {
    const block = this.view;
    if (!block) return nothing;
    const {columns, rows, toggle} = block;
    // the months' chart is the year's: the month window has none, and nor has a year with no session
    const charted = block.months.length > 0;
    return html`<div class="inner fill">
        <h3>${block.title}</h3>
        <p>${block.summary || this.error}</p>
        <div class="tiles stiles">${carTiles(block.tiles)}</div>
        ${
          charted
            ? html`<hp-chart
                .height=${CHARGED_CHART_HEIGHT}
                .label=${`${block.title}. ${block.summary}`}
                .options=${this.chart.options(JSON.stringify(block.months), deps => sessionsChartOptions(block.months, deps))}
              ></hp-chart>`
            : nothing
        }
        <table class="slist">
          <thead>
            <tr>
              <th>${columns.date}</th>
              <th class="hide-s">${columns.time}</th>
              <th class="r hide-s">${columns.length}</th>
              <th>${columns.energy}</th>
              <th class="r hide-s">${columns.peak}</th>
              <th class="r">${columns.cost}</th>
            </tr>
          </thead>
          <tbody>
            ${repeat(
              rows,
              row => row.key,
              row => this.renderRow(row),
            )}
          </tbody>
        </table>
        ${toggle === null ? nothing : html`<button class="showall" type="button" @click=${this.onToggle}>${toggle}</button>`}
      </div>
      ${lens}`;
  }

  private renderRow(row: SessionRow) {
    return html`<tr>
      <td>${row.date}</td>
      <td class="hide-s">${row.times}</td>
      <td class="r hide-s">${row.length}</td>
      <td><span class="bar" style="width:${row.barPx}px"></span>${row.energy}</td>
      <td class="r hide-s">${row.peak}</td>
      <td class="r">${row.cost}</td>
    </tr>`;
  }

  // arrow field, so the template hands the same function at every render
  private readonly onToggle = (): void => {
    this.dispatchEvent(new Event(SESSIONS_TOGGLE, {bubbles: true, composed: true}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-sessions': CarSessions;
  }
}

if (!customElements.get('hp-car-sessions')) customElements.define('hp-car-sessions', CarSessions);
