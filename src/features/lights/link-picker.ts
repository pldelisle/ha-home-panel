// <hp-link-picker>: the room sheet's "Link with" list: Back to the room, None and every other room as radios, the current one checked.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `SheetView['picker']`, events up (Lit docs, Events); the list
// is pushed inside the sheet, the iOS way to pick one value, and Back takes focus when it is drawn, as the legacy `lightCmd('pick')` did.
// Must not: save a link or send a call (the pane does), read the store, or hold a string the household reads.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import type {SheetView} from './model.ts';
import pickerOwn from './link-picker.element.css?inline';
import rowsCss from './sheet-rows.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {ico} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** A room was picked to link with, `''` for none. */
export class LinkPickEvent extends CustomEvent<{key: string}> {
  constructor(key: string) {
    super('link-pick', {bubbles: true, composed: true, detail: {key}});
  }
}

export class LinkPicker extends LitElement {
  static override properties = {
    picker: {attribute: false},
  };
  declare picker: SheetView['picker'] | undefined;

  // the sheet's grouped rows, then the element's own rules (its `:host`, the header and the foot line)
  static override styles = [common, unsafeCSS(forShadow(rowsCss)), unsafeCSS(forShadow(pickerOwn))];

  constructor() {
    super();
    new AppearanceConsumer(this);
    this.picker = undefined;
  }

  // the list was pushed: Back takes focus, without the ring a key press would show
  protected override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('.lback')?.focus({preventScroll: true, focusVisible: false});
  }

  protected override render() {
    const p = this.picker;
    if (!p) return nothing;
    return html`<div class="lpkh">
        <button type="button" class="lback" data-l="back" @click=${this.onBack}>
          ${ico('chevl', 20)}<span>${p.back}</span></button
        ><b>${p.title}</b>
      </div>
      <div class="lgrp" role="radiogroup" aria-label=${p.title}>
        ${p.options.map(
          o =>
            html`<button
              type="button"
              class="lgr lopt"
              role="radio"
              aria-checked=${o.checked ? 'true' : 'false'}
              data-l="linkto"
              data-al=${o.key}
              @click=${() => this.dispatchEvent(new LinkPickEvent(o.key))}
            >
              <span class="tx"
                ><b>${o.name}</b
                ><small>${o.sub}${o.nowWith ? html` · <span class="lnow">${o.nowWith}</span>` : nothing}</small></span
              ><span class="lck" aria-hidden="true">${o.checked ? ico('check', 20) : nothing}</span>
            </button>`,
        )}
      </div>
      <p class="lfoot">${p.foot}</p>`;
  }

  private readonly onBack = (): void => {
    this.dispatchEvent(new Event('picker-back', {bubbles: true, composed: true}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-link-picker': LinkPicker;
  }
  interface HTMLElementEventMap {
    'link-pick': LinkPickEvent;
  }
}

if (!customElements.get('hp-link-picker')) customElements.define('hp-link-picker', LinkPicker);
