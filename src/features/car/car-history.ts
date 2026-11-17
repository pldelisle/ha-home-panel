// <hp-car-history>: the Car tab's charging history row (docs/apple-hig-audit-car-2026-11-17.md, finding 8): the sessions and the kWh of the year, its cost, and the chevron that says it opens
// the history's sheet, which the pane draws (`<hp-car-history-sheet>` in the kit's `<hp-sheet>`) when the sheet host opens it.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `HistoryBlock`; events up (Lit docs, Events): a tap asks the host for `car.history` (ADR 0021), as any element's sheet is asked for.
// Must not: read an entity or the clock, word a string (the model did), hold the history (the pane's controller does), or draw the sheet (the pane does).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import ownCss from './car-history.element.css?inline';
import type {HistoryBlock} from './model.ts';
import {HISTORY_SHEET} from './sheets.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarHistoryRow extends LitElement {
  static override properties = {view: {attribute: false}, error: {attribute: false}};
  /** The model's history row. */
  declare view: HistoryBlock | undefined;
  /** Why the history did not load, in words; null when it did, or has not been asked. */
  declare error: string | null;

  static override styles = [common, unsafeCSS(forShadow(ownCss))];

  constructor() {
    super();
    this.view = undefined;
    this.error = null;
    // `glass` and `compact` come from the shell as host attributes the rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    return html`<button type="button" class="hist" @click=${this.show} aria-haspopup="dialog">
      ${ico('cal', 20)}<span class="tx"><b>${view.title}</b>${this.renderLine(view)}</span>
      ${view.value ? html`<span class="val num">${view.value}</span>` : nothing}
      <span class="chev" aria-hidden="true">${ico('chev', 18)}</span>
    </button>`;
  }

  // the row's line: why the history did not load when it did not (the live values still draw), else the year's sessions
  private renderLine(view: HistoryBlock) {
    if (this.error) return html`<small class="err">${this.error}</small>`;
    return view.line ? html`<small>${view.line}</small>` : nothing;
  }

  // an arrow field, so the template hands the same function at every render
  private readonly show = (): void => {
    this.dispatchEvent(new SheetRequestEvent(HISTORY_SHEET));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-history': CarHistoryRow;
  }
}

if (!customElements.get('hp-car-history')) customElements.define('hp-car-history', CarHistoryRow);
