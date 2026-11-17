// <hp-light-slider>: one of the room sheet's two tall pills, brightness or colour temperature: the finger's height is the value.
// Pattern: controlled component over a humble object (Meszaros, xUnit Test Patterns): it draws the model's `SliderView`, paints the value
// under the finger itself while a pointer is captured (the legacy `lpVal` and `lpPaint`), and says `slider-change` once, on release or per arrow
// key; `drag-start` and `drag-end` let the pane hold its store meanwhile, so an update cannot move the pill under the finger.
// Must not: send a service call, read the store or an entity, or word a value itself (the pane's `word` does).
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {styleMap} from 'lit/directives/style-map.js';
import type {SliderView} from './model.ts';
import sliderOwn from './light-slider.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {ico} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The two pills: brightness in percent, colour temperature in kelvin. */
export type SliderKind = 'br' | 'ct';
/** The colour pill's gradient, warm at the bottom to cool at the top. */
export interface Gradient {
  warm: string;
  mid: string;
  cool: string;
}

/** The value a release or an arrow key asks for. */
export class SliderChangeEvent extends CustomEvent<{kind: SliderKind; value: number}> {
  constructor(kind: SliderKind, value: number) {
    super('slider-change', {bubbles: true, composed: true, detail: {kind, value}});
  }
}

/** An arrow key's step: ten percent, or 100 K. */
const KEY_STEP: Record<SliderKind, number> = {br: 10, ct: 100};
/** The colour pill moves in 50 K steps. */
const KELVIN_STEP = 50;
const KEYS: Readonly<Record<string, number>> = {ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class LightSlider extends LitElement {
  static override properties = {
    kind: {},
    slider: {attribute: false},
    off: {type: Boolean},
    night: {type: Boolean},
    gradient: {attribute: false},
    word: {attribute: false},
    live: {state: true},
    dragging: {state: true},
  };
  declare kind: SliderKind;
  declare slider: SliderView | undefined;
  /** The brightness pill: the room is off, so the pill is dark. */
  declare off: boolean;
  /** The colour pill: Night is on, so the pill shows the Night look. */
  declare night: boolean;
  declare gradient: Gradient | undefined;
  /** The big value under the pill for a value painted under the finger, in the panel's language. */
  declare word: (value: number) => string;
  /** The value painted under the finger or by a key, until the next view; null shows the view's. */
  declare private live: number | null;
  declare private dragging: boolean;
  private pointer: number | null = null;

  // `display: contents`: the pill and its value are a column of the sheet's row.
  // The element's own rules, its `:host` and what only its tree has, are in light-slider.element.css.
  static override styles = [common, unsafeCSS(forShadow(sliderOwn))];

  constructor() {
    super();
    // `compact` and `glass` come from the shell as host attributes the pill's rules test
    new AppearanceConsumer(this);
    this.kind = 'br';
    this.slider = undefined;
    this.off = false;
    this.night = false;
    this.gradient = undefined;
    this.word = String;
    this.live = null;
    this.dragging = false;
  }

  // a new view takes over from a painted value, except under the finger
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('slider') && !this.dragging) this.live = null;
  }

  protected override render() {
    const s = this.slider;
    if (!s) return nothing;
    const br = this.kind === 'br';
    const value = this.live ?? s.value;
    const painted = this.live !== null;
    const text = painted ? this.word(value) : s.text;
    const fill = br ? `${value}%` : `${(((value - s.min) / (s.max - s.min)) * 100).toFixed(1)}%`;
    const look = br ? ((painted ? value === 0 : this.off) ? ' off' : '') : !painted && this.night ? ' night' : '';
    return html`<div class="lpc">
      <div
        class="lpill ${br ? 'lbr' : 'lct'}${look}${this.dragging ? ' drag' : ''}"
        data-lp=${this.kind}
        role="slider"
        tabindex="0"
        aria-label=${s.name}
        aria-valuemin=${s.min}
        aria-valuemax=${s.max}
        aria-valuenow=${value}
        aria-valuetext=${painted ? text : s.valueText}
        aria-disabled=${ifDefined(s.disabled ? 'true' : undefined)}
        style=${styleMap({
          '--v': fill,
          '--warm': this.gradient?.warm,
          '--mid': this.gradient?.mid,
          '--cool': this.gradient?.cool,
        })}
        @pointerdown=${this.onDown}
        @pointermove=${this.onMove}
        @pointerup=${this.onEnd}
        @pointercancel=${this.onEnd}
        @lostpointercapture=${this.onEnd}
        @keydown=${this.onKey}
      >
        ${
          br
            ? html`<span class="lpf"></span><span class="lpmx">${ico('lsun', 20)}</span
                ><span class="lpmn">${ico('bulb', 28)}</span>`
            : html`<span class="lphd"></span><span class="lpmx">${ico('lsnow', 18)}</span
                ><span class="lpmn">${ico('lflame', 18)}</span
                ><span class="lpnl">${this.night ? s.text : nothing}</span>`
        }
      </div>
      <div class="lpv"><b class="num">${text}</b><small>${s.label}</small></div>
    </div>`;
  }

  /** The value at the finger's height: the top is the most (`lpVal`), brightness in whole percent, colour in 50 K steps. */
  private valueAt(pill: HTMLElement, y: number): number {
    const s = this.slider!;
    const box = pill.getBoundingClientRect();
    const f = clamp((box.bottom - y) / box.height, 0, 1);
    return this.kind === 'br'
      ? Math.round(f * 100)
      : Math.round((s.min + f * (s.max - s.min)) / KELVIN_STEP) * KELVIN_STEP;
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.slider || this.slider.disabled || e.button > 0) return;
    e.preventDefault();
    const pill = e.currentTarget as HTMLElement;
    this.pointer = e.pointerId;
    this.dragging = true;
    try {
      pill.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that is already gone: its up or cancel follows
    }
    this.dispatchEvent(new Event('drag-start', {bubbles: true, composed: true}));
    this.live = this.valueAt(pill, e.clientY);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointer) return;
    e.preventDefault();
    this.live = this.valueAt(e.currentTarget as HTMLElement, e.clientY);
  };

  // a release sends the value under the finger (a tap is a press and a release at one point); a cancel, or a capture lost, sends nothing
  private readonly onEnd = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.dragging = false;
    if (e.type === 'pointerup' && this.live !== null) this.dispatchEvent(new SliderChangeEvent(this.kind, this.live));
    this.dispatchEvent(new Event('drag-end', {bubbles: true, composed: true}));
  };

  // the arrows step from where the pill stands and send at once
  private readonly onKey = (e: KeyboardEvent): void => {
    const s = this.slider;
    const dir = KEYS[e.key];
    if (!s || s.disabled || !dir) return;
    e.preventDefault();
    const value = clamp((this.live ?? s.value) + dir * KEY_STEP[this.kind], s.min, s.max);
    this.live = this.kind === 'br' ? value : Math.round(value / KELVIN_STEP) * KELVIN_STEP;
    this.dispatchEvent(new SliderChangeEvent(this.kind, this.live));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-light-slider': LightSlider;
  }
  interface HTMLElementEventMap {
    'slider-change': SliderChangeEvent;
  }
}

if (!customElements.get('hp-light-slider')) customElements.define('hp-light-slider', LightSlider);
