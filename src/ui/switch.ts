// <hp-switch>: the kit's on/off switch, a `button[role=switch]` in its own shadow root.
// Pattern: controlled component over a humble object (Meszaros, xUnit Test Patterns): it draws `checked` and tells its
// owner what a tap asks for by `change` (Lit docs, Events); the owner holds the optimistic value and sets `checked` back.
// A known copy: its look duplicates the legacy `.sw` rules until #263 deletes the last of them (switch.element.css).
// Must not: flip `checked` itself, send a service call, or know what it stands for (a light, a charger, a purifier).
import {LitElement, html, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {common} from './styles/index.ts';
import switchOwn from './switch.element.css?inline';

/** What the switch says when it is tapped, or Space or Enter is pressed on it: the state it asks for. */
export interface SwitchChangeDetail {
  checked: boolean;
}

export class HpSwitch extends LitElement {
  static override properties = {
    checked: {type: Boolean, reflect: true},
    disabled: {type: Boolean, reflect: true},
    label: {},
  };
  /** On or off, as the owner says; reflected, so the owner's own markup and the tests can read it. */
  declare checked: boolean;
  declare disabled: boolean;
  /** What a screen reader calls the switch (its `aria-label`): the owner words it, since the switch knows no subject. */
  declare label: string | undefined;

  // `display: contents`: the host has no box of its own, so the button is a child of whatever lays the row out
  static override styles = [common, unsafeCSS(switchOwn)];

  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
  }

  protected override render() {
    return html`<button
      type="button"
      class="switch"
      role="switch"
      aria-checked=${this.checked ? 'true' : 'false'}
      aria-label=${ifDefined(this.label)}
      ?disabled=${this.disabled}
      @click=${this.toggle}
    ></button>`;
  }

  // The button turns Space and Enter into a click, so this one listener covers a tap and the keyboard. The event leaves the
  // shadow root (`composed`) and says the state asked for, where the platform's own `change` has no detail.
  private readonly toggle = (): void => {
    this.dispatchEvent(
      new CustomEvent<SwitchChangeDetail>('change', {bubbles: true, composed: true, detail: {checked: !this.checked}}),
    );
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-switch': HpSwitch;
  }
}

if (!customElements.get('hp-switch')) customElements.define('hp-switch', HpSwitch);
