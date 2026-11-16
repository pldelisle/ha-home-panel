// <hp-dial>: the phone's thermostat dial: a 270 degree track, ticks, the arc to the setpoint, a knob at it and a dot at the reading, the figure at its centre.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing `dialGeometry`'s numbers with `svg` templates (as Energy's power flow does) and the model's words; a slider (WAI-ARIA
// Authoring Practices) when `editable`: a drag, tracked by pointer capture, says `dial-input` with the value under the finger, and `dial-change` when it lifts; the arrow keys, Home and End say both. An image otherwise.
// It draws in on its first render (`in`). Must not: compute a path or a setpoint (the geometry's two functions do), word anything, hold the value (its owner does) or send a command.
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import dialOwn from './dial.element.css?inline';
import {DIAL_SIZE, dialValueFromKey, dialValueFromPointer, type DialGeometry} from './dial-geometry.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The arc's colours, from the cool end to the warm: the legacy dial's own, which no theme changes. */
const ARC_STOPS = [
  [0, '#5B8FD0'],
  [0.38, '#7FB3A0'],
  [0.64, '#E2C07A'],
  [1, '#D4763F'],
] as const;

/** What the dial says while it is dragged or keyed (`dial-input`) and when the drag lifts or a key is pressed (`dial-change`): the setpoint now asked for. */
export interface DialDetail {
  value: number;
}

export class Dial extends LitElement {
  static override properties = {
    geometry: {attribute: false},
    label: {},
    valueText: {},
    big: {},
    caption: {},
    editable: {type: Boolean},
    value: {type: Number},
    lo: {type: Number},
    hi: {type: Number},
  };
  /** The drawing, from `dialGeometry`. */
  declare geometry: DialGeometry | undefined;
  /** What a screen reader calls the slider, or describes the image as (the owner writes the value into the image's). */
  declare label: string;
  /** What a screen reader says of the slider's value ("21 degrees", "Off"). */
  declare valueText: string;
  /** The centre's figure and the line under it. */
  declare big: string;
  declare caption: string;
  /** The setpoint can be moved: a slider, not an image. */
  declare editable: boolean;
  /** The setpoint as its owner holds it (`lo` while off) and the ends of the scale. */
  declare value: number;
  declare lo: number;
  declare hi: number;

  // The element's own rules, the dial's box, its drawing and the centre's text, and the motion of its first draw, are in dial.element.css.
  static override styles = [common, unsafeCSS(forShadow(dialOwn))];

  /** True until the first update is done: the arc, the knob and the figure arrive with the motion only once, as the legacy dial's first draw. */
  private fresh = true;
  /** The value the finger last asked for while a drag is on; null when none is. */
  private dragging: number | null = null;

  constructor() {
    super();
    this.geometry = undefined;
    this.label = '';
    this.valueText = '';
    this.big = '';
    this.caption = '';
    this.editable = false;
    this.value = 0;
    this.lo = 0;
    this.hi = 0;
  }

  protected override render() {
    const {geometry} = this;
    if (!geometry) return nothing;
    const {editable} = this;
    return html`<div
      class=${classMap({dial: true, ed: editable, in: this.fresh})}
      role=${editable ? 'slider' : 'img'}
      aria-label=${this.label}
      tabindex=${ifDefined(editable ? 0 : undefined)}
      aria-valuemin=${ifDefined(editable ? this.lo : undefined)}
      aria-valuemax=${ifDefined(editable ? this.hi : undefined)}
      aria-valuenow=${ifDefined(editable ? this.value : undefined)}
      aria-valuetext=${ifDefined(editable ? this.valueText : undefined)}
      @pointerdown=${this.onDown}
      @pointermove=${this.onMove}
      @pointerup=${this.onEnd}
      @pointercancel=${this.onEnd}
      @keydown=${this.onKey}
    >
      <svg viewBox=${`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`} aria-hidden="true">
        <defs>
          <linearGradient id="dialg" x1="0" x2="1" y1="0" y2="0">
            ${ARC_STOPS.map(([offset, color]) => svg`<stop offset=${offset} stop-color=${color} />`)}
          </linearGradient>
        </defs>
        <path class="dtrack" d=${geometry.track} />
        ${geometry.active === null ? nothing : svg`<path class="dact" stroke="url(#dialg)" d=${geometry.active} />`}
        <g class="dticks">
          ${geometry.ticks.map(
            ({x1, y1, x2, y2, major}) =>
              svg`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke-width=${major ? 2.5 : 1.5} />`,
          )}
        </g>
        ${geometry.now === null ? nothing : svg`<circle class="dnow" cx=${geometry.now.cx} cy=${geometry.now.cy} r="5" />`}
        ${geometry.knob === null ? nothing : svg`<circle class="dknob" cx=${geometry.knob.cx} cy=${geometry.knob.cy} r="14" />`}
      </svg>
      <div class="dialc"><b class="num">${this.big}</b><small>${this.caption}</small></div>
    </div>`;
  }

  // a later update draws without the motion, as the legacy dial did on every redraw after the first
  protected override updated(): void {
    this.fresh = false;
  }

  // the setpoint under the pointer, from the drawing's own box: a value at or below the frost guard is the lowest setpoint, as the legacy dial's
  private valueAt(e: PointerEvent): number {
    const box = this.renderRoot.querySelector('svg')?.getBoundingClientRect();
    const {lo, hi} = this;
    const value = box ? dialValueFromPointer(box, e.clientX, e.clientY, lo, hi) : lo;
    return value === 'off' ? lo : value;
  }

  // a press captures the pointer on the dial, so the drag goes on outside its box, and asks for the value under it
  private readonly onDown = (e: PointerEvent): void => {
    if (!this.editable || e.button) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.drag(this.valueAt(e));
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (this.dragging === null) return;
    const value = this.valueAt(e);
    if (value !== this.dragging) this.drag(value);
  };

  // the finger lifts (or the system takes the pointer): the value it rested on is the one asked for
  private readonly onEnd = (): void => {
    const {dragging} = this;
    if (dragging === null) return;
    this.dragging = null;
    this.dispatchEvent(new CustomEvent<DialDetail>('dial-change', {detail: {value: dragging}}));
  };

  private drag(value: number): void {
    this.dragging = value;
    this.dispatchEvent(new CustomEvent<DialDetail>('dial-input', {detail: {value}}));
  }

  // a key is a whole gesture: the value it asks for is input and change at once
  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.editable) return;
    const value = dialValueFromKey(e.key, this.value, this.lo, this.hi);
    if (value === null) return;
    e.preventDefault();
    this.dispatchEvent(new CustomEvent<DialDetail>('dial-input', {detail: {value}}));
    this.dispatchEvent(new CustomEvent<DialDetail>('dial-change', {detail: {value}}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-dial': Dial;
  }
  interface HTMLElementEventMap {
    'dial-input': CustomEvent<DialDetail>;
    'dial-change': CustomEvent<DialDetail>;
  }
}

if (!customElements.get('hp-dial')) customElements.define('hp-dial', Dial);
