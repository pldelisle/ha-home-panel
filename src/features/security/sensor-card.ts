// <hp-sensor-card>: the Security tab's doors and motion: a chip per sensor, doors first, with its state and what follows it, and the doors' line.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `sensors` view, chips keyed by id (Lit docs, repeat);
// a tap asks the shell for the sensor's history sheet (ADR 0021).
// Must not: read an entity or the clock, word a string, or open the sheet (it asks).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {repeat} from 'lit/directives/repeat.js';
import type {SecurityViewModel, SensorRow} from './model.ts';
import {sensorStatus} from './sensor-status.ts';
import {HISTORY_SHEET} from './sheets.ts';
import cardOwn from './sensor-card.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import {lens} from '../../ui/lens.ts';
import {common, status} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class SensorCard extends LitElement {
  static override properties = {
    view: {attribute: false},
  };
  /** The model's sensors: the title, the doors' line and the rows. The pane places the card only when there is a sensor (`hidden`): the card does not test it again. */
  declare view: SecurityViewModel['sensors'] | undefined;

  // The element's own rules, the card's chrome as the host's and what only its tree has, are in sensor-card.element.css.
  static override styles = [common, status, unsafeCSS(forShadow(cardOwn))];

  constructor() {
    super();
    // `glass` and `compact` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {line} = view;
    // the box is an inner element: the glass's lens is looked up from the root the rule's element is in, and a host is in the pane's
    return html`<div class="sencard">
        <div class="top">
          <span class="lbl">${view.title}</span
          ><span class="right"
            >${line ? (line.warn ? html`<b class="warn">${line.text}</b>` : line.text) : nothing}</span
          >
        </div>
        <div class="sgrid">
          ${repeat(
            view.rows,
            row => row.id,
            row => this.renderChip(row),
          )}
        </div>
      </div>
      ${lens}`;
  }

  // a sensor that is off the air has the tone `off`, which dims it; the icon is the door's or the walker's
  private renderChip(row: SensorRow) {
    // lit-analyzer does not know `aria-description` (a screen reader reads it after the name); the ignore covers this one tag
    return html`<!-- @ts-ignore -->
      <button
        type="button"
        class=${classMap({schip: true, warn: row.tone === 'warn', act: row.tone === 'act', off: row.tone === 'off'})}
        data-id=${row.id}
        aria-description=${row.label}
        @click=${this.open}
      >
        <span class="sic">${ico(row.kind === 'door' ? 'door' : 'walk', 17)}</span>
        <div>
          <b>${row.name}</b><span><em>${sensorStatus(row)}</em>${row.sub ? ` · ${row.sub}` : nothing}</span>
        </div>
      </button>`;
  }

  // an arrow field, so the template hands the same function at every render
  private readonly open = (e: Event): void => {
    const id = (e.currentTarget as HTMLElement).dataset.id;
    if (id) this.dispatchEvent(new SheetRequestEvent(HISTORY_SHEET, {id}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-sensor-card': SensorCard;
  }
}

if (!customElements.get('hp-sensor-card')) customElements.define('hp-sensor-card', SensorCard);
