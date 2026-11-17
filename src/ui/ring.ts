// <hp-ring>: a round progress around an icon, in a colour: the live pill's ring, its bubbles and its cards' heads, later the smart stack's.
// Pattern: humble object (Meszaros, xUnit Test Patterns) of the kit: two circles as the legacy `ring()` drew them (a tinted disc, then the arc's
// dash), its numbers bound as attributes so a new value moves the arc and redraws nothing else (Lit docs, Templates); the look is ring.css.
// Must not: know what it measures, word anything (the parent's label speaks for it), or import a feature or the shell.
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {styleMap} from 'lit/directives/style-map.js';
import {ico, type IconName} from './icons.ts';
import ringOwn from './ring.element.css?inline';
import {common, ring} from './styles/index.ts';

/** The arc never quite vanishes: a value under 2 percent draws 2 percent, as the legacy ring did. */
const MIN_ARC = 0.02;
/** The stroke's width and the inset of the circle from the box's edge, in pixels. */
const STROKE = 3;
const INSET = 2.5;

export class Ring extends LitElement {
  static override properties = {value: {type: Number}, color: {}, size: {type: Number}, icon: {}};
  /** How far along, 0 to 1 (clamped); null draws the disc alone. */
  declare value: number | null;
  /** A CSS colour: the arc, the icon and the disc's tint. */
  declare color: string;
  /** The box's side, in pixels. */
  declare size: number;
  declare icon: IconName | undefined;

  static override styles = [common, ring, unsafeCSS(ringOwn)];

  constructor() {
    super();
    this.value = null;
    this.color = 'currentColor';
    this.size = 34;
    this.icon = undefined;
  }

  protected override render() {
    const {size, color, icon} = this;
    const center = size / 2;
    const r = center - INSET;
    const around = 2 * Math.PI * r;
    const p = this.value === null ? null : Math.max(MIN_ARC, Math.min(1, this.value));
    return html`<span class="lring" style=${styleMap({'--ac': color, width: `${size}px`, height: `${size}px`})}
      ><svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
        ${svg`<circle cx=${center} cy=${center} r=${r} fill="color-mix(in srgb,${color} 16%,transparent)" stroke="color-mix(in srgb,${color} 22%,transparent)" stroke-width=${STROKE}></circle>`}
        ${
          p === null
            ? nothing
            : svg`<circle cx=${center} cy=${center} r=${r} fill="none" stroke=${color} stroke-width=${STROKE} stroke-linecap="round" stroke-dasharray="${(around * p).toFixed(1)} ${around.toFixed(1)}"></circle>`
        }</svg
      ><span class="li">${icon ? ico(icon, Math.round(size * 0.5)) : nothing}</span></span
    >`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-ring': Ring;
  }
}

if (!customElements.get('hp-ring')) customElements.define('hp-ring', Ring);
