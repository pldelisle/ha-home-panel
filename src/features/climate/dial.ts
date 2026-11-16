// <hp-dial>: the phone's thermostat dial: a 270 degree track, ticks, the arc to the setpoint, a knob at it and a dot at the reading, the figure at its centre.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing `dialGeometry`'s numbers with `svg` templates (as Energy's power flow does) and the model's words;
// a slider (`role="slider"` with `aria-valuemin/max/now/text`) while `editable`, else an image. It draws in on its first render (`in`, motion.css's old rule).
// Must not: compute a path, word anything, or take a pointer or a key yet (the drag, the arrows and the command that follows are #248's).
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import dialOwn from './dial.element.css?inline';
import {DIAL_SIZE, type DialGeometry} from './dial-geometry.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The arc's colours, from the cool end to the warm: the legacy dial's own, which no theme changes. */
const ARC_STOPS = [
  [0, '#5B8FD0'],
  [0.38, '#7FB3A0'],
  [0.64, '#E2C07A'],
  [1, '#D4763F'],
] as const;

export class Dial extends LitElement {
  static override properties = {
    geometry: {attribute: false},
    editable: {type: Boolean},
    lo: {type: Number},
    hi: {type: Number},
    value: {type: Number},
    label: {},
    big: {},
    caption: {},
    valueText: {},
  };
  /** The drawing, from `dialGeometry`. */
  declare geometry: DialGeometry | undefined;
  /** The setpoint can be moved: the thermostat is on. */
  declare editable: boolean;
  /** The scale's ends, which the slider says. */
  declare lo: number;
  declare hi: number;
  /** The setpoint the knob stands for; absent while it is unknown. */
  declare value: number | undefined;
  /** The slider's name, or the image's. */
  declare label: string;
  /** The centre's figure and the line under it. */
  declare big: string;
  declare caption: string;
  /** What a screen reader says of the slider's value. */
  declare valueText: string;

  // The element's own rules, the dial's box, its drawing and the centre's text, and the motion of its first draw, are in dial.element.css.
  static override styles = [common, unsafeCSS(forShadow(dialOwn))];

  /** True until the first update is done: the arc, the knob and the figure arrive with the motion only once, as the legacy dial's first draw. */
  private fresh = true;

  constructor() {
    super();
    this.geometry = undefined;
    this.editable = false;
    this.lo = 0;
    this.hi = 0;
    this.value = undefined;
    this.label = '';
    this.big = '';
    this.caption = '';
    this.valueText = '';
  }

  protected override render() {
    const {geometry, editable} = this;
    if (!geometry) return nothing;
    return html`<div
      class=${classMap({dial: true, ed: editable, in: this.fresh})}
      role=${editable ? 'slider' : 'img'}
      tabindex=${ifDefined(editable ? 0 : undefined)}
      aria-valuemin=${ifDefined(editable ? this.lo : undefined)}
      aria-valuemax=${ifDefined(editable ? this.hi : undefined)}
      aria-valuenow=${ifDefined(editable ? this.value : undefined)}
      aria-valuetext=${ifDefined(editable ? this.valueText : undefined)}
      aria-label=${this.label}
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
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-dial': Dial;
  }
}

if (!customElements.get('hp-dial')) customElements.define('hp-dial', Dial);
