// <hp-seg>: the kit's segmented control: a row of radio buttons, one chosen, in its own shadow root, with the radio group's keys in one place.
// Pattern: controlled component over a humble object (Meszaros, xUnit Test Patterns), after the WAI-ARIA Authoring Practices' radio group: `options` and `value` down, `change` up,
// one tab stop (roving tabindex) and the arrow keys, Home and End move the choice; `seg-keys.ts` decides where. The markup and rules are the legacy `.seg`'s own (styles/seg.css).
// Must not: keep the choice itself (its owner holds `value`), know what an option stands for, or send a command.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {moveTo, tabStop} from './seg-keys.ts';
import segOwn from './seg.element.css?inline';
import {common, seg} from './styles/index.ts';
import {forShadow} from './styles/host.ts';

/** One option: the value it chooses, its word, a smaller word under it, and whether it can be chosen. */
export interface SegOption<V extends string = string> {
  value: V;
  label: string;
  sub?: string;
  disabled?: boolean;
}

/** What the group says when an option is chosen, by a tap or a key: the value now asked for. */
export interface SegChangeDetail<V extends string = string> {
  value: V;
}

export class HpSeg extends LitElement {
  static override properties = {
    options: {attribute: false},
    value: {},
    label: {},
    disabled: {type: Boolean, reflect: true},
  };
  /** The options, in order. */
  declare options: readonly SegOption[];
  /** The value chosen, as its owner holds it; the option with it is the one with `aria-checked`. */
  declare value: string | undefined;
  /** What a screen reader calls the group. */
  declare label: string | undefined;
  /** The whole group is read-only: no option can be chosen, and the unchosen ones are muted. */
  declare disabled: boolean;

  // The kit's `.seg` rules, adopted whole; the element's own, its `:host` and the read-only look, are in seg.element.css.
  static override styles = [common, seg, unsafeCSS(forShadow(segOwn))];

  constructor() {
    super();
    // `glass` comes from the shell as a host attribute the kit's rules test
    new AppearanceConsumer(this);
    this.options = [];
    this.value = undefined;
    this.label = undefined;
    this.disabled = false;
  }

  protected override render() {
    const {disabled} = this;
    const checked = this.checkedIndex;
    const stop = tabStop(this.options.map((option, index) => ({...option, checked: index === checked})));
    return html`<div
      class="seg"
      role="radiogroup"
      aria-label=${this.label ?? nothing}
      aria-disabled=${disabled ? 'true' : 'false'}
      @keydown=${this.onKey}
    >
      ${repeat(
        this.options,
        ({value}) => value,
        ({value, label, sub, disabled: off}, index) =>
          html`<button
            type="button"
            role="radio"
            aria-checked=${index === checked ? 'true' : 'false'}
            tabindex=${index === stop ? 0 : -1}
            ?disabled=${disabled || off}
            @click=${() => this.choose(value)}
          >
            <b>${label}</b>${sub ? html`<small>${sub}</small>` : nothing}
          </button>`,
      )}
    </div>`;
  }

  // where the owner's `value` sits among the options, -1 when it names none
  private get checkedIndex(): number {
    return this.options.findIndex(({value}) => value === this.value);
  }

  // a tap says its option, even the one already chosen: the owner may send the value again, as the legacy buttons did
  private choose(value: string): void {
    this.dispatchEvent(new CustomEvent<SegChangeDetail>('change', {detail: {value}}));
  }

  // an arrow, Home or End moves the choice and the focus together, as a native radio group does
  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.disabled) return;
    // the buttons are the options, one for one: the focused one is where a key starts, else the chosen one
    const buttons = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('button[role="radio"]')];
    const focused = buttons.findIndex(button => button === this.shadowRoot?.activeElement);
    const from = focused >= 0 ? focused : this.checkedIndex;
    const to = moveTo(this.options, Math.max(from, 0), e.key);
    if (to === null) return;
    e.preventDefault();
    buttons[to]?.focus();
    if (this.options[to].value !== this.value) this.choose(this.options[to].value);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-seg': HpSeg;
  }
}

if (!customElements.get('hp-seg')) customElements.define('hp-seg', HpSeg);
