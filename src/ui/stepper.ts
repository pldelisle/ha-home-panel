// <hp-stepper>: the kit's `−  value  +` control, two buttons round a value with a small word under it, in its own shadow root.
// Pattern: controlled component over a humble object (Meszaros, xUnit Test Patterns): it draws `value` and tells its owner the next one
// by `step-change` (Lit docs, Events; named beside `<hp-range-tabs>`' `range-change`, since `step` is the tap size); the owner holds the value, debounces and sends. Promoted from Media's speaker pod once Air's fan
// speed (steps of ten, minimum ten) was its second user with other bounds; the climate setpoint (spec 20) is the third.
// A known copy: its look duplicates the legacy `.stepper` rules (stepper.element.css) the legacy fan and climate controls still draw, until #234 (Air's deletion) and #248 (Climate move 7) delete them.
// Must not: keep the value itself, debounce or send a command, or know what it stands for (a volume, a fan, a setpoint).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {stepBy} from './steps.ts';
import {common} from './styles/index.ts';
import {forShadow} from './styles/host.ts';
import stepperOwn from './stepper.element.css?inline';

/** What the stepper says when a button is tapped: the value now asked for, kept between `min` and `max`. */
export interface StepDetail {
  value: number;
}

// the two glyphs are the same in every language: a screen reader says the buttons' labels, which the owner words
const MINUS = '−';
const PLUS = '+';

export class HpStepper extends LitElement {
  static override properties = {
    value: {type: Number},
    label: {},
    min: {type: Number},
    max: {type: Number},
    step: {type: Number},
    decrementLabel: {},
    incrementLabel: {},
    disabled: {type: Boolean, reflect: true},
    valueText: {},
  };
  /** The value as the owner holds it; a step starts from it. */
  declare value: number;
  /** The small word under the value. */
  declare label: string | undefined;
  /** The bounds: the − is disabled at `min` and below, the + at `max` and above. */
  declare min: number;
  declare max: number;
  /** What a tap adds or takes away. */
  declare step: number;
  /** What a screen reader calls the − and the +: the owner words them, since the stepper knows no subject. */
  declare decrementLabel: string | undefined;
  declare incrementLabel: string | undefined;
  /** Both buttons off, as when the thing it steps is unavailable. */
  declare disabled: boolean;
  /** What the bold line says in place of `value` ("40%", or the climate's "Off" at its frost guard). */
  declare valueText: string | undefined;

  // The host is the pill: a flex box of the two buttons and the value, so the owner lays it out as it would any item (`flex`, `order`).
  // It sets `role="group"`; its owner names the group with `aria-label` on the tag.
  // The element's own rules, its `:host` and what only its tree has, are in stepper.element.css.
  static override styles = [common, unsafeCSS(forShadow(stepperOwn))];

  constructor() {
    super();
    // `glass` comes from the shell as a host attribute the stepper's rules test
    new AppearanceConsumer(this);
    this.value = 0;
    this.min = 0;
    this.max = 100;
    this.step = 1;
    this.disabled = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
  }

  protected override render() {
    return html`<button
        type="button"
        class="step"
        part="button"
        aria-label=${ifDefined(this.decrementLabel)}
        ?disabled=${this.disabled || this.value <= this.min}
        @click=${this.onDown}
      >
        ${MINUS}
      </button>
      <div class="sv" part="value">
        <b class="num">${this.valueText ?? this.value}</b>${this.label ? html`<small>${this.label}</small>` : nothing}
      </div>
      <button
        type="button"
        class="step"
        part="button"
        aria-label=${ifDefined(this.incrementLabel)}
        ?disabled=${this.disabled || this.value >= this.max}
        @click=${this.onUp}
      >
        ${PLUS}
      </button>`;
  }

  private readonly onDown = (): void => this.ask(-this.step);
  private readonly onUp = (): void => this.ask(this.step);

  // the event does not bubble: the owner listens on the tag, as it does for `<hp-range-tabs>`
  private ask(delta: number): void {
    const value = stepBy(this.value, delta, this.min, this.max);
    this.dispatchEvent(new CustomEvent<StepDetail>('step-change', {detail: {value}}));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-stepper': HpStepper;
  }
  interface HTMLElementEventMap {
    'step-change': CustomEvent<StepDetail>;
  }
}

if (!customElements.get('hp-stepper')) customElements.define('hp-stepper', HpStepper);
