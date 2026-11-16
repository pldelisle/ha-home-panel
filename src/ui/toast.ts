// <hp-toast>: the short message at the bottom of the screen: a done toast in the frame's colours, a failure in red with Dismiss.
// Pattern: humble object (Meszaros, xUnit Test Patterns): it draws `message` and `sticky` and says a tap by `toast-dismiss`
// (Lit docs, Events); when it goes is the shell's, through the pure schedule in toast-schedule.ts.
// Must not: run a timer, hide itself, word a message, or listen for `ToastEvent` (the shell does).
import {LitElement, html, unsafeCSS} from 'lit';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {common} from './styles/index.ts';
import {forShadow} from './styles/host.ts';
import toastOwn from './toast.element.css?inline';

export class HpToast extends LitElement {
  static override properties = {
    open: {type: Boolean, reflect: true},
    message: {},
    sticky: {type: Boolean, reflect: true},
    dismissLabel: {attribute: 'dismiss-label'},
  };
  /** On screen; the owner sets it from its schedule. */
  declare open: boolean;
  /** Already in the panel's language. */
  declare message: string;
  /** A failure: red, read out at once (`role="alert"`), with a Dismiss button; it stays until it is tapped. */
  declare sticky: boolean;
  /** The Dismiss button's text, already in the panel's language. */
  declare dismissLabel: string;

  // `display: contents`, and `position: fixed` inside: the host takes no room where the shell puts it.
  // The element's own rules, in the frame's terms (`.app.gl`), are in toast.element.css; AppearanceConsumer reflects the frame's state.
  static override styles = [common, unsafeCSS(forShadow(toastOwn))];

  constructor() {
    super();
    // `glass` and `compact` come from the shell as host attributes: the glass toast's look and its place above the phone's bar test them
    new AppearanceConsumer(this);
    this.open = false;
    this.message = '';
    this.sticky = false;
    this.dismissLabel = '';
  }

  // A tap anywhere on it dismisses it, a done one too, as the legacy toast did; the button is there to say so.
  protected override render() {
    return html`<div
      class="toast ${this.sticky ? 'err' : ''}"
      id="toast"
      role=${this.sticky ? 'alert' : 'status'}
      aria-live="polite"
      ?hidden=${!this.open}
      @click=${this.dismiss}
    >
      ${
        this.sticky
          ? html`<span>${this.message}</span><button type="button" class="tdis">${this.dismissLabel}</button>`
          : this.message
      }
    </div>`;
  }

  private readonly dismiss = (): void => {
    this.dispatchEvent(new CustomEvent('toast-dismiss', {bubbles: true, composed: true}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-toast': HpToast;
  }
}

if (!customElements.get('hp-toast')) customElements.define('hp-toast', HpToast);
