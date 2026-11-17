// <hp-dialog>: the kit's confirmation: a title, a line, optional slotted content, Cancel and a named action, in a native `<dialog>` opened with `showModal()` (ADR 0035).
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the platform's modal `<dialog>`: the browser gives the top layer, the inert page, the focus trap and its return; properties down (`open`, the words),
// events up (`dialog-confirm`, `dialog-cancel`), the owner holding what is asked (Lit docs, Events). Escape and a tap on the backdrop cancel; the shared rules are in dialogs.ts.
// Must not: send a service call, know what it confirms, open a sheet or another dialog, or hold a draft (an editor with Cancel and Save owns its own `<dialog>` and takes the look and `stopEscape` from dialogs.ts).
import {LitElement, html, nothing, type PropertyValues} from 'lit';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {closeOnBackdrop, dialogLook, stopEscape} from './dialogs.ts';
import {common} from './styles/index.ts';

export class HpDialog extends LitElement {
  static override properties = {
    open: {type: Boolean, reflect: true},
    heading: {},
    line: {},
    confirmLabel: {attribute: 'confirm-label'},
    cancelLabel: {attribute: 'cancel-label'},
  };
  /** On screen. Its owner binds it to what it asks; the dialog turns it false itself when a button, Escape or the backdrop closes it, and says so by an event. */
  declare open: boolean;
  /** The question, already in the panel's language. */
  declare heading: string;
  declare line: string;
  /** The primary button: the action named, not "OK" (HIG, Alerts). */
  declare confirmLabel: string;
  declare cancelLabel: string;

  // `display: contents` and the look are in dialog.element.css; the dialog is in the top layer, so the host takes no room.
  static override styles = [common, dialogLook];

  constructor() {
    super();
    this.open = false;
    this.heading = '';
    this.line = '';
    this.confirmLabel = '';
    this.cancelLabel = '';
    // `glass` and `compact` come from the shell as host attributes the rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    return html`<dialog aria-labelledby="t" @keydown=${stopEscape} @click=${closeOnBackdrop} @close=${this.onClose}>
      <h4 id="t" tabindex="-1" .autofocus=${true}>${this.heading}</h4>
      ${this.line ? html`<p>${this.line}</p>` : nothing}
      <slot></slot>
      <div class="btns">
        <button type="button" class="dbtn" @click=${() => this.finish('dialog-cancel')}>${this.cancelLabel}</button
        ><button type="button" class="dbtn prim" @click=${() => this.finish('dialog-confirm')}>
          ${this.confirmLabel}
        </button>
      </div>
    </dialog>`;
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>('dialog');
    if (!dialog) return;
    if (this.open && !dialog.open) dialog.showModal();
    else if (!this.open && dialog.open) dialog.close();
  }

  // the browser closed it (Escape, or the backdrop's `close()`): that is a cancel, said once; a close this element asked for already turned `open` false
  private readonly onClose = (): void => {
    if (this.open) this.finish('dialog-cancel');
  };

  private finish(event: 'dialog-confirm' | 'dialog-cancel'): void {
    this.open = false;
    this.renderRoot.querySelector<HTMLDialogElement>('dialog')?.close();
    this.dispatchEvent(new CustomEvent(event, {bubbles: true, composed: true}));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-dialog': HpDialog;
  }
}

if (!customElements.get('hp-dialog')) customElements.define('hp-dialog', HpDialog);
