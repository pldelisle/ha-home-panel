// <hp-status-popup>: the Status popup under the header: one card per running activity, then the Status block (the checks' rows and the phrases of what is fine).
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing `liveModel`'s popup in the legacy `renderAttention()`'s markup; it is the shell's popup box
// (`.pop`, the shell opens and closes it as the popup `live.status`, before the settings in Escape's order) and wears `la` while it holds cards, as the legacy box did.
// Must not: read an entity or the clock but through `LiveReading`, word a string, or open or close itself (the shell binds `open` and `hidden`).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import './activity-card.ts'; // defines <hp-activity-card>
import type {CheckItem} from './checks.ts';
import {INITIAL_LIVE_STATE} from './done.ts';
import type {LiveViewModel} from './model.ts';
import {LiveReading} from './reading.ts';
import ownCss from './status-popup.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {common, list} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class StatusPopup extends LitElement {
  static override properties = {open: {type: Boolean}};
  /** Bound by the shell to whether it keeps the Status checks open: closed, it draws nothing and asks for no history. */
  declare open: boolean;

  static override styles = [common, list, unsafeCSS(forShadow(ownCss))];

  private readonly appearance = new AppearanceConsumer(this);
  private readonly reading = new LiveReading(this, {active: () => this.open});
  private popup: LiveViewModel['popup'] | null = null;

  constructor() {
    super();
    this.open = false;
  }

  // the popup draws no pill, so it reads from the first state: its cards and checks do not depend on what the pill kept
  protected override willUpdate(): void {
    this.popup = this.open
      ? (this.reading.model(INITIAL_LIVE_STATE, this.appearance.value?.compact === true)?.popup ?? null)
      : null;
    this.classList.toggle('la', !!this.popup?.activities.length);
  }

  protected override render() {
    const {popup} = this;
    if (!popup) return nothing;
    const {activities, status} = popup;
    return html`<div class="list">
      ${repeat(
        activities,
        card => card.key,
        card => html`<hp-activity-card .view=${card} .ring=${card.ring}></hp-activity-card>`,
      )}
      <div class="lstat">
        <div class="top"><span class="lbl">${status.label}</span><span class="right">${status.right}</span></div>
        ${
          status.empty === null
            ? html`<div class="att">${status.items.map(item => this.row(item))}</div>`
            : html`<div class="muted" style="font-size:14px">${status.empty}</div>`
        }
        <div class="clear">${status.clear.map(phrase => html`<span>${phrase}</span>`)}</div>
      </div>
    </div>`;
  }

  private row({level, title, line}: CheckItem) {
    return html`<div class="arow">
      <span class="ic acc ${level}" style="--acc:var(--${level})">!</span>
      <div><b>${title}</b><span>${line}</span></div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-status-popup': StatusPopup;
  }
}

if (!customElements.get('hp-status-popup')) customElements.define('hp-status-popup', StatusPopup);
