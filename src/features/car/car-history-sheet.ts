// <hp-car-history-sheet>: what the charging history's sheet holds (docs/apple-hig-audit-car-2026-11-17.md, finding 8): the last 30 days as bars, the sessions (`<hp-car-sessions>`: the
// months' chart and the table) and the last plug-in; with no session in the year, the sentence that says so and no empty chart or table.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `HistoryBlock`, `SessionsBlock` and `LastBlock`; the pane draws it inside the kit's `<hp-sheet>`, which the sheet host
// opens (ADR 0021), and only while the sheet is open, so a closed sheet holds no chart. The sessions' toggle crosses the root as it did (`sessions-toggle`, composed), and the pane keeps it.
// Must not: read an entity or the clock, word a string or place a bar (the model and `barsGeometry` did), or open or close the sheet (the row asks, the host answers).
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import type {Bar} from './bars-geometry.ts';
import ownCss from './car-history-sheet.element.css?inline';
import './car-last-plug.ts'; // defines <hp-car-last-plug>
import './car-sessions.ts'; // defines <hp-car-sessions>
import type {DailyBars, HistoryBlock, LastBlock, SessionsBlock} from './model.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** One bar: the series' colour where something was charged, the neutral ring where not, and the day and kWh a pointer or a screen reader finds in its title. */
const barOf = ({x, y, width, height, filled}: Bar, title: string) =>
  svg`<rect x=${x} y=${y} width=${width} height=${height} rx="2" fill=${filled ? 'var(--c-ev)' : 'var(--ring)'}><title>${title}</title></rect>`;

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

  static override styles = [common, unsafeCSS(forShadow(ownCss))];

  constructor() {
    super();
    this.view = undefined;
    this.sessions = undefined;
    this.last = undefined;
    this.error = null;
    // `glass` and `compact` come from the shell as host attributes the rules test
    new AppearanceConsumer(this);
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

  // the bars the model's geometry places and its sentence under them; the colours are the frame's tokens, so a theme change redraws nothing
  private renderBars({geometry, label, titles, line}: DailyBars) {
    const {width, height, bars} = geometry;
    return html`<div class="bars">
      <svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label=${label}>
        ${bars.map((bar, index) => barOf(bar, titles[index]))}
      </svg>
      <p class="hline">${line}</p>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-history-sheet': CarHistorySheet;
  }
}

if (!customElements.get('hp-car-history-sheet')) customElements.define('hp-car-history-sheet', CarHistorySheet);
