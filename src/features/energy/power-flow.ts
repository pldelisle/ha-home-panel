// <hp-power-flow>: the live power flow of the house: five rings joined by four lines whose dashes run with the power, and the captions.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over pure geometry (Climate's dial, #242, and Car's bars, #249, will follow): `flowLayout`
// returns the numbers and the texts, and this element places them with `svg` templates, binding attributes so the one SVG is never rebuilt.
// Must not: compute a position, a width or a word (the layout does), or restart the dash animation on an update that left a connector's power as it was.
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {repeat} from 'lit/directives/repeat.js';
import type {FlowConnector, FlowGeometry, FlowNode, FlowText} from './flow-layout.ts';
import ownCss from './power-flow.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class PowerFlow extends LitElement {
  static override properties = {geometry: {attribute: false}};
  /** The model's flow: the rings, the lines, the pulse and the captions. */
  declare geometry: FlowGeometry | undefined;

  // The element's own rules, the drawing's texts and the dashes' motion, are in power-flow.element.css.
  static override styles = [common, unsafeCSS(forShadow(ownCss))];

  constructor() {
    super();
    this.geometry = undefined;
    new AppearanceConsumer(this);
  }

  protected override render() {
    const flow = this.geometry;
    if (!flow) return nothing;
    // the lines first, then the rings, then the captions: a ring covers the end of a line, as in the legacy drawing
    return html`<svg viewBox="0 0 ${flow.width} ${flow.height}" role="img" aria-label=${flow.label}>
      ${repeat(flow.connectors, c => c.key, this.line)}
      ${
        flow.pulse
          ? svg`<circle class="pulse" cx=${flow.pulse.cx} cy=${flow.pulse.cy} r=${flow.pulse.r} fill="none" stroke=${flow.pulse.color} stroke-width="3" />`
          : nothing
      }
      ${repeat(flow.nodes, n => n.key, this.ring)} ${flow.labels.map(this.caption)}
    </svg>`;
  }

  // One template per kind, bound on every attribute that moves: a line that keeps its power keeps its class and its duration, so the
  // browser keeps the animation running. `ifDefined` drops the style of a line that is off.
  private readonly line = (c: FlowConnector) =>
    svg`<line
      x1=${c.x1}
      y1=${c.y1}
      x2=${c.x2}
      y2=${c.y2}
      stroke=${c.on ? c.color : 'var(--ring)'}
      stroke-width=${c.width}
      class=${c.on ? 'run' : ''}
      style=${ifDefined(c.duration === null ? undefined : `animation-duration:${c.duration}`)}
    />`;

  private readonly ring = (n: FlowNode) =>
    svg`<g>
      <circle
        cx=${n.cx}
        cy=${n.cy}
        r=${n.r}
        fill="var(--card)"
        stroke=${n.on ? n.color : 'var(--ring)'}
        stroke-width=${n.strokeWidth}
      />
      ${n.texts.map(this.caption)}
    </g>`;

  private readonly caption = ({x, y, text, anchor, kind, size, unit}: FlowText) =>
    svg`<text x=${x} y=${y} text-anchor=${anchor} class=${kind} font-size=${ifDefined(size)}>${text}${unit === undefined ? '' : svg`<tspan dx="3" font-size="16">${unit}</tspan>`}</text>`;
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-power-flow': PowerFlow;
  }
}

if (!customElements.get('hp-power-flow')) customElements.define('hp-power-flow', PowerFlow);
