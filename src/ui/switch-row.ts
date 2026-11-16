// <hp-switch-row>: the kit's row of a switch: a heading and a line of words on a tile, and the kit's `<hp-switch>` at its end.
// Pattern: controlled component over a humble object (Meszaros, xUnit Test Patterns): it draws what its owner says and lets the switch's `change` (which crosses the shadow root) go up to it;
// the owner holds the optimistic value and sets `checked` back. It is the legacy `.tgl` row, which the Car's charger and comfort cards drew three times and which every later row of the kind can use.
// Must not: flip `checked` itself, send a service call, or know what it stands for (a charger, a departure schedule).
import {LitElement, html, unsafeCSS} from 'lit';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {common} from './styles/index.ts';
import {forShadow} from './styles/host.ts';
import './switch.ts'; // defines <hp-switch>
import switchRowOwn from './switch-row.element.css?inline';

export class HpSwitchRow extends LitElement {
  static override properties = {
    heading: {},
    line: {},
    checked: {type: Boolean},
    disabled: {type: Boolean},
    label: {},
  };
  /** The row's bold line. */
  declare heading: string;
  /** What it says under it: the state in words. */
  declare line: string;
  declare checked: boolean;
  declare disabled: boolean;
  /** What a screen reader calls the switch: the owner words it, since the row knows no subject. */
  declare label: string | undefined;

  // The element's own rules, the tile and its two lines, are in switch-row.element.css.
  static override styles = [common, unsafeCSS(forShadow(switchRowOwn))];

  constructor() {
    super();
    this.heading = '';
    this.line = '';
    this.checked = false;
    this.disabled = false;
    this.label = undefined;
    // `glass` comes from the shell as a host attribute the row's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    return html`<div class="row">
      <div class="tx"><b>${this.heading}</b><span>${this.line}</span></div>
      <hp-switch .checked=${this.checked} .disabled=${this.disabled} .label=${this.label}></hp-switch>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-switch-row': HpSwitchRow;
  }
}

if (!customElements.get('hp-switch-row')) customElements.define('hp-switch-row', HpSwitchRow);
